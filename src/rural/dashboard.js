import { hasFeature } from './features.js';
import { publicActivity } from './activity.js';

// Read-only facts. No model calls, no generated explanations and no writes.
export async function farmDashboard(service, farmId, now = new Date()) {
  const farm = await service.farm(farmId);
  const timezone = farm.timezone || 'America/Sao_Paulo';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const from = `${today.slice(0, 7)}-01`;
  const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
  const to = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`;
  const modules = hasFeature(service.user, 'modules');
  const [expenses, tasks, activities, units, events, rows] = await Promise.all([
    hasFeature(service.user, 'financial') ? service.repo.all('farm_expenses', farm.id, { from, to }) : null,
    service.repo.all('farm_tasks', farm.id, { status: 'pending' }),
    modules ? service.repo.all('farm_activities', farm.id, { status: 'active' }) : [],
    modules ? service.repo.all('production_units', farm.id) : [],
    modules ? service.repo.all('production_events', farm.id, { from, to, status: 'active' }) : [],
    service.repo.result(service.repo.db.from('assistant_actions')
      .select('id,created_at,source_message_id,status,input_json').eq('user_id', service.user.id)
      .eq('farm_id', farm.id).eq('action_type', 'WRITE').eq('status', 'success')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20)),
  ]);
  const dayOf = value => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  const sorted = [...tasks].sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at) || a.id.localeCompare(b.id));
  const totals = new Map();
  for (const event of events) {
    if (!['milk', 'production', 'harvest'].includes(event.event_type)) continue;
    const key = `${event.production_unit_id}:${event.event_type}:${event.unit}`;
    const value = totals.get(key) || { production_unit_id: event.production_unit_id, activity_id: event.activity_id, event_type: event.event_type, unit: event.unit, quantity: 0 };
    value.quantity += Number(event.quantity);
    totals.set(key, value);
  }
  // Names remain available for inactive units, without one request per record.
  const unitNames = new Map(units.map(unit => [unit.id, unit.name]));
  const activeUnits = units.filter(unit => unit.status === 'active');
  return {
    generated_at: now.toISOString(), timezone, today, period: { from, to_exclusive: to }, modules_enabled: modules,
    expenses: expenses === null ? null : {
      amount: expenses.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0) / 100,
      count: expenses.length,
      recent: expenses.slice(0, 5).map(({ id, description, amount, expense_date, category }) => ({ id, description, amount: Number(amount), expense_date, category })),
    },
    agenda: {
      pending: tasks.length, today: tasks.filter(task => dayOf(task.due_at) === today).length,
      overdue: tasks.filter(task => Date.parse(task.due_at) < now.getTime()).length,
      next: sorted.slice(0, 4).map(({ id, title, due_at, remind, status }) => ({ id, title, due_at, remind, status })),
    },
    activities: activities.map(({ id, name, module_key }) => ({ id, name, module_key, units: activeUnits.filter(unit => unit.activity_id === id).length })),
    units_count: activeUnits.length,
    production: [...totals.values()].map(row => ({ ...row, name: unitNames.get(row.production_unit_id) || 'Ficha da produção', quantity: Math.round(row.quantity * 1000000) / 1000000 })),
    recent_records: rows.map(publicActivity).filter(action => action.changes.some(change => change.entity_id)),
  };
}
