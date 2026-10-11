import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api, createWriteRequest, errorMessage, jsonBody, rural, type Farm } from './api';
import { farmInstant, farmLocalTime } from './farmTime';
import RecordDetails from './RecordDetails';
import ScopedRecordHistory from './ScopedRecordHistory';
import { farmPath, recordPath, recordSections, scopedReturn } from './routes';

export default function RecordPage({ farm, entity, id, editing, online, reminders, onBusy, onDirty, onSaved }: {
  farm: Farm; entity: string; id: string; editing: boolean; online: boolean; reminders: boolean;
  onBusy: (busy: boolean) => void; onDirty: (dirty: boolean) => void; onSaved: () => Promise<void>;
}) {
  const location = useLocation(), navigate = useNavigate();
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [missing, setMissing] = useState(false);
  const [value, setValue] = useState(''), [amount, setAmount] = useState(''), [date, setDate] = useState(''), [remind, setRemind] = useState(false);
  const [dirty, setDirty] = useState(false);
  const pending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const write = useRef(createWriteRequest(result => Boolean(result && typeof result === 'object' && 'id' in result && result.id === id)));
  const timezone = farm.timezone || 'America/Sao_Paulo';
  const field = entity === 'farm_tasks' ? 'title' : ['farm_expenses', 'farm_operations'].includes(entity) ? 'description' : entity === 'fields' ? 'area_ha' : '';
  const path = recordPath(farm.id, entity, id)!;
  const parent = farmPath(farm.id, recordSections[entity] || 'registros');
  const returnTo = scopedReturn(location.state?.returnTo, farm.id, parent);
  const returnLabel = returnTo.split('?')[0] === farmPath(farm.id) ? 'Início' : ({ gastos: 'Meus gastos', tarefas: 'Minhas tarefas', trabalhos: 'Trabalhos do campo' } as Record<string, string>)[returnTo.split('?')[0].split('/').at(-1)!] || 'Meus registros';
  const title = String(record?.title || record?.description || record?.name || 'Detalhes do registro');
  useEffect(() => { if (record && !loading) { document.title = `${editing ? 'Corrigir registro' : title} · AGGI`; heading.current?.focus({ preventScroll: true }); } }, [title, editing, loading, record]);

  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setRecord(null); setError(''); setMissing(false);
    api<Record<string, unknown>>(rural(farm.id, `/${entity}/${encodeURIComponent(id)}`), { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setRecord(result);
    }).catch(cause => { if (!controller.signal.aborted) { setMissing(cause instanceof ApiError && [403, 404].includes(cause.status)); setError(errorMessage(cause)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [farm.id, entity, id, reload]);
  useEffect(() => {
    setDirty(false); onDirty(false); setError('');
    if (!record) return;
    setValue(String(record[field] ?? '')); setAmount(String(record.amount ?? ''));
    setDate(entity === 'farm_tasks' && record.due_at ? farmLocalTime(String(record.due_at), timezone) : String(record.expense_date ?? ''));
    setRemind(Boolean(record.remind));
  }, [editing, record, field, entity, timezone, onDirty]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!record || !field || pending.current || !online) return;
    const payload: Record<string, unknown> = { [field]: field === 'area_ha' ? Number(value) : value.trim() };
    if (entity === 'farm_expenses') {
      const raw = amount.trim();
      const number = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw) ? Number(raw.replaceAll('.', '').replace(',', '.')) : /^\d+(?:[,.]\d{1,2})?$/.test(raw) ? Number(raw.replace(',', '.')) : NaN;
      if (!Number.isFinite(number) || number <= 0) { setError('Informe um valor maior que zero. Ex.: 350,00.'); return; }
      payload.amount = number; payload.expense_date = date;
    }
    if (entity === 'farm_tasks') {
      try { if (date !== farmLocalTime(String(record.due_at), timezone)) payload.due_at = farmInstant(date, timezone); }
      catch { setError('Informe uma data e hora válidas no horário da propriedade.'); return; }
      if (remind !== Boolean(record.remind)) payload.remind = remind;
    }
    pending.current = true; setBusy(true); setError('');
    try {
      const result = await write.current<Record<string, unknown>>(rural(farm.id, `/${entity}/${encodeURIComponent(id)}`), { method: 'PATCH', body: jsonBody(payload) });
      setRecord(result); setDirty(false); onDirty(false); onBusy(false); setBusy(false);
      setNotice('Correção salva. A Lida usará os dados atualizados.');
      navigate(path, { replace: true, state: { returnTo } });
      await onSaved();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { pending.current = false; setBusy(false); }
  }
  function cancel() { setDirty(false); onDirty(false); navigate(path, { replace: true, state: { returnTo } }); }
  if (loading) return <section className="record-page"><Link className="text-button" to={returnTo}>← {returnLabel}</Link><h1>Abrindo registro…</h1><p role="status">Buscando os dados desta propriedade.</p></section>;
  if (!record) return <section className="workspace-state"><h1>{missing ? 'Registro não encontrado' : 'Não foi possível abrir este registro'}</h1><p role="alert">{missing ? 'Ele pode ter sido removido ou pertencer a outra propriedade.' : error}</p><Link className="button secondary" to={returnTo}>Voltar para {returnLabel}</Link>{!missing && <button type="button" className="button primary" disabled={!online} onClick={() => setReload(n => n + 1)}>Tentar novamente</button>}</section>;
  return <section className="record-page" aria-label="Detalhes do registro">
    <Link className="text-button records-back" to={returnTo}>← {returnLabel}</Link>
    <div className="page-heading"><div><span className="dash-eyebrow">{farm.name}</span><h1 ref={heading} tabIndex={-1}>{editing ? 'Corrigir registro' : title}</h1><p>{editing ? 'Confira os dados antes de salvar.' : 'Confira o que foi salvo nesta propriedade.'}</p></div></div>
    {notice && <p className="notice success" role="status">{notice}</p>}
    {!online && <p className="notice" role="status">Sem conexão. Conecte-se para atualizar ou salvar uma correção.</p>}
    <div className="panel record-panel">{error && <p className="notice error" role="alert">{error}</p>}
      {editing && field ? <form className="stack-form" onSubmit={save} onChange={() => setDirty(true)}>
        <label>{field === 'title' ? 'Título' : field === 'area_ha' ? 'Área em hectares' : 'Descrição'}<input autoFocus required type={field === 'area_ha' ? 'number' : 'text'} min={field === 'area_ha' ? '0.0001' : undefined} step={field === 'area_ha' ? 'any' : undefined} value={value} onChange={event => setValue(event.target.value)}/></label>
        {entity === 'farm_expenses' && <div className="form-grid"><label>Valor em reais<input required type="text" inputMode="decimal" maxLength={24} value={amount} onChange={event => setAmount(event.target.value)}/></label><label>Data da despesa<input required type="date" value={date} onChange={event => setDate(event.target.value)}/></label></div>}
        {entity === 'farm_tasks' && <><label>Data e hora na propriedade<input required type="datetime-local" value={date} onChange={event => setDate(event.target.value)}/></label><label className="checkbox"><input type="checkbox" checked={remind} disabled={(!reminders && !remind) || record.status !== 'pending'} onChange={event => setRemind(event.target.checked)}/> Lida me lembra pelo WhatsApp</label><p className="form-note">{remind ? 'O lembrete acompanha o novo dia e horário, após salvar.' : 'A tarefa ficará na agenda, sem aviso automático no WhatsApp.'}</p></>}
        <div className="record-page-actions"><button type="button" className="button secondary" disabled={busy} onClick={cancel}>Cancelar correção</button><button className="button primary" disabled={busy || !online}>{busy ? 'Salvando…' : 'Salvar correção'}</button></div>
      </form> : <><RecordDetails record={record} timezone={timezone}/>{field ? <Link className="button primary record-correct" aria-disabled={!online} onClick={event => { if (!online) event.preventDefault(); }} to={`${path}/editar`} state={{ returnTo }}>Corrigir este registro</Link> : <p className="form-note">Para corrigir este cadastro, abra a ficha em Propriedade ou peça à Lida pelo WhatsApp.</p>}</>}
    </div>
    {!editing && <ScopedRecordHistory key={`${farm.id}:${entity}:${id}:${reload}:${JSON.stringify(record)}`} farmId={farm.id} entity={entity} recordId={id} timezone={timezone} online={online} busy={busy}/>}
  </section>;
}
