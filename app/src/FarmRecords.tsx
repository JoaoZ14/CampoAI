import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Plus, X } from 'lucide-react';
import { api, createWriteRequest, errorMessage, jsonBody, rural, type Field, type Summary } from './api';

type Kind = 'operations' | 'expenses';
type FormKind = 'operation' | 'expense' | null;
type Period = '30' | '90' | 'all';
type OperationRow = { id: string; operation_type: string; operation_date: string; description: string; field_id?: string | null };
type ExpenseRow = { id: string; category: string; expense_date: string; description: string; amount: number; field_id?: string | null };
type ExpenseTotals = { amount: number; count: number; cost_per_ha: number | null };

const categories = [
  ['sementes', 'Sementes e mudas'],
  ['fertilizantes', 'Fertilizantes'],
  ['defensivos', 'Defensivos'],
  ['racao', 'Ração'],
  ['veterinaria', 'Veterinária'],
  ['combustivel', 'Combustível'],
  ['mao_de_obra', 'Mão de obra'],
  ['manutencao', 'Manutenção'],
  ['outros', 'Outros'],
] as const;
const categoryLabel = (value: string) => categories.find(([key]) => key === value)?.[1] || value.replaceAll('_', ' ');
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const day = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const message = errorMessage;

function listPath(farmId: string, kind: Kind, period: Period, fieldId: string, seasonId: string, offset = 0) {
  const query = new URLSearchParams();
  if (period !== 'all') {
    const from = new Date();
    from.setDate(from.getDate() - Number(period));
    query.set('from', `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`);
  }
  if (fieldId) query.set('field_id', fieldId);
  if (kind === 'expenses' && seasonId) query.set('crop_season_id', seasonId);
  if (offset) query.set('offset', String(offset));
  return rural(farmId, kind === 'expenses' ? `/farm_expenses?${query}` : `/farm_operations?${query}`);
}

export default function FarmRecords({ farmId, summary, online, initialForm, onSaved, onBusy }: {
  farmId: string;
  summary: Summary | null;
  online: boolean;
  initialForm: FormKind;
  onSaved: () => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const expensesEnabled = summary?.expenses != null;
  const [kind, setKind] = useState<Kind>(initialForm === 'expense' ? 'expenses' : 'operations');
  const [form, setForm] = useState<FormKind>(initialForm);
  const write = useRef(createWriteRequest());
  const pending = useRef(false);
  const pagination = useRef<AbortController | null>(null);
  const [period, setPeriod] = useState<Period>('90');
  const [fieldId, setFieldId] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [operations, setOperations] = useState<OperationRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [totals, setTotals] = useState<ExpenseTotals | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const fields = summary?.fields || [];
  const seasons = summary?.seasons || [];
  const rows = kind === 'expenses' ? expenses : operations;
  const filterKey = `${farmId}:${kind}:${period}:${fieldId}:${seasonId}`;
  const currentFilter = useRef(filterKey);
  currentFilter.current = filterKey;

  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);

  useEffect(() => {
    if (!initialForm) return;
    setForm(initialForm); setKind(initialForm === 'expense' ? 'expenses' : 'operations');
    const frame = requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [initialForm]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    pagination.current?.abort();
    setOperations([]); setExpenses([]); setTotals(null); setMore(false);
    if (kind === 'expenses' && !expensesEnabled) {
      setExpenses([]);
      setTotals(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const path = listPath(farmId, kind, period, fieldId, seasonId);
    const totalsPath = path.replace('/farm_expenses?', '/expenses/summary?');
    Promise.all([
      kind === 'expenses' ? api<ExpenseRow[]>(path, { signal: controller.signal }) : api<OperationRow[]>(path, { signal: controller.signal }),
      kind === 'expenses' ? api<ExpenseTotals>(totalsPath, { signal: controller.signal }) : Promise.resolve(null),
    ]).then(([page, nextTotals]) => {
      if (!active) return;
      if (kind === 'expenses') setExpenses(page as ExpenseRow[]);
      else setOperations(page as OperationRow[]);
      setTotals(nextTotals);
      setMore(page.length === 50);
    }).catch(cause => { if (active) setError(message(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); pagination.current?.abort(); };
  }, [farmId, kind, period, fieldId, seasonId, expensesEnabled, reload]);

  function openForm(next: Exclude<FormKind, null>) {
    if (pending.current) return;
    setKind(next === 'expense' ? 'expenses' : 'operations');
    setForm(next);
    write.current = createWriteRequest();
    setError('');
    setNotice('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online || pending.current || !form) return;
    const values = new FormData(event.currentTarget);
    const field = String(values.get('field_id') || '');
    const description = String(values.get('description') || '').trim();
    const recordDate = String(values.get('record_date') || '');
    if (!description || !/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
      setError('Informe a descrição e uma data válida.');
      return;
    }
    let payload: Record<string, unknown>;
    let path: string;
    if (form === 'expense') {
      const amount = Number(values.get('amount'));
      if (!Number.isFinite(amount) || amount <= 0) { setError('Informe um valor maior que zero.'); return; }
      const season = String(values.get('crop_season_id') || '');
      payload = { category: String(values.get('category')), description, amount, expense_date: recordDate, ...(field ? { field_id: field } : {}), ...(season ? { crop_season_id: season } : {}) };
      path = rural(farmId, '/farm_expenses');
    } else {
      payload = { operation_type: String(values.get('operation_type')), description, operation_date: recordDate, ...(field ? { field_id: field } : {}) };
      path = rural(farmId, '/farm_operations');
    }
    pending.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      await write.current(path, { method: 'POST', body: jsonBody(payload) });
      setNotice(form === 'expense' ? 'Despesa registrada. Ela já aparece no histórico do app.' : 'Atividade registrada. Ela já aparece no histórico do app.');
      setForm(null);
      setReload(value => value + 1);
      await onSaved();
    } catch (cause) { setError(message(cause)); }
    finally { pending.current = false; setBusy(false); }
  }

  async function loadMore() {
    if (pending.current || !online || loading) return;
    pending.current = true;
    const selected = filterKey;
    const controller = new AbortController();
    pagination.current = controller;
    setBusy(true); setError('');
    try {
      const path = listPath(farmId, kind, period, fieldId, seasonId, rows.length);
      if (kind === 'expenses') {
        const page = await api<ExpenseRow[]>(path, { signal: controller.signal });
        if (controller.signal.aborted || currentFilter.current !== selected) return;
        setExpenses(previous => [...previous, ...page]);
        setMore(page.length === 50);
      } else {
        const page = await api<OperationRow[]>(path, { signal: controller.signal });
        if (controller.signal.aborted || currentFilter.current !== selected) return;
        setOperations(previous => [...previous, ...page]);
        setMore(page.length === 50);
      }
    } catch (cause) { if (!controller.signal.aborted && currentFilter.current === selected) setError(message(cause)); }
    finally { pending.current = false; setBusy(false); }
  }

  return <section ref={sectionRef} className="records" aria-label="Registros da propriedade">
    <div className="records-heading"><div><h2>Registros do campo</h2><p>O que você registra aqui também fica no histórico de atividade.</p></div><div className="records-actions"><button className="button secondary" onClick={() => openForm('operation')} disabled={busy || !online}><Plus size={17}/> Atividade</button><button className="button primary" onClick={() => openForm('expense')} disabled={busy || !online || !expensesEnabled}><Plus size={17}/> Despesa</button></div></div>
    {!expensesEnabled && <p className="records-unavailable">Despesas ainda não estão disponíveis nesta conta. Você pode continuar registrando atividades.</p>}
    {form && <form className="panel stack-form records-form" onSubmit={save}>
      <div className="section-heading"><h2>{form === 'expense' ? 'Registrar despesa' : 'Registrar atividade'}</h2><button className="text-button" type="button" disabled={busy} onClick={() => setForm(null)}><X size={17}/> Fechar</button></div>
      {form === 'expense' && <div className="form-grid"><label>Categoria<select name="category" required defaultValue=""><option value="" disabled>Selecione</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Valor em reais<input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required placeholder="0,00" /></label></div>}
      {form === 'operation' && <label>Tipo de atividade<select name="operation_type" required defaultValue=""><option value="" disabled>Selecione</option><option value="manejo">Manejo</option><option value="irrigacao">Irrigação</option><option value="colheita">Colheita</option><option value="observacao">Observação</option><option value="outro">Outra atividade</option></select></label>}
      <label>Descrição<input name="description" required maxLength={240} placeholder={form === 'expense' ? 'Ex.: Compra de adubo para a horta' : 'Ex.: Irriguei o Talhão Norte'} /></label>
      <div className="form-grid"><label>Data<input name="record_date" type="date" required defaultValue={today()} /></label><label>Talhão <span className="optional">opcional</span><select name="field_id" defaultValue=""><option value="">Propriedade inteira</option>{fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label></div>
      {form === 'expense' && seasons.length > 0 && <label>Safra <span className="optional">opcional</span><select name="crop_season_id" defaultValue=""><option value="">Sem safra específica</option>{seasons.map(season => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>}
      <div className="records-form-footer"><p className="form-note">Revise os dados antes de salvar. Você poderá conferir o registro em Atividade.</p><button className="button primary" disabled={busy || !online}>{busy ? 'Salvando…' : form === 'expense' ? 'Salvar despesa' : 'Salvar atividade'}</button></div>
    </form>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {notice && <p className="notice success" role="status">{notice}</p>}
    <div className="records-toolbar"><div className="filter-tabs" role="group" aria-label="Tipo de registro"><button aria-pressed={kind === 'operations'} disabled={busy} className={kind === 'operations' ? 'selected' : ''} onClick={() => setKind('operations')}>Atividades</button><button aria-pressed={kind === 'expenses'} className={kind === 'expenses' ? 'selected' : ''} onClick={() => setKind('expenses')} disabled={busy || !expensesEnabled}>Despesas</button></div><div className="records-filters"><label>Período<select disabled={busy} aria-label="Período dos registros" value={period} onChange={event => setPeriod(event.target.value as Period)}><option value="30">30 dias</option><option value="90">90 dias</option><option value="all">Todo o histórico</option></select></label><label>Talhão<select disabled={busy} aria-label="Filtrar por talhão" value={fieldId} onChange={event => setFieldId(event.target.value)}><option value="">Todos</option>{fields.map((field: Field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>{kind === 'expenses' && seasons.length > 0 && <label>Safra<select disabled={busy} aria-label="Filtrar por safra" value={seasonId} onChange={event => setSeasonId(event.target.value)}><option value="">Todas</option>{seasons.map(season => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>}</div></div>
    {kind === 'expenses' && totals && <div className="records-total"><strong>{money(totals.amount)}</strong><span>{totals.count} despesa{totals.count === 1 ? '' : 's'} no filtro{totals.cost_per_ha != null ? ` · ${money(totals.cost_per_ha)}/ha` : ''}</span></div>}
    <div className="panel records-list"><div className="section-heading"><h2>{kind === 'expenses' ? 'Despesas' : 'Atividades'}</h2><span>Mais recentes primeiro</span></div>{loading ? <p className="muted" role="status">Carregando registros…</p> : !expensesEnabled && kind === 'expenses' ? <p className="muted">Despesas ainda não estão habilitadas nesta conta.</p> : error && !rows.length ? <div className="records-empty"><strong>Os registros não puderam ser carregados</strong><p>Tente novamente para conferir este período.</p><button className="button secondary" disabled={!online || busy} onClick={() => setReload(value => value + 1)}>Tentar novamente</button></div> : rows.length ? <ul>{rows.map(row => <li key={row.id}><div className="records-date">{day(kind === 'expenses' ? (row as ExpenseRow).expense_date : (row as OperationRow).operation_date)}</div><div className="records-row-main"><strong>{row.description}</strong><span>{kind === 'expenses' ? categoryLabel((row as ExpenseRow).category) : (row as OperationRow).operation_type.replaceAll('_', ' ')}{row.field_id ? ` · ${fields.find(field => field.id === row.field_id)?.name || 'Talhão'}` : ''}</span></div>{kind === 'expenses' && <strong className="records-amount">{money(Number((row as ExpenseRow).amount))}</strong>}</li>)}</ul> : <div className="records-empty"><strong>Nenhum registro nesse filtro</strong><p>Altere o período ou faça o primeiro registro acima.</p></div>}{more && !loading && <button className="load-more" disabled={busy || !online} onClick={() => void loadMore()}>Carregar mais <ArrowRight size={17}/></button>}</div>
  </section>;
}
