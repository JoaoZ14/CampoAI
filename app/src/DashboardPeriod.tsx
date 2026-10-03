import { useEffect, useState, type FormEvent } from 'react';
import type { DashboardData, DashboardFilter } from './api';
import { farmDay } from './farmTime';

const nextDay = (day: string, offset: number) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
export default function DashboardPeriod({ filter, data, timezone, disabled, onChange }: { filter: DashboardFilter; data: DashboardData | null; timezone: string; disabled: boolean; onChange: (value: DashboardFilter) => void }) {
  const [custom, setCustom] = useState(filter.period === 'custom');
  const [from, setFrom] = useState(filter.from || data?.period.from || farmDay(timezone));
  const [until, setUntil] = useState(filter.to ? nextDay(filter.to, -1) : data ? nextDay(data.period.to_exclusive, -1) : farmDay(timezone));
  const [error, setError] = useState('');
  useEffect(() => { setCustom(filter.period === 'custom'); }, [filter.period]);
  function choose(period: DashboardFilter['period']) {
    setError(''); setCustom(period === 'custom');
    if (period === 'custom') {
      setFrom(filter.from || data?.period.from || farmDay(timezone));
      setUntil(filter.to ? nextDay(filter.to, -1) : data ? nextDay(data.period.to_exclusive, -1) : farmDay(timezone));
    } else onChange({ period });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const days = (Date.parse(until) - Date.parse(from)) / 86400000 + 1;
    if (!Number.isFinite(days) || days < 1 || days > 366) { setError('Escolha até 366 dias, com a data final igual ou posterior à inicial.'); return; }
    setError(''); onChange({ period: 'custom', from, to: nextDay(until, 1) });
  }
  return <section className="dash-period" aria-label="Período do resumo"><div className="dash-period-top"><label>Gastos e produção<select aria-label="Período de gastos e produção" value={custom ? 'custom' : filter.period} disabled={disabled} onChange={event => choose(event.target.value as DashboardFilter['period'])}><option value="today">Hoje</option><option value="month">Este mês</option><option value="previous_month">Mês passado</option><option value="custom">Escolher período</option></select></label><p>Os últimos registros e as tarefas pendentes continuam aparecendo, de todas as datas.</p></div>{custom && <form className="dash-period-form" onSubmit={submit}><label>De<input type="date" required value={from} disabled={disabled} onChange={event => setFrom(event.target.value)}/></label><label>Até<input type="date" required value={until} disabled={disabled} onChange={event => setUntil(event.target.value)}/></label><button className="button primary" disabled={disabled}>Consultar período</button><p>Inclui o primeiro e o último dia escolhidos. Use o botão para consultar.</p>{error && <p className="dash-period-error" role="alert">{error}</p>}</form>}</section>;
}
