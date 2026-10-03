import { useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronRight, ClipboardList, Clock3, CloudSun, Coins, Leaf, MapPinned, MessageCircle, RefreshCw, Wallet, X } from 'lucide-react';
import type { ActivityChange, DashboardData, DashboardFilter, Farm, Weather } from './api';
import DashboardPeriod from './DashboardPeriod';
import './dashboard.css';

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const number = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const day = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });
const kinds: Record<string, string> = { milk: 'Leite', harvest: 'Colheita', production: 'Ovos', training: 'Treino', competition: 'Passada', feeding: 'Alimentação', weighing: 'Pesagem', care: 'Cuidado', planting: 'Plantio', mortality: 'Baixa no grupo', stock_entry: 'Entrada no grupo', stock_exit: 'Saída do grupo', movement: 'Mudança de local' };
const unitLabels: Record<string, string> = { l: 'litros', un: 'unidades', maco: 'maços', 'maço': 'maços', caixa: 'caixas', m3: 'm³' };
function stamp(value: string, timezone: string, today: string) {
  const instant = new Date(value);
  const sameDay = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant) === today;
  const time = instant.toLocaleTimeString('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
  return sameDay ? `Hoje, ${time}` : instant.toLocaleString('pt-BR', { timeZone: timezone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function recordValue(change: ActivityChange) {
  const details = change.details;
  if (!details) return '';
  if (details.amount != null && Number.isFinite(Number(details.amount))) return money(Number(details.amount));
  if (details.quantity != null && Number.isFinite(Number(details.quantity))) return `${number(Number(details.quantity))} ${unitLabels[details.unit || ''] || details.unit || ''}`.trim();
  if (details.duration_minutes != null) return `${number(Number(details.duration_minutes))} min`;
  if (details.time_seconds != null) return `${number(Number(details.time_seconds))} s${Number(details.penalty_seconds) > 0 ? ` + ${number(Number(details.penalty_seconds))} s de penalidade` : ''}`;
  return '';
}
function savedState(change: ActivityChange) {
  if (change.details?.status === 'voided') return 'Anulado';
  if (change.details?.status === 'cancelled') return 'Cancelado';
  if (change.details?.status === 'completed') return 'Concluído';
  if (change.details?.status === 'pending') return 'Pendente';
  return change.type === 'updated' ? 'Atualizado' : 'Registrado';
}

type Props = {
  farm: Farm; data: DashboardData | null; weather: Weather | null; loading: boolean; error?: string; online: boolean; busy: boolean; whatsappUrl?: string;
  filter: DashboardFilter; onPeriod: (filter: DashboardFilter) => void;
  onRefresh: () => void; onRecord: (change: ActivityChange) => void; onRecords: () => void; onAgenda: () => void; onFarm: () => void; onProduction: (period: DashboardData['period']) => void;
};
export default function Dashboard({ farm, data, weather, loading, error, online, busy, whatsappUrl, filter, onPeriod, onRefresh, onRecord, onRecords, onAgenda, onFarm, onProduction }: Props) {
  const [showExpenses, setShowExpenses] = useState(false);
  const periodControl = <DashboardPeriod filter={filter} data={data} timezone={farm.timezone || 'America/Sao_Paulo'} disabled={!online || busy} onChange={value => { setShowExpenses(false); onPeriod(value); }}/>;
  if (!data) return <div className="dashboard"><div className="dash-heading"><div><span className="dash-eyebrow">{farm.name}</span><h1>Seu resumo</h1><p>O que você contou à Lida, organizado aqui.</p></div></div>{periodControl}<section className="dash-state" role={loading ? 'status' : undefined}><span className="dash-icon"><RefreshCw size={23}/></span><h2>{loading ? 'Buscando seus registros…' : 'Não conseguimos abrir o resumo'}</h2><p>{loading ? 'Já vamos mostrar o que está salvo nesta propriedade.' : 'Tente atualizar para conferir seus gastos, produção e tarefas.'}</p>{!loading && <button className="button primary" disabled={!online || busy} onClick={onRefresh}>Tentar novamente</button>}</section></div>;
  const month = new Date(`${data.period.from}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const until = new Date(data.period.to_exclusive + 'T12:00:00Z'); until.setUTCDate(until.getUTCDate() - 1);
  const periodLabel = filter.period === 'month' || filter.period === 'previous_month' ? month : filter.period === 'today' ? 'Hoje, ' + day(data.today) : data.period.from.split('-').reverse().join('/') + ' a ' + until.toISOString().slice(0, 10).split('-').reverse().join('/');
  const recent = data.recent_records.filter(item => item.status === 'completed').flatMap(item => item.changes.filter(change => change.entity_id).map((change, index) => ({ key: `${item.id}-${index}`, source: item.source, created_at: item.created_at, change }))).slice(0, 5);
  return <div className="dashboard">
    <div className="dash-heading"><div><span className="dash-eyebrow">{farm.name}</span><h1>Seu resumo</h1><p>O que você contou à Lida, organizado aqui.</p></div><div className="dash-sync"><span className="dash-updated" role="status"><span className={error ? 'dash-dot warning' : 'dash-dot'} />{loading ? 'Atualizando…' : error ? 'Não foi possível atualizar' : `Atualizado às ${new Date(data.generated_at).toLocaleTimeString('pt-BR', { timeZone: data.timezone, hour: '2-digit', minute: '2-digit' })}`}</span><button className="dash-link" aria-label="Atualizar resumo" disabled={loading || busy || !online} onClick={onRefresh}><RefreshCw size={16}/> Atualizar</button></div></div>
    {periodControl}
    {error && <p className="dash-stale" role="status">Os números abaixo são da última consulta. Atualize para conferir as mudanças.</p>}
    <div className="dash-numbers" aria-label="Resumo da propriedade">
      {data.expenses && <button className="dash-number expenses" aria-expanded={showExpenses} aria-controls="dash-expenses" onClick={() => setShowExpenses(value => !value)}><span className="dash-number-top"><Wallet size={19}/><span>{filter.period === 'month' ? 'Gastos deste mês' : 'Gastos no período'}</span><ChevronRight size={17}/></span><strong>{money(data.expenses.amount)}</strong><span className="dash-number-note">{periodLabel} · {data.expenses.count} {data.expenses.count === 1 ? 'despesa' : 'despesas'}</span></button>}
      <button className={`dash-number agenda${data.agenda.overdue ? ' has-overdue' : ''}`} onClick={onAgenda}><span className="dash-number-top"><CalendarDays size={19}/><span>Tarefas para hoje</span><ChevronRight size={17}/></span><strong>{data.agenda.today}</strong><span className="dash-number-note">{data.agenda.overdue ? `${data.agenda.overdue} ${data.agenda.overdue === 1 ? 'atrasada' : 'atrasadas'} · ` : ''}{data.agenda.pending} {data.agenda.pending === 1 ? 'pendente' : 'pendentes'} ao todo</span></button>
    </div>
    {showExpenses && data.expenses && <section id="dash-expenses" className="dash-panel dash-expenses"><div className="dash-section-heading"><div><h2>Gastos · {periodLabel}</h2><p>Despesas registradas nesta propriedade.</p></div><button className="icon-button" aria-label="Fechar gastos do mês" onClick={() => setShowExpenses(false)}><X size={18}/></button></div>{data.expenses.recent.length ? <ul>{data.expenses.recent.map(expense => <li key={expense.id}><button disabled={busy || !online} onClick={() => onRecord({ entity: 'farm_expenses', entity_id: expense.id, type: 'created', label: 'Despesa', title: expense.description })}><span><strong>{expense.description}</strong><small>{day(expense.expense_date)}</small></span><strong>{money(expense.amount)}</strong><ChevronRight size={17}/></button></li>)}</ul> : <p className="dash-empty">Nenhuma despesa registrada neste período.</p>}{data.expenses.count > 5 && <p className="dash-footnote">Mostrando as 5 despesas mais recentes do período.</p>}</section>}
    <div className="dash-main-grid">
      <section className="dash-panel dash-records" aria-labelledby="dash-records-title"><div className="dash-section-heading"><div><h2 id="dash-records-title">Últimos registros</h2><p>Cada registro aparece uma vez, com sua situação atual.</p></div><button className="dash-link" disabled={busy} onClick={onRecords}>Ver todos <ArrowRight size={17}/></button></div>
        {recent.length ? <ul>{recent.map(({ key, source, created_at, change }) => {
          const value = recordValue(change);
          const recordDate = change.details?.expense_date || change.details?.event_date || change.details?.operation_date;
          const kind = kinds[change.details?.event_type || ''] || change.label;
          const Icon = change.entity === 'farm_expenses' || change.entity === 'farm_sales' || change.entity === 'sale_payments' ? Coins : change.entity === 'farm_tasks' ? CalendarDays : change.entity === 'production_events' || change.entity === 'farm_operations' ? Leaf : ClipboardList;
          return <li key={key}><button className="dash-record" disabled={busy || !online} onClick={() => onRecord(change)}><span className={`dash-record-icon${change.entity === 'farm_expenses' ? ' expense' : ''}`}><Icon size={21}/></span><span className="dash-record-copy"><span className="dash-record-kind">{kind} <span className="dash-saved"><Check size={12}/>{savedState(change)}</span></span><strong>{change.title}</strong>{value && <span className="dash-record-value">{value}</span>}{change.details?.due_at && <span className="dash-record-value">{stamp(change.details.due_at, data.timezone, data.today)}</span>}<small>{recordDate ? `${day(recordDate)} · ` : ''}{source === 'lida' ? 'Lida no WhatsApp' : 'Feito no app'} · {stamp(created_at, data.timezone, data.today)}</small></span><ChevronRight className="dash-chevron" size={19}/></button></li>;
        })}</ul> : <div className="dash-empty-state"><span className="dash-icon"><MessageCircle size={24}/></span><h3>Seus pedidos vão aparecer aqui.</h3><p>Peça à Lida para registrar um gasto, uma tarefa ou a produção. Depois da confirmação, confira o registro no app.</p>{whatsappUrl && <a className="button primary" href={whatsappUrl} target="_blank" rel="noreferrer">Falar com a Lida <ArrowUpRight size={17}/></a>}</div>}
        {recent.length > 0 && <p className="dash-footnote">Toque para conferir os detalhes e o histórico de alterações.</p>}
      </section>
      <section className="dash-panel dash-agenda" aria-labelledby="dash-agenda-title"><div className="dash-section-heading"><div><h2 id="dash-agenda-title">O que precisa fazer</h2><p>Primeiro o que está atrasado, depois os próximos.</p></div></div>{data.agenda.next.length ? <ul>{data.agenda.next.map(task => <li key={task.id}><button className="dash-task" onClick={onAgenda}><span className={`dash-task-icon${Date.parse(task.due_at) < Date.parse(data.generated_at) ? ' overdue' : ''}`}><Clock3 size={20}/></span><span><strong>{task.title}</strong><time dateTime={task.due_at}>{stamp(task.due_at, data.timezone, data.today)}{Date.parse(task.due_at) < Date.parse(data.generated_at) ? ' · Atrasada' : ''}</time></span><ChevronRight size={18}/></button></li>)}</ul> : <div className="dash-no-tasks"><Check size={23}/><div><strong>Nenhuma tarefa pendente.</strong><p>Quando agendar com a Lida, o compromisso aparecerá aqui.</p></div></div>}<button className="dash-link dash-agenda-link" disabled={busy} onClick={onAgenda}>Abrir agenda <ArrowRight size={17}/></button></section>
    </div>
    {data.modules_enabled && <div className="dash-bottom-grid"><section className="dash-panel dash-production"><div className="dash-section-heading"><div><h2>{filter.period === 'month' ? 'Produção deste mês' : 'Produção no período'}</h2><p>{periodLabel} · quantidades registradas</p></div></div>{data.production.length ? <ul>{data.production.slice(0, 4).map(row => <li key={`${row.production_unit_id}-${row.event_type}-${row.unit}`}><span className="dash-production-icon"><Leaf size={19}/></span><div><strong>{kinds[row.event_type] || 'Produção'} · {row.name}</strong><span>{data.activities.find(activity => activity.id === row.activity_id)?.name || 'Produção registrada'}</span></div><b>{number(row.quantity)} <small>{unitLabels[row.unit] || row.unit}</small></b></li>)}</ul> : <p className="dash-empty">Ainda não há produção registrada neste período. Colheitas, leite e ovos aparecerão aqui, cada um com sua unidade.</p>}<button className="dash-link" disabled={busy} onClick={() => onProduction(data.period)}>Ver minha produção <ArrowRight size={17}/></button></section><section className="dash-panel dash-operation"><div className="dash-section-heading"><div><h2>Sua propriedade</h2><p>{data.activities.length} {data.activities.length === 1 ? 'atividade' : 'atividades'} · {data.units_count} {data.units_count === 1 ? 'cadastro' : 'cadastros'}</p></div><MapPinned size={21}/></div>{data.activities.length ? <ul>{data.activities.slice(0, 5).map(activity => <li key={activity.id}><strong>{activity.name}</strong><span>{activity.units} {activity.units === 1 ? 'cadastro' : 'cadastros'}</span></li>)}</ul> : <p className="dash-empty">Conte à Lida o que você planta ou cria para começar a organizar as atividades.</p>}<button className="dash-link" disabled={busy} onClick={onFarm}>Ver animais e áreas <ArrowRight size={17}/></button></section></div>}
    {whatsappUrl && recent.length > 0 && <a className="dash-lida-link" href={whatsappUrl} target="_blank" rel="noreferrer"><span className="lida-avatar">L</span><span><strong>Quer registrar mais alguma coisa?</strong><small>Continue conversando com a Lida no WhatsApp.</small></span><ArrowUpRight size={20}/></a>}
    {weather && <p className="dash-weather"><CloudSun size={20}/><span>{weather.current.temperature_2m != null ? `${Math.round(weather.current.temperature_2m)}${weather.current_units?.temperature_2m || '°C'}` : 'Clima da propriedade'}{weather.daily?.precipitation_probability_max?.[0] != null ? ` · ${weather.daily.precipitation_probability_max[0]}% de chance de chuva hoje` : ''}<small>{weather.source} · consulta {stamp(weather.retrieved_at, data.timezone, data.today)}</small></span></p>}
  </div>;
}
