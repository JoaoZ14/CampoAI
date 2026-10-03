import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, ChevronRight, Plus, RefreshCw, X } from 'lucide-react';
import { api, createWriteRequest, errorMessage, jsonBody, rural } from './api';
import { farmDay, farmInstant, farmLocalTime } from './farmTime';
import type { AgroActivity, AgroDefinition, AgroField, AgroOverview, AgroRecord, Payment, Sale } from './agroTypes';

type FormKind = 'activity' | 'unit' | 'event' | 'sale' | 'payment' | 'expense' | 'task';
type Draft = { kind: FormKind; record?: AgroRecord; sale?: Sale };
const labels: Record<string, string> = { animal: 'Animal individual', herd: 'Lote / rebanho', flock: 'Lote de aves', pond: 'Viveiro / tanque', hive: 'Colmeia', apiary: 'Apiário', crop_area: 'Canteiro / área', orchard: 'Pomar', forestry_block: 'Área florestal', facility: 'Unidade de trabalho', female: 'Fêmea', male: 'Macho', unknown: 'Não informado', equine: 'Equino', bovine: 'Bovino', poultry: 'Ave', pig: 'Suíno', sheep: 'Ovino', goat: 'Caprino', fish: 'Peixe', morning: 'Manhã', afternoon: 'Tarde', evening: 'Noite', day: 'Total do dia', active: 'Ativo', inactive: 'Inativo', voided: 'Anulado', cancelled: 'Cancelado', pix: 'Pix', cash: 'Dinheiro', transfer: 'Transferência', card: 'Cartão', other: 'Outro' };
const money = (value: number) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const number = (value: number) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const day = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
const entities: Record<FormKind, string> = { activity: 'farm_activities', unit: 'production_units', event: 'production_events', sale: 'farm_sales', payment: 'sale_payments', expense: 'farm_expenses', task: 'farm_tasks' };
const names: Record<FormKind, string> = { activity: 'atividade produtiva', unit: 'ficha', event: 'registro', sale: 'venda ou serviço', payment: 'recebimento', expense: 'despesa', task: 'tarefa' };

function Field({ field, value, onChange, disabled }: { field: AgroField; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <label>{field.label}{field.unit ? ` (${field.unit})` : ''}{field.type === 'select'
    ? <select required={field.required} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}><option value="">Selecione</option>{field.options?.map(option => <option key={option} value={option}>{labels[option] || option}</option>)}</select>
    : <input type={field.type} required={field.required} maxLength={field.type === 'text' ? 500 : undefined} min={field.min} max={field.type === 'number' ? 1000000000 : undefined} step={field.step} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}/>}</label>;
}

function AgroForm({ draft, data, activity, unitId, timezone, reminders, busy, online, error, onClose, onSave }: {
  draft: Draft; data: AgroOverview; activity?: AgroActivity; unitId: string; timezone: string; reminders: boolean; busy: boolean; online: boolean; error: string;
  onClose: () => void; onSave: (entity: string, values: Record<string, unknown>, id?: string) => Promise<void>;
}) {
  const record = draft.record;
  const [values, setValues] = useState<Record<string, string>>(() => {
    const fields: Record<string, string> = {};
    if (record) Object.entries(record).forEach(([key, value]) => { if (value != null && typeof value !== 'object') fields[key] = String(value); });
    fields.activity_id ||= activity?.id || '';
    fields.production_unit_id ||= unitId;
    fields.module_key ||= activity?.module_key || data.catalog.modules[0].key;
    fields.status ||= 'active';
    fields.event_date ||= farmDay(timezone); fields.sale_date ||= farmDay(timezone); fields.payment_date ||= farmDay(timezone); fields.expense_date ||= farmDay(timezone);
    fields.method ||= 'pix'; fields.category ||= 'outros';
    if (record?.due_at) fields.due_at = farmLocalTime(String(record.due_at), timezone);
    return fields;
  });
  const [localError, setLocalError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const set = (key: string, value: string) => setValues(current => ({ ...current, [key]: value }));
  const module = data.catalog.modules.find(m => m.key === (draft.kind === 'activity' ? values.module_key : activity?.module_key));
  const eventType = values.event_type || module?.events[0] || 'inspection';
  const baseDefinition: AgroDefinition | undefined = data.catalog.events[eventType];
  const definition = baseDefinition && eventType === 'harvest' ? { ...baseDefinition, fields: baseDefinition.fields.map(field => field.key === 'unit' ? { ...field, options: module?.harvest_units || field.options } : field) } : baseDefinition;
  const target = data.units.find(u => u.id === values.production_unit_id);
  const unitType = values.unit_type || module?.types[0] || 'facility';
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); previous?.focus(); };
  }, []);
  const input = (key: string, label: string, required = false, type = 'text') => <label>{label}<input type={type} required={required} maxLength={type === 'text' ? 500 : undefined} value={values[key] || ''} onChange={e => set(key, e.target.value)} disabled={busy}/></label>;
  const numeric = (key: string, label: string, required = true, min = 0.01, step = '0.01') => <Field field={{ key, label, type: 'number', required, min, step }} value={values[key] || ''} onChange={value => set(key, value)} disabled={busy}/>;
  const unitSelect = (required = false) => <label>{module?.unitLabel || 'Unidade'}<select value={values.production_unit_id || ''} required={required} disabled={busy || Boolean(record)} onChange={e => set('production_unit_id', e.target.value)}><option value="">{required ? 'Selecione a ficha' : 'Atividade inteira / sem vínculo específico'}</option>{data.units.filter(u => u.activity_id === activity?.id && (u.status === 'active' || u.id === values.production_unit_id)).map(u => <option value={u.id} key={u.id}>{u.name}{u.identifier ? ` · ${u.identifier}` : ''}</option>)}</select></label>;
  const status = (options: string[]) => record && <label>Situação<select value={values.status} onChange={e => set('status', e.target.value)} disabled={busy}>{options.map(value => <option value={value} key={value}>{labels[value]}</option>)}</select></label>;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError('');
    try {
    const payload: Record<string, unknown> = {};
    const copy = (keys: string[], numbers: string[] = []) => keys.forEach(key => { if (values[key]?.trim()) payload[key] = numbers.includes(key) ? Number(values[key]) : values[key].trim(); });
    if (draft.kind === 'activity') { copy(['name', 'notes', 'status']); payload.module_key = values.module_key; }
    if (draft.kind === 'unit') {
      copy(['activity_id', 'name', 'identifier', 'sex', 'birth_date', 'owner_name', 'location', 'notes', 'status']);
      payload.unit_type = unitType;
      if (module?.species.length) payload.species = values.species || module.species[0];
      if (data.catalog.group_types.includes(unitType)) payload.opening_count = Number(values.opening_count || 0);
    }
    if (draft.kind === 'event') {
      copy(['activity_id', 'production_unit_id', 'event_date', 'description', 'status']);
      payload.event_type = eventType;
      payload.description ||= `${definition?.label}: ${target?.name || ''}`;
      definition?.fields.forEach(field => { if (values[field.key]?.trim()) payload[field.key] = field.type === 'number' ? Number(values[field.key]) : values[field.key].trim(); });
      if (definition?.fixedUnit) payload.unit = definition.fixedUnit;
      if (eventType === 'feeding' && values.inventory_item_id) payload.inventory_item_id = values.inventory_item_id;
    }
    if (draft.kind === 'sale') copy(['activity_id', 'production_unit_id', 'description', 'customer', 'amount', 'sale_date', 'due_date', 'quantity', 'unit', 'status'], ['amount', 'quantity']);
    if (draft.kind === 'payment') { copy(['amount', 'payment_date', 'method', 'notes', 'status'], ['amount']); payload.sale_id = draft.sale?.id || record?.sale_id; }
    if (draft.kind === 'expense') copy(['activity_id', 'production_unit_id', 'description', 'category', 'amount', 'expense_date', 'supplier'], ['amount']);
    if (record) {
      const clearable = draft.kind === 'unit' ? ['identifier','sex','birth_date','owner_name','location','notes'] : draft.kind === 'sale' ? ['quantity','unit'] : draft.kind === 'payment' ? ['notes'] : draft.kind === 'event' ? ['operator'] : draft.kind === 'activity' ? ['notes'] : [];
      clearable.forEach(key => { if (values[key] === '') payload[key] = null; });
    }
    if (draft.kind === 'task') {
      copy(['activity_id', 'production_unit_id', 'title', 'description']);
      payload.due_at = farmInstant(values.due_at, timezone); payload.remind = reminders && values.remind === 'true';
    }
    await onSave(entities[draft.kind], payload, record?.id);
    } catch (cause) { setLocalError(errorMessage(cause)); }
  }
  return <dialog ref={dialog} className="agro-dialog" aria-labelledby="agro-form-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <form className="stack-form" onSubmit={e => { void submit(e); }}>
      <div className="section-heading"><div><span className="eyebrow">{activity?.name || 'Seu estabelecimento'}</span><h2 id="agro-form-title">{record ? 'Corrigir' : 'Registrar'} {names[draft.kind]}</h2></div><button className="icon-button" type="button" aria-label="Fechar formulário" disabled={busy} onClick={onClose}><X size={21}/></button></div>
      {draft.kind === 'activity' && <><label>Tipo de atividade<select value={values.module_key} disabled={busy || Boolean(record)} onChange={e => setValues(v => ({ ...v, module_key: e.target.value }))}>{data.catalog.modules.map(m => <option value={m.key} key={m.key}>{m.label}</option>)}</select></label><p className="form-note">{module?.purpose}</p>{input('name', 'Como você chama essa atividade?', true)}{input('notes', 'Observações')}{status(['active', 'inactive'])}</>}
      {draft.kind === 'unit' && <>
        {input('name', 'Nome da ficha', true)}
        <label>Tipo<select value={unitType} disabled={busy || Boolean(record)} onChange={e => set('unit_type', e.target.value)}>{module?.types.map(type => <option key={type} value={type}>{labels[type]}</option>)}</select></label>
        {module && module.species.length > 0 && <label>Espécie<select value={values.species || module.species[0]} disabled={busy || Boolean(record)} onChange={e => set('species', e.target.value)}>{module.species.map(species => <option key={species} value={species}>{labels[species]}</option>)}</select></label>}
        {input('identifier', 'Identificação / brinco (opcional)')}
        {unitType === 'animal' && <><label>Sexo<select value={values.sex || ''} onChange={e => set('sex', e.target.value)} disabled={busy}><option value="">Não informado</option>{['female', 'male', 'unknown'].map(s => <option key={s} value={s}>{labels[s]}</option>)}</select></label>{input('birth_date', 'Nascimento (se conhecido)', false, 'date')}{input('owner_name', 'Proprietário do animal (opcional)')}</>}
        {data.catalog.group_types.includes(unitType) && <label>Quantidade inicial ({unitType === 'apiary' ? 'colmeias' : 'animais'})<input type="number" min="0" max="10000000" step="1" value={values.opening_count || '0'} disabled={busy || Boolean(record)} onChange={e => set('opening_count', e.target.value)}/><small>Depois do cadastro, ajuste com entradas ou saídas para preservar o histórico.</small></label>}
        {input('location', 'Local inicial / baia / piquete')}{input('notes', 'Observações')}{status(['active', 'inactive'])}
      </>}
      {draft.kind === 'event' && <>
        {unitSelect(true)}
        <label>O que aconteceu?<select value={eventType} disabled={busy || Boolean(record)} onChange={e => setValues(v => ({ activity_id: v.activity_id, production_unit_id: v.production_unit_id, event_date: v.event_date, event_type: e.target.value, status: 'active' }))}>{module?.events.map(type => <option key={type} value={type}>{data.catalog.events[type].label}</option>)}</select></label>
        {input('event_date', 'Data do registro', true, 'date')}
        {definition?.fields.map(field => <Field key={field.key} field={field} value={values[field.key] || ''} onChange={value => set(field.key, value)} disabled={busy}/>)}
        {!definition?.fields.some(f => f.key === 'description') && input('description', 'Observações (opcional)')}
        {eventType === 'weighing' && <p className="form-note">{target?.unit_type === 'herd' ? 'Informe o peso total do lote. Ele não será tratado como peso individual.' : 'Uma pesagem por ficha e data. Corrija o registro anterior se necessário.'}</p>}
        {eventType === 'milk' && <p className="form-note">Registre ordenhas separadas ou o total do dia. Não registre ambos para a mesma ficha e data. Evite contar novamente o leite dos animais no total do lote.</p>}
        {eventType === 'feeding' && <><label>Baixar de qual estoque? (opcional)<select value={values.inventory_item_id || ''} disabled={busy || Boolean(record)} onChange={e => set('inventory_item_id', e.target.value)}><option value="">Somente registrar o consumo</option>{data.feed_inventory.map(item => <option value={item.id} key={item.id}>{item.name} · {number(item.current_quantity)} kg</option>)}</select></label><p className="form-note">Com um item selecionado, o estoque é atualizado junto ao registro. Correções e anulação também ajustam o saldo. Sem vínculo, fica apenas o histórico de consumo.</p></>}
        {eventType === 'competition' && <p className="form-note">Tempo e penalidade são valores informados. O registro não interpreta o regulamento da prova.</p>}
        {status(['active', 'voided'])}<p className="form-note">Registre o que já aconteceu. Para uma ação futura, use a agenda.</p>
      </>}
      {draft.kind === 'sale' && <>{unitSelect()}{input('description', 'Produto ou serviço', true)}{input('customer', 'Cliente', true)}{numeric('amount', 'Valor total (R$)')}<div className="form-row">{input('sale_date', 'Data da venda / serviço', true, 'date')}{input('due_date', 'Vencimento', true, 'date')}</div><div className="form-row">{numeric('quantity', 'Quantidade (opcional)', false, 0.000001, 'any')}{input('unit', 'Unidade (se houver quantidade)')}</div>{status(['active', 'cancelled'])}<p className="form-note">Venda e recebimento são registros separados. A venda não movimenta o saldo de animais ou o estoque automaticamente.</p></>}
      {draft.kind === 'payment' && <><p className="form-note">{draft.sale?.description || 'Recebimento da venda selecionada'}{draft.sale ? ` · saldo ${money(draft.sale.balance)}` : ''}</p>{numeric('amount', 'Valor recebido (R$)')}{input('payment_date', 'Data em que recebeu', true, 'date')}<label>Forma de pagamento<select value={values.method} onChange={e => set('method', e.target.value)} disabled={busy}>{['pix', 'cash', 'transfer', 'card', 'other'].map(method => <option value={method} key={method}>{labels[method]}</option>)}</select></label>{input('notes', 'Observações / motivo da correção')}{status(['active', 'voided'])}</>}
      {draft.kind === 'expense' && <>{unitSelect()}{input('description', 'O que foi pago?', true)}{numeric('amount', 'Valor (R$)')}{input('expense_date', 'Data da despesa', true, 'date')}{input('category', 'Categoria', true)}{input('supplier', 'Fornecedor (opcional)')}</>}
      {draft.kind === 'task' && <>{unitSelect()}{input('title', 'O que precisa ser feito?', true)}{input('description', 'Observações')}{input('due_at', `Dia e horário (${timezone})`, true, 'datetime-local')}<label className="checkbox"><input type="checkbox" checked={values.remind === 'true'} onChange={e => set('remind', String(e.target.checked))} disabled={busy || !reminders}/> Lida me lembra no WhatsApp</label><p className="form-note">{reminders ? 'Use o horário do estabelecimento.' : 'O lembrete por WhatsApp está indisponível. A tarefa ficará na agenda.'}</p></>}
      {(error || localError) && <p className="notice error" role="alert">{error || localError}</p>}
      <div className="agro-form-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy || !online}>{busy ? 'Salvando…' : record ? 'Salvar correção' : 'Salvar registro'}<Check size={17}/></button></div>
    </form>
  </dialog>;
}

export default function AgroWorkspace({ farmId, timezone, online, reminders, onBusy, onSaved, initialTab = 'units', initialPeriod = '90', initialRange }: { farmId: string; timezone: string; online: boolean; reminders: boolean; onBusy: (busy: boolean) => void; onSaved: () => Promise<void>; initialTab?: 'units' | 'history'; initialPeriod?: string; initialRange?: { from: string; to: string } }) {
  const [data, setData] = useState<AgroOverview | null>(null);
  const [activityId, setActivityId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [period, setPeriod] = useState(initialPeriod);
  const [tab, setTab] = useState<'units' | 'history' | 'finance' | 'agenda'>(initialTab);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [payments, setPayments] = useState<{ sale: Sale; items: Payment[]; more: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(0);
  const pending = useRef(false);
  const write = useRef(createWriteRequest(value => Boolean(value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && value.id)));
  const key = `${farmId}:${activityId}:${unitId}:${period}:${page}:${reload}`;
  const current = useRef(key); current.current = key;
  const activity = data?.activities.find(a => a.id === activityId);
  const module = data?.catalog.modules.find(m => m.key === activity?.module_key);

  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    if (page === 0) setData(null);
    const query = new URLSearchParams();
    if (activityId) query.set('activity_id', activityId);
    if (unitId) query.set('production_unit_id', unitId);
    if (period === 'range' && initialRange) { query.set('from', initialRange.from); query.set('to', initialRange.to); } else if (period === 'month') {
      const today = farmDay(timezone);
      const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
      query.set('from', `${today.slice(0, 7)}-01`);
      query.set('to', `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`);
    } else if (period !== 'all') { const from = new Date(); from.setUTCDate(from.getUTCDate() - Number(period)); query.set('from', farmDay(timezone, from)); }
    if (page) query.set('offset', String(page * 50));
    api<AgroOverview>(rural(farmId, `/agro/overview?${query}`), { signal: controller.signal }).then(result => {
      if (controller.signal.aborted || current.current !== key) return;
      setData(previous => page && previous ? { ...result, recent_events: [...previous.recent_events, ...result.recent_events], sales: [...previous.sales, ...result.sales], expenses: [...previous.expenses, ...result.expenses], tasks: [...previous.tasks, ...result.tasks] } : result);
      if (!activityId && result.activities.filter(a => a.status === 'active').length === 1) setActivityId(result.activities.find(a => a.status === 'active')!.id);
    }).catch(cause => { if (!controller.signal.aborted) setError(errorMessage(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [key, farmId, activityId, unitId, period, page, timezone]);

  async function save(entity: string, values: Record<string, unknown>, id?: string) {
    if (pending.current || !online) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const saved = await write.current<AgroRecord>(rural(farmId, `/${entity}${id ? `/${encodeURIComponent(id)}` : ''}`), { method: id ? 'PATCH' : 'POST', body: jsonBody(values) });
      if (!saved.id) throw new Error('Confirmação incompleta.');
      setDraft(null); setPayments(null); setNotice(id ? 'Correção salva. O histórico foi preservado.' : 'Registro salvo. Você já pode conferir os dados.');
      if (entity === 'farm_activities') { setActivityId(saved.id); setUnitId(''); }
      if (entity === 'production_units' && !id) setUnitId(saved.id);
      setPage(0); setReload(n => n + 1);
      await onSaved();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { pending.current = false; setBusy(false); }
  }
  async function openPayments(sale: Sale, append = false) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const offset = append ? payments?.items.length || 0 : 0;
      const rows = await api<Payment[]>(rural(farmId, `/sale_payments?sale_id=${sale.id}&offset=${offset}`));
      setPayments({ sale, items: append ? [...(payments?.items || []), ...rows] : rows, more: rows.length === 50 });
    } catch (cause) { setError(errorMessage(cause)); }
    finally { pending.current = false; setBusy(false); }
  }
  const open = (kind: FormKind, record?: AgroRecord, sale?: Sale) => { setError(''); setDraft({ kind, record, sale }); };
  const unitName = (id: string) => data?.units.find(u => u.id === id)?.name || 'Ficha da atividade';
  const changeScope = (id: string) => { setActivityId(id); setUnitId(''); setPage(0); setPayments(null); setNotice(''); };
  const actDisabled = busy || !online || !activity || activity.status !== 'active';

  return <section className="agro-workspace" aria-label="Atividades e produção">
    <div className="section-heading"><div><span className="eyebrow">CONTROLE DA OPERAÇÃO</span><h2>Suas atividades</h2><p className="muted">Cada criação, área e rotina com seu próprio histórico.</p></div><button className="button secondary" disabled={busy || !online || !data} onClick={() => open('activity')}><Plus size={17}/> Adicionar atividade</button></div>
    {!online && <p className="notice" role="status">Sem conexão. Os dados preenchidos ficam nesta tela; conecte-se para salvar.</p>}
    {notice && <p className="notice success" role="status">{notice}</p>}
    {error && !draft && <div className="notice error" role="alert"><p>{error}</p><button className="text-button" disabled={busy || !online} onClick={() => { setPage(0); setReload(n => n + 1); }}>Tentar novamente <RefreshCw size={15}/></button></div>}
    {loading && !data && <p className="loading" role="status">Carregando suas atividades…</p>}
    {data && <>
      {!data.activities.length ? <div className="agro-intro"><h3>Comece pela atividade que você quer acompanhar.</h3><p>Horta, lavoura, cavalos, gado, aves, viveiros, colmeias ou outras atividades podem conviver aqui. Cadastre uma atividade e depois suas fichas de trabalho.</p><button className="button primary" disabled={busy || !online} onClick={() => open('activity')}>Escolher minha atividade <ArrowRight size={17}/></button></div> : <>
        <div className="agro-filters"><label>Atividade<select aria-label="Atividade" value={activityId} disabled={busy} onChange={e => changeScope(e.target.value)}><option value="">Todas as atividades</option>{data.activities.map(a => <option key={a.id} value={a.id}>{a.name}{a.status !== 'active' ? ' · inativa' : ''}</option>)}</select></label><label>Ficha<select aria-label="Ficha" value={unitId} disabled={busy || !activityId} onChange={e => { setUnitId(e.target.value); setPage(0); }}><option value="">Todas as fichas</option>{data.units.filter(u => u.activity_id === activityId).map(u => <option key={u.id} value={u.id}>{u.name}{u.identifier ? ` · ${u.identifier}` : ''}</option>)}</select></label><label>Período<select aria-label="Período da atividade" value={period} disabled={busy} onChange={e => { setPeriod(e.target.value); setPage(0); }}>{initialRange && <option value="range">Período do resumo</option>}<option value="month">Este mês</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="all">Todas as datas</option></select></label></div>
        <div className="agro-context"><div><h3>{activity?.name || 'Visão de todas as atividades'}</h3><p>{module?.purpose || 'Selecione uma atividade para cadastrar fichas e registrar sua rotina.'}</p></div>{activity && <button className="text-button" disabled={busy || !online} onClick={() => open('activity', activity)}>Editar atividade</button>}</div>
        <div className="agro-actions"><button className="button primary" disabled={actDisabled} onClick={() => open('event')}><Plus size={17}/> Registrar o que aconteceu</button><button className="button secondary" disabled={actDisabled} onClick={() => open('task')}>Agendar tarefa</button>{data.financial && <button className="button secondary" disabled={actDisabled} onClick={() => open('expense')}>Registrar despesa</button>}</div>
        <div className="segment-control agro-tabs" role="group" aria-label="Áreas da atividade">{[['units', 'Fichas'], ['history', 'Histórico'], ['agenda', 'Agenda'], ...(data.financial ? [['finance', 'Vendas e recebimentos']] : [])].map(([id, label]) => <button key={id} aria-pressed={tab === id} className={tab === id ? 'active' : ''} disabled={busy} onClick={() => { setTab(id as typeof tab); setPayments(null); }}>{label}</button>)}</div>
        {tab === 'units' && <>
          <div className="section-heading"><h3>{module?.unitLabel || 'Unidades de produção'}</h3><button className="text-button" disabled={actDisabled} onClick={() => open('unit')}><Plus size={16}/> Nova ficha</button></div>
          {!data.units.length ? <div className="empty"><strong>Cadastre a primeira ficha desta atividade</strong><p>Ela reúne os registros do mesmo animal, grupo, área ou instalação.</p></div> : <ul className="agro-units">{data.units.filter(u => !unitId || u.id === unitId).map(u => { const stats = data.unit_stats[u.id]; return <li key={u.id}><div className="agro-unit-heading"><div><span className="eyebrow">{labels[u.unit_type]}{u.status !== 'active' ? ' · inativo' : ''}</span><h3>{u.name}</h3><p>{u.identifier ? `Identificação ${u.identifier}` : labels[u.species || ''] || ''}</p></div><button className="record-button" disabled={busy || !online} onClick={() => open('unit', u)}>Abrir ficha <ChevronRight size={17}/></button></div>{stats && <dl className="agro-unit-stats">{stats.count !== null && <div><dt>Saldo atual</dt><dd>{number(stats.count)} {u.unit_type === 'apiary' ? 'colmeias' : 'animais'}</dd></div>}{stats.current_location && <div><dt>Local atual</dt><dd>{stats.current_location}</dd></div>}{stats.latest_weight_kg !== null && <div><dt>Peso no período · {day(stats.weight_date!)}</dt><dd>{number(stats.latest_weight_kg)} kg</dd></div>}{stats.training_sessions > 0 && <div><dt>Treinos no período</dt><dd>{stats.training_sessions} · {number(stats.training_minutes)} min</dd></div>}{stats.best_measured_seconds !== null && <div><dt>Menor tempo medido no período</dt><dd>{number(stats.best_measured_seconds)} s</dd></div>}{stats.best_time_plus_penalties_seconds !== null && <div><dt>Menor tempo + penalidades informadas</dt><dd>{number(stats.best_time_plus_penalties_seconds)} s</dd></div>}{stats.average_daily_gain_kg !== null && <div><dt>Variação média · {stats.weight_interval_days} dias</dt><dd>{number(stats.average_daily_gain_kg)} kg/dia</dd></div>}</dl>}<button className="text-button" disabled={busy} onClick={() => { changeScope(u.activity_id); setUnitId(u.id); setTab('history'); }}>Ver histórico <ArrowRight size={16}/></button></li>; })}</ul>}
        </>}
        {tab === 'history' && <>
          {data.production_totals.length > 0 && <div className="agro-totals">{data.production_totals.map(total => <div key={`${total.event_type}:${total.unit}`}><span>{total.label} no período</span><strong>{number(total.quantity)} <small>{total.unit}</small></strong><small>{total.count} registro(s)</small></div>)}</div>}
          <p className="form-note">Quantidades de unidades diferentes ficam separadas. Anular ou corrigir um registro atualiza os totais e mantém a auditoria.</p>
          <ul className="agro-ledger">{data.recent_events.map(row => <li key={row.id}><div><span className="eyebrow">{day(row.event_date)} · {data.catalog.events[row.event_type].label}{row.status === 'voided' ? ' · anulado' : ''}</span><strong>{unitName(row.production_unit_id)}</strong><p>{row.description}</p>{row.quantity != null && <span>{number(row.quantity)} {row.unit}</span>}{row.duration_minutes != null && <span>{number(row.duration_minutes)} min</span>}{row.time_seconds != null && <span>{number(row.time_seconds)} s · penalidade {number(row.penalty_seconds || 0)} s</span>}</div><button className="record-button" disabled={busy || !online} onClick={() => { open('event', row); }}>Corrigir <ChevronRight size={16}/></button></li>)}</ul>
          {!data.recent_events.length && <div className="empty"><strong>Nenhum registro neste período</strong><p>Registre o trabalho realizado ou amplie o período para consultar o histórico.</p></div>}
          {data.more_events && <button className="load-more" disabled={busy || loading} onClick={() => setPage(n => n + 1)}>Carregar mais registros <ArrowRight size={17}/></button>}
        </>}
        {tab === 'agenda' && <><p className="form-note">Tarefas pendentes de todas as datas. Horários em {timezone}. Você também pode concluir as tarefas na Agenda principal.</p><ul className="agro-ledger">{data.tasks.map(task => <li key={task.id}><div><span className="eyebrow">{new Date(task.due_at).toLocaleString('pt-BR', {timeZone:timezone,dateStyle:'short',timeStyle:'short'})}</span><strong>{task.title}</strong>{task.production_unit_id && <p>{unitName(task.production_unit_id)}</p>}</div><button className="record-button" disabled={busy || !online} onClick={()=>open('task',task)}>Editar tarefa <ChevronRight size={16}/></button></li>)}</ul>{!data.tasks.length && <div className="empty"><strong>Nenhuma tarefa pendente nesta seleção</strong><p>Agende o próximo cuidado, trabalho ou compromisso desta atividade.</p></div>}{data.more_tasks && <button className="load-more" disabled={busy || loading} onClick={()=>setPage(n=>n+1)}>Carregar mais tarefas</button>}</>}
        {tab === 'finance' && data.financial && <>
          <div className="agro-totals">{[['Despesas no período', data.financial.expenses], ['Recebido no período', data.financial.received], ['A receber · todas as datas', data.financial.outstanding], ['Vencido · todas as datas', data.financial.overdue]].map(([label, amount]) => <div key={String(label)}><span>{label}</span><strong>{money(Number(amount))}</strong></div>)}</div>
          <p className="form-note">{data.financial.scope}</p><div className="section-heading"><h3>Vendas e serviços no período</h3><button className="text-button" disabled={actDisabled} onClick={() => open('sale')}><Plus size={16}/> Nova venda ou serviço</button></div>
          <ul className="agro-ledger">{data.sales.map(sale => <li key={sale.id}><div><span className="eyebrow">{sale.customer} · vence {day(sale.due_date)}</span><strong>{sale.description}</strong><p>{money(sale.amount)} · {sale.status === 'cancelled' ? 'cancelada' : sale.balance > 0 ? `a receber ${money(sale.balance)}` : 'recebida'}</p><div className="agro-inline-actions"><button className="text-button" disabled={busy || !online} onClick={() => { open('sale', sale); }}>Corrigir venda</button><button className="text-button" disabled={busy || !online} onClick={() => void openPayments(sale)}>Ver recebimentos</button></div></div>{sale.status === 'active' && sale.balance > 0 && <button className="record-button" disabled={busy || !online} onClick={() => open('payment', undefined, sale)}>Receber <ArrowRight size={16}/></button>}</li>)}</ul>
          {!data.sales.length && <div className="empty"><strong>Nenhuma venda ou serviço no período</strong><p>Registre o que vendeu ou consulte todas as datas para ver contas anteriores.</p></div>}
          {period !== 'all' && <button className="text-button" disabled={busy} onClick={() => { setPeriod('all'); setPage(0); }}>Consultar contas de todas as datas</button>}
          {data.more_sales && <button className="load-more" disabled={busy || loading} onClick={() => setPage(n => n + 1)}>Carregar mais contas <ArrowRight size={17}/></button>}
          <div className="section-heading"><h3>Despesas no período</h3></div><ul className="agro-ledger">{data.expenses.map(expense => <li key={expense.id}><div><span className="eyebrow">{day(expense.expense_date)} · {expense.category.replaceAll('_', ' ')}</span><strong>{expense.description}</strong><p>{money(expense.amount)}</p></div><button className="record-button" disabled={busy || !online} onClick={() => open('expense', expense)}>Corrigir <ChevronRight size={16}/></button></li>)}</ul>{data.more_expenses && <button className="load-more" disabled={busy || loading} onClick={() => setPage(n => n + 1)}>Carregar mais despesas</button>}
          {payments && <section className="panel agro-payments" aria-label="Recebimentos da venda"><div className="section-heading"><h3>Recebimentos · {payments.sale.description}</h3><button className="text-button" disabled={busy} onClick={() => setPayments(null)}>Fechar</button></div>{payments.items.length ? <ul className="agro-ledger">{payments.items.map(p => <li key={p.id}><div><strong>{money(p.amount)} · {day(p.payment_date)}</strong><p>{labels[p.method]} · {labels[p.status]}</p></div><button className="record-button" disabled={busy || !online} onClick={() => open('payment', p, payments.sale)}>Corrigir <ChevronRight size={16}/></button></li>)}</ul> : <p className="muted">Ainda não há recebimentos desta venda.</p>}{payments.more && <button className="load-more" disabled={busy || !online} onClick={() => void openPayments(payments.sale, true)}>Carregar mais recebimentos</button>}</section>}
        </>}
      </>}
    </>}
    {draft && data && <AgroForm key={`${draft.kind}:${draft.record?.id || 'new'}`} draft={draft} data={data} activity={data.activities.find(a => a.id === draft.record?.activity_id) || activity} unitId={unitId} timezone={timezone} reminders={reminders} busy={busy} online={online} error={error} onClose={() => { setDraft(null); setError(''); }} onSave={save}/>}
  </section>;
}
