import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ChevronRight, Plus, SlidersHorizontal, Wallet } from 'lucide-react';
import { api, createWriteRequest, errorMessage, jsonBody, rural, type ActivityChange, type Field, type Summary } from './api';

import ExpenseList from './ExpenseList';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { farmPath, recordPath } from './routes';
import { farmDay } from './farmTime';
import './expenses.css';

type Kind = 'operations' | 'expenses';
type FormKind = 'operation' | 'expense' | null;
type Period = 'month' | 'previous_month' | '30' | '90' | 'all' | 'range';
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
function amountInReais(value: string) {
  const text = value.trim();
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(text)) return Number(text.replaceAll('.', '').replace(',', '.'));
  if (/^\d+(?:[,.]\d{1,2})?$/.test(text)) return Number(text.replace(',', '.'));
  return NaN;
}
function rangeCaption(range: { from: string; to: string }) {
  const end = new Date(range.to + 'T12:00:00Z'); end.setUTCDate(end.getUTCDate() - 1);
  const first = new Date(range.from + 'T12:00:00Z');
  if (first.getUTCDate() === 1 && new Date(end.getTime() + 86400000).getUTCDate() === 1 && first.getUTCMonth() === end.getUTCMonth() && first.getUTCFullYear() === end.getUTCFullYear()) return first.toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  return first.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) + ' a ' + end.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}
const message = errorMessage;
const recordWrite = () => createWriteRequest(value => Boolean(value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && value.id));

function listPath(farmId: string, kind: Kind, period: Period, fieldId: string, seasonId: string, offset = 0, range?: { from: string; to: string }, category = '', timezone = 'America/Sao_Paulo') {
  const query = new URLSearchParams();
  if (period === 'range' && range) { query.set('from', range.from); query.set('to', range.to); }
  else if (period === 'month' || period === 'previous_month') {
    const date = farmDay(timezone);
    const first = new Date(date.slice(0, 7) + '-01T12:00:00Z');
    if (period === 'previous_month') first.setUTCMonth(first.getUTCMonth() - 1);
    const next = new Date(first); next.setUTCMonth(next.getUTCMonth() + 1);
    query.set('from', first.toISOString().slice(0, 10)); query.set('to', next.toISOString().slice(0, 10));
  } else if (period !== 'all' && period !== 'range') {
    const from = new Date(farmDay(timezone) + 'T12:00:00Z'); from.setUTCDate(from.getUTCDate() - Number(period));
    query.set('from', from.toISOString().slice(0, 10));
  }
  if (kind === 'expenses' && category) query.set('category', category);
  if (fieldId) query.set('field_id', fieldId);
  if (kind === 'expenses' && seasonId) query.set('crop_season_id', seasonId);
  if (offset) query.set('offset', String(offset));
  return rural(farmId, kind === 'expenses' ? `/farm_expenses?${query}` : `/farm_operations?${query}`);
}

export default function FarmRecords({ farmId, summary, online, initialForm, initialKind, initialRange, refreshKey = 0, formPage = false, onDirty, onRecord, onSaved, onBusy }: {
  farmId: string;
  summary: Summary | null;
  online: boolean;
  initialForm: FormKind;
  initialKind?: Kind;
  initialRange?: { from: string; to: string };
  refreshKey?: number;
  formPage?: boolean;
  onDirty?: (dirty: boolean) => void;
  onRecord?: (change: ActivityChange) => void;
  onSaved: () => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const expensesEnabled = summary?.expenses != null;
  const location = useLocation(), navigate = useNavigate();
  const [query, setQuery] = useSearchParams();
  const updateFilter = (name: string, value: string) => setQuery(previous => { const next = new URLSearchParams(previous); if (value) next.set(name, value); else next.delete(name); return next; }, { replace: true });
  const [kind, setKind] = useState<Kind>(initialKind || (initialForm === 'expense' ? 'expenses' : 'operations'));
  const [form, setForm] = useState<FormKind>(initialForm);
  const write = useRef(recordWrite());
  const pending = useRef(false);
  const pagination = useRef<AbortController | null>(null);
  const selectedPeriod = query.get('period') || (initialRange ? 'range' : initialKind === 'expenses' ? 'month' : '90');
  const period: Period = ['month', 'previous_month', '30', '90', 'all'].includes(selectedPeriod) || selectedPeriod === 'range' && initialRange ? selectedPeriod as Period : initialKind === 'expenses' ? 'month' : '90';
  const setPeriod = (value: Period) => updateFilter('period', value);
  const category = query.get('category') || '';
  const setCategory = (value: string) => updateFilter('category', value);
  const [filtersOpen, setFiltersOpen] = useState(Boolean(query.get('category') || query.get('field_id') || query.get('crop_season_id')));
  const fieldId = query.get('field_id') || '', seasonId = query.get('crop_season_id') || '';
  const setFieldId = (value: string) => updateFilter('field_id', value);
  const setSeasonId = (value: string) => updateFilter('crop_season_id', value);
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
  const timezone = summary?.farm.timezone || 'America/Sao_Paulo';
  const periodCaption = period === 'range' && initialRange ? rangeCaption(initialRange) : ({ month: 'Este mês', previous_month: 'Mês passado', '30': 'Últimos 30 dias', '90': 'Últimos 90 dias', all: 'Todas as datas', range: 'Período do Início' })[period];
  const filtersCount = Number(Boolean(category)) + Number(Boolean(fieldId)) + Number(Boolean(seasonId));
  const filterKey = `${farmId}:${kind}:${period}:${fieldId}:${seasonId}:${category}`;
  const currentFilter = useRef(filterKey);
  currentFilter.current = filterKey;

  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => () => onDirty?.(false), [onDirty]);

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
    if (formPage || kind === 'expenses' && !expensesEnabled) {
      setExpenses([]);
      setTotals(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const path = listPath(farmId, kind, period, fieldId, seasonId, 0, initialRange, category, timezone);
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
  }, [farmId, kind, period, fieldId, seasonId, expensesEnabled, reload, initialRange?.from, initialRange?.to, category, timezone, refreshKey, formPage]);

  function openForm(next: Exclude<FormKind, null>) {
    if (pending.current) return;
    navigate(farmPath(farmId, next === 'expense' ? 'gastos/novo' : 'trabalhos/novo') + location.search);
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
      const amount = amountInReais(String(values.get('amount') || ''));
      if (!Number.isFinite(amount) || amount <= 0) { setError('Informe um valor maior que zero. Ex.: 350,00.'); return; }
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
      const saved = await write.current<{ id: string }>(path, { method: 'POST', body: jsonBody(payload) });
      setNotice(form === 'expense' ? 'Gasto salvo nesta propriedade. Se ele não aparecer, confira o período e os filtros.' : 'Trabalho salvo em Trabalhos do campo.');
      onDirty?.(false);
      await onSaved();
      onBusy(false); setBusy(false);
      navigate(recordPath(farmId, form === 'expense' ? 'farm_expenses' : 'farm_operations', saved.id)!, { replace: true, state: { returnTo: farmPath(farmId, form === 'expense' ? 'gastos' : 'trabalhos') + location.search } });
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
      const path = listPath(farmId, kind, period, fieldId, seasonId, rows.length, initialRange, category, timezone);
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

  const recordForm = form && <form className={form === 'expense' ? 'stack-form expense-form' : 'panel stack-form records-form'} onSubmit={save} onChange={() => onDirty?.(true)}>
    {form === 'operation' && <><label>Tipo de atividade<select name="operation_type" required defaultValue=""><option value="" disabled>Selecione</option><option value="manejo">Manejo</option><option value="irrigacao">Irrigação</option><option value="colheita">Colheita</option><option value="observacao">Observação</option><option value="outro">Outra atividade</option></select></label></>}
    {form === 'expense' && <label>Valor em reais<span className="expense-amount-input"><span aria-hidden="true">R$</span><input name="amount" type="text" inputMode="decimal" required maxLength={24} placeholder="0,00"/></span></label>}
    <label>Descrição<input name="description" required maxLength={240} placeholder={form === 'expense' ? 'Ex.: Diesel para o trator' : 'Ex.: Irriguei o Talhão Norte'}/></label>
    <div className="form-grid">{form === 'expense' && <label>Categoria<select name="category" required defaultValue=""><option value="" disabled>Selecione a categoria</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}<label>Data<input name="record_date" type="date" required defaultValue={farmDay(timezone)}/></label></div>
    {form === 'operation' && <label>Talhão <span className="optional">opcional</span><select name="field_id" defaultValue=""><option value="">Propriedade inteira</option>{fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>}
    {form === 'expense' && (fields.length > 0 || seasons.length > 0) && <details className="expense-link-options"><summary>Vincular a talhão ou safra <span>Opcional</span></summary>{fields.length > 0 && <label>Talhão<select name="field_id" defaultValue=""><option value="">Propriedade inteira</option>{fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>}{seasons.length > 0 && <label>Safra<select name="crop_season_id" defaultValue=""><option value="">Sem safra específica</option>{seasons.map(season => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>}</details>}
    {!online && <p className="notice" role="status">Sem conexão. Conecte-se para salvar; seus dados continuam nesta janela.</p>}
    <div className="records-form-footer"><p className="form-note">{form === 'expense' ? 'Ao salvar, o gasto aparece nesta propriedade e no resumo do Início.' : 'Confira os dados antes de salvar.'}</p><button className="button primary" disabled={busy || !online}>{busy ? 'Salvando…' : form === 'expense' ? 'Salvar gasto' : 'Salvar atividade'}</button></div>
  </form>;

  if (formPage) return <section ref={sectionRef} className="record-create" aria-label="Cadastro de registro">{!summary ? <p role="status">Carregando os dados da propriedade…</p> : form === 'expense' && !expensesEnabled ? <p className="notice">Os gastos não estão disponíveis nesta conta.</p> : <div className="panel">{error && <p className="notice error" role="alert">{error}</p>}{recordForm}</div>}</section>;

  return <section ref={sectionRef} className={kind === 'expenses' ? 'records expense-screen' : 'records'} aria-label="Registros da propriedade">
    {kind === 'expenses' ? <div className="expense-actions"><button type="button" className="button primary" onClick={() => openForm('expense')} disabled={busy || !online || !expensesEnabled}><Plus size={19}/> Adicionar gasto</button></div> : <div className="records-heading"><div><h2>Trabalhos registrados</h2><p>Confira os trabalhos realizados e quando aconteceram.</p></div><div className="records-actions">{initialKind !== 'expenses' && <button className="button secondary" onClick={() => openForm('operation')} disabled={busy || !online}><Plus size={17}/> Atividade</button>}{initialKind !== 'operations' && <button className="button primary" onClick={() => openForm('expense')} disabled={busy || !online || !expensesEnabled}><Plus size={17}/> Adicionar gasto</button>}</div></div>}
    {!expensesEnabled && <p className="records-unavailable">{summary ? 'Os gastos não estão disponíveis nesta conta.' : 'Aguardando os dados da propriedade para abrir os gastos.'}</p>}
    {error && form !== 'expense' && <p className="notice error" role="alert">{error}</p>}
    {notice && <p className="notice success" role="status">{notice}</p>}
    {kind === 'expenses' && expensesEnabled ? <>
      <div className="expense-overview"><div className="expense-overview-heading"><span className="expense-total-label">{filtersCount ? 'Total dos gastos filtrados' : 'Total do período'}</span><Wallet size={21} aria-hidden="true"/></div><strong>{loading ? '…' : totals ? money(totals.amount) : '—'}</strong><p className="expense-overview-period">{periodCaption}</p><span>{loading ? 'Atualizando gastos…' : totals ? totals.count + (totals.count === 1 ? ' gasto registrado' : ' gastos registrados') : 'Não foi possível consultar o total.'}{totals?.cost_per_ha != null && <> · {money(totals.cost_per_ha)} por hectare</>}</span></div>
      <div className="expense-filter-bar"><label>Período<select disabled={busy} aria-label="Período dos registros" value={period} onChange={event => setPeriod(event.target.value as Period)}>{initialRange && <option value="range">{rangeCaption(initialRange)}</option>}<option value="month">Este mês</option><option value="previous_month">Mês passado</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="all">Todas as datas</option></select></label><button type="button" className="button secondary" aria-expanded={filtersOpen} aria-controls="expense-filters" onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal size={18}/> Filtrar{filtersCount > 0 && <span className="expense-filter-count">{filtersCount}</span>}</button></div>
      <div className="expense-extra-filters" id="expense-filters" hidden={!filtersOpen}><label>Categoria<select aria-label="Filtrar por categoria" value={category} disabled={busy} onChange={event => setCategory(event.target.value)}><option value="">Todas as categorias</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{fields.length > 0 && <label>Talhão<select aria-label="Filtrar por talhão" value={fieldId} disabled={busy} onChange={event => setFieldId(event.target.value)}><option value="">Todos os talhões</option>{fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>}{seasons.length > 0 && <label>Safra<select aria-label="Filtrar por safra" value={seasonId} disabled={busy} onChange={event => setSeasonId(event.target.value)}><option value="">Todas as safras</option>{seasons.map(season => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>}</div>
      {filtersCount > 0 && <div className="expense-active-filters"><p>{[category ? categoryLabel(category) : '', fields.find(field => field.id === fieldId)?.name, seasons.find(season => season.id === seasonId)?.name].filter(Boolean).join(' · ')}</p><button type="button" className="text-button" disabled={busy} onClick={() => setQuery(previous => { const next = new URLSearchParams(previous); ['category', 'field_id', 'crop_season_id'].forEach(key => next.delete(key)); return next; }, { replace: true })}>Limpar filtros</button></div>}
      <div className="expense-list-heading"><h2>Gastos registrados</h2><span>Mais recentes primeiro</span></div>
      {loading ? <p className="loading" role="status">Buscando gastos…</p> : error && !expenses.length ? <div className="records-empty"><strong>Não foi possível abrir seus gastos</strong><p>Tente novamente para conferir este período.</p><button className="button secondary" disabled={!online || busy} onClick={() => setReload(value => value + 1)}>Tentar novamente</button></div> : expenses.length ? <div className="records-list expense-list"><ExpenseList rows={expenses} disabled={busy || !online} onRecord={onRecord}/></div> : <div className="expense-empty"><Wallet size={28} aria-hidden="true"/><h3>{filtersCount ? 'Nenhum gasto com estes filtros' : 'Nenhum gasto neste período'}</h3><p>{filtersCount ? 'Tente outra categoria ou limpe os filtros.' : 'Escolha outro período ou use “Adicionar gasto” para fazer um registro.'}</p></div>}
      {more && !loading && <button className="load-more" disabled={busy || !online} onClick={() => void loadMore()}>Carregar mais <ArrowRight size={17}/></button>}
    </> : kind === 'operations' && <>
      <div className="records-toolbar">{!initialKind && <div className="filter-tabs" role="group" aria-label="Tipo de registro"><button aria-pressed="true" disabled={busy} className="selected">Atividades</button><button aria-pressed="false" onClick={() => setKind('expenses')} disabled={busy || !expensesEnabled}>Despesas</button></div>}<div className="records-filters"><label>Período<select disabled={busy} aria-label="Período dos registros" value={period} onChange={event => setPeriod(event.target.value as Period)}>{initialRange && <option value="range">Período do resumo</option>}<option value="month">Este mês</option><option value="previous_month">Mês passado</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="all">Todo o histórico</option></select></label><label>Talhão<select disabled={busy} aria-label="Filtrar por talhão" value={fieldId} onChange={event => setFieldId(event.target.value)}><option value="">Todos</option>{fields.map((field: Field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label></div></div>
      <div className="panel records-list"><div className="section-heading"><h2>Atividades</h2><span>Mais recentes primeiro</span></div>{loading ? <p className="muted" role="status">Carregando registros…</p> : error && !operations.length ? <div className="records-empty"><strong>Os registros não puderam ser carregados</strong><p>Tente novamente para conferir este período.</p><button className="button secondary" disabled={!online || busy} onClick={() => setReload(value => value + 1)}>Tentar novamente</button></div> : operations.length ? <ul>{operations.map(row => <li key={row.id}><div className="records-date">{day(row.operation_date)}</div><div className="records-row-main"><strong>{row.description}</strong><span>{row.operation_type.replaceAll('_', ' ')}{row.field_id ? ` · ${fields.find(field => field.id === row.field_id)?.name || 'Talhão'}` : ''}</span></div>{onRecord && <button className="record-button" disabled={busy || !online} onClick={() => onRecord({ entity: 'farm_operations', entity_id: row.id, type: 'updated', label: 'Trabalho', title: row.description })} aria-label={`Abrir ${row.description}`}>Ver detalhes <ChevronRight size={16}/></button>}</li>)}</ul> : <div className="records-empty"><strong>Nenhum registro nesse filtro</strong><p>Altere o período ou faça o primeiro registro acima.</p></div>}{more && !loading && <button className="load-more" disabled={busy || !online} onClick={() => void loadMore()}>Carregar mais <ArrowRight size={17}/></button>}</div>
    </>}
  </section>;
}
