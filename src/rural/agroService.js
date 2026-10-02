import { agroCatalog, eventDefinitions, groupTypes } from './agroCatalog.js';
import { hasFeature } from './features.js';
import { validate, fail } from './validation.js';
import { filtersSchema } from './schemas.js';

const cents = value => Math.round(Number(value) * 100);
const pick = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
export async function agroOverview(service, farmId, filters = {}) {
  service.feature('modules');
  validate(filtersSchema, filters);
  for (const key of Object.keys(filters)) if (!['activity_id', 'production_unit_id', 'from', 'to', 'offset'].includes(key)) fail('Filtro incompatível com o resumo das atividades.');
  if (filters.from && filters.to && filters.from >= filters.to) fail('Informe um intervalo de datas válido.');
  const farm = await service.farm(farmId);
  await service.references(farm.id, filters);
  if (filters.production_unit_id) {
    const selected = await service.one('production_units', farm.id, filters.production_unit_id);
    if (filters.activity_id && selected.activity_id !== filters.activity_id) fail('Unidade e atividade incompatíveis.');
    filters = { ...filters, activity_id: selected.activity_id };
  }
  const activities = await service.repo.all('farm_activities', farm.id);
  const units = await service.repo.all('production_units', farm.id, pick(filters, ['activity_id']));
  const offset = filters.offset || 0;
  const periodFilter = pick(filters, ['activity_id', 'production_unit_id', 'from', 'to']);
  const records = await service.repo.all('production_events', farm.id, periodFilter);
  const events = records.filter(e => e.status === 'active');
  const movesInScope = await service.repo.all('production_events', farm.id, { ...pick(filters, ['activity_id', 'production_unit_id']), status: 'active', event_type: 'movement' });
  const totals = new Map();
  const unitStats = {};
  const eventsByUnit = new Map(), movesByUnit = new Map();
  for (const event of events) { const rows = eventsByUnit.get(event.production_unit_id) || []; rows.push(event); eventsByUnit.set(event.production_unit_id, rows); }
  for (const event of movesInScope) { const rows = movesByUnit.get(event.production_unit_id) || []; rows.push(event); movesByUnit.set(event.production_unit_id, rows); }
  for (const unit of units) {
    const rows = eventsByUnit.get(unit.id) || [];
    const weighs = rows.filter(e => e.event_type === 'weighing').sort((a, b) => a.event_date.localeCompare(b.event_date));
    const first = weighs[0], last = weighs.at(-1);
    const trainings = rows.filter(e => e.event_type === 'training');
    const runs = rows.filter(e => e.event_type === 'competition');
    const days = first && last ? (Date.parse(last.event_date) - Date.parse(first.event_date)) / 86400000 : 0;
    const moves = (movesByUnit.get(unit.id) || []).sort((a, b) => b.event_date.localeCompare(a.event_date) || b.created_at.localeCompare(a.created_at));
    unitStats[unit.id] = {
      count: groupTypes.includes(unit.unit_type) ? unit.current_count : null,
      current_location: moves[0]?.destination || unit.location || null,
      latest_weight_kg: last ? Number(last.quantity) : null,
      weight_date: last?.event_date || null,
      average_daily_gain_kg: unit.unit_type === 'animal' && days > 0 ? Math.round((Number(last.quantity) - Number(first.quantity)) / days * 1000) / 1000 : null,
      weight_interval_days: days || null,
      training_sessions: trainings.length,
      training_minutes: trainings.reduce((n, r) => n + Number(r.duration_minutes), 0),
      timed_runs: runs.length,
      best_measured_seconds: runs.length ? runs.reduce((best, r) => Math.min(best, Number(r.time_seconds)), Infinity) : null,
      best_time_plus_penalties_seconds: runs.length ? runs.reduce((best, r) => Math.min(best, Number(r.time_seconds) + Number(r.penalty_seconds || 0)), Infinity) : null,
    };
  }
  for (const row of events) {
    if (['milk', 'production', 'harvest', 'feeding'].includes(row.event_type)) {
      const key = `${row.event_type}:${row.unit}`;
      const value = totals.get(key) || { event_type: row.event_type, label: eventDefinitions[row.event_type].label, unit: row.unit, quantity: 0, count: 0 };
      value.quantity += Number(row.quantity); value.count++;
      totals.set(key, value);
    }
  }
  let financial = null;
  let sales = [];
  let expensePage = [];
  if (hasFeature(service.user, 'financial')) {
    // Payment balances use all payments, not just those inside the selected period.
    const allSales = await service.repo.all('farm_sales', farm.id, pick(filters, ['activity_id', 'production_unit_id']));
    const allPayments = await service.repo.all('sale_payments', farm.id, { status: 'active' });
    const paymentsBySale = new Map();
    for (const payment of allPayments) paymentsBySale.set(payment.sale_id, (paymentsBySale.get(payment.sale_id) || 0) + cents(payment.amount));
    const scopeSales = allSales.filter(s => (!filters.from || s.sale_date >= filters.from) && (!filters.to || s.sale_date < filters.to));
    const activeIds = new Set(allSales.filter(s => s.status === 'active').map(s => s.id));
    const periodPayments = allPayments.filter(p => activeIds.has(p.sale_id) && (!filters.from || p.payment_date >= filters.from) && (!filters.to || p.payment_date < filters.to));
    sales = scopeSales.map(s => ({ ...s, amount: Number(s.amount), paid_amount: (paymentsBySale.get(s.id) || 0) / 100, balance: s.status === 'active' ? (cents(s.amount) - (paymentsBySale.get(s.id) || 0)) / 100 : 0 })).slice(offset, offset + 51);
    const expenses = await service.repo.all('farm_expenses', farm.id, periodFilter);
    expensePage = expenses.slice(offset, offset + 51).map(row => ({ ...row, amount: Number(row.amount) }));
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: farm.timezone || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format();
    const balances = allSales.filter(s => s.status === 'active').map(s => ({ due: s.due_date, cents: cents(s.amount) - (paymentsBySale.get(s.id) || 0) }));
    financial = {
      expenses: expenses.reduce((n, e) => n + cents(e.amount), 0) / 100,
      sold: scopeSales.filter(s => s.status === 'active').reduce((n, s) => n + cents(s.amount), 0) / 100,
      received: periodPayments.reduce((n, p) => n + cents(p.amount), 0) / 100,
      outstanding: balances.reduce((n, b) => n + b.cents, 0) / 100,
      overdue: balances.filter(b => b.due < today).reduce((n, b) => n + b.cents, 0) / 100,
      scope: 'Despesas, vendas e recebimentos no período. Saldos a receber de todas as datas, na atividade/unidade selecionada. Não representa lucro.',
    };
  }
  const tasks = await service.repo.list('farm_tasks', farm.id, { ...pick(filters, ['activity_id','production_unit_id']), status: 'pending', offset }, 51);
  const inventory = hasFeature(service.user, 'inventory') ? (await service.repo.all('inventory_items', farm.id)).filter(item => item.unit === 'kg').map(({id,name,current_quantity,unit}) => ({id,name,current_quantity:Number(current_quantity),unit})) : [];
  return { tasks: tasks.slice(0,50), more_tasks: tasks.length>50, feed_inventory: inventory, catalog: agroCatalog(), activities, units, unit_stats: unitStats, production_totals: [...totals.values()].map(v => ({ ...v, quantity: Math.round(v.quantity * 1000000) / 1000000 })), recent_events: records.slice(offset, offset + 50), sales: sales.slice(0, 50), expenses: expensePage.slice(0, 50), more_expenses: expensePage.length > 50, more_events: records.length > offset + 50, more_sales: sales.length > 50, financial, period: { from: filters.from || null, to_exclusive: filters.to || null }, list_limit: 50 };
}
