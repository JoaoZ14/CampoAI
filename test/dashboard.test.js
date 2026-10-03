import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database } from './support/database.js';
import { RuralRepository } from '../src/rural/repository.js';
import { RuralService } from '../src/rural/service.js';
import { farmDashboard } from '../src/rural/dashboard.js';
import { publicActivity, recordHistory } from '../src/rural/activity.js';

let pg, repo, user, farm;
const now = new Date('2026-10-01T01:30:00Z'); // September 30 in the property's timezone.
const service = (actor = user) => new RuralService(actor, repo, `SM-test-${randomUUID()}`);
const save = (table, body, id) => service().save(table, farm.id, body, id);
before(async () => {
  for (const key of ['AGENT_TOOLS_ENABLED', 'AGRO_MODULES_ENABLED', 'EXPENSES_ENABLED']) process.env[key] = 'true';
  ({ pg, db: repo } = await database()); repo = new RuralRepository(repo);
  user = { id: randomUUID() };
  await pg.query('insert into users(id,phone) values($1,$2)', [user.id, '+5511980000030']);
  farm = await service().save('farms', null, { name: 'Operação mista', timezone: 'America/Sao_Paulo' });
});
after(async () => pg?.close());

test('monthly expenses use the farm calendar, exact cents and all rows', async () => {
  await save('farm_expenses', { description: 'Primeiro gasto', category: 'outros', amount: .1, expense_date: '2026-09-01' });
  await save('farm_expenses', { description: 'Segundo gasto', category: 'outros', amount: .2, expense_date: '2026-09-30' });
  await save('farm_expenses', { description: 'Outro mês', category: 'outros', amount: 900, expense_date: '2026-10-01' });
  // More than the usual page limit must not make the total misleading.
  for (let index = 0; index < 51; index++) await save('farm_expenses', { description: `Despesa ${index}`, category: 'outros', amount: 1, expense_date: '2026-09-30' });
  const result = await farmDashboard(service(), farm.id, now);
  assert.equal(result.today, '2026-09-30');
  assert.deepEqual(result.period, { from: '2026-09-01', to_exclusive: '2026-10-01' });
  assert.equal(result.expenses.amount, 51.3);
  assert.equal(result.expenses.count, 53);
  assert.equal(result.expenses.recent.length, 5);
  assert.ok(result.expenses.recent.every(expense => expense.expense_date.startsWith('2026-09')));
});
test('agenda counts all pending tasks, uses local today and presents the earliest first', async () => {
  // These fixtures represent tasks that were scheduled earlier and are now due.
  const scheduled = async (title, due) => {
    const task = await save('farm_tasks', { title, due_at: new Date(Date.now() + 86400000).toISOString(), remind: false });
    await pg.query('update farm_tasks set due_at=$1 where id=$2', [due, task.id]);
    return task;
  };
  const overdue = await scheduled('Atrasada', '2026-09-30T12:00:00Z');
  await scheduled('Hoje no sítio', '2026-10-01T02:00:00Z');
  await scheduled('Amanhã no sítio', '2026-10-01T12:00:00Z');
  const done = await scheduled('Já concluída', '2026-09-30T08:00:00Z');
  await save('farm_tasks', { status: 'completed' }, done.id);
  const result = await farmDashboard(service(), farm.id, now);
  assert.equal(result.agenda.pending, 3); assert.equal(result.agenda.today, 2); assert.equal(result.agenda.overdue, 1);
  assert.equal(result.agenda.next[0].id, overdue.id);
  assert.equal(result.agenda.next.some(task => task.id === done.id), false);
});
test('production separates units and quantities, excludes voided records and retains historical unit names', async () => {
  const activity = await save('farm_activities', { name: 'Horta', module_key: 'horticulture' });
  const area = await save('production_units', { name: 'Canteiro 3', activity_id: activity.id, unit_type: 'crop_area' });
  const base = { activity_id: activity.id, production_unit_id: area.id, event_type: 'harvest', event_date: '2026-09-30', description: 'Colheita' };
  await save('production_events', { ...base, quantity: 20, unit: 'maço' });
  await save('production_events', { ...base, quantity: 3.5, unit: 'kg' });
  const voided = await save('production_events', { ...base, quantity: 100, unit: 'kg' });
  await save('production_events', { status: 'voided' }, voided.id);
  await save('production_events', { ...base, event_date: '2026-10-01', quantity: 1000, unit: 'kg' });
  await save('production_units', { status: 'inactive' }, area.id);
  const result = await farmDashboard(service(), farm.id, now);
  assert.equal(result.production.length, 2);
  assert.equal(result.production.find(row => row.unit === 'kg').quantity, 3.5);
  assert.equal(result.production.find(row => row.unit === 'maço').quantity, 20);
  assert.ok(result.production.every(row => row.name === 'Canteiro 3'));
  assert.equal(result.units_count, 0); assert.equal(result.activities[0].units, 0);
});
test('recent records project only confirmed writes and safe display fields', async () => {
  const result = await farmDashboard(service(), farm.id, now);
  assert.ok(result.recent_records.length > 0);
  assert.ok(result.recent_records.every(row => row.status === 'completed'));
  assert.ok(result.recent_records.some(row => row.changes.some(change => change.details?.quantity != null)));
  const projected = publicActivity({ id: 'test', status: 'success', input_json: { changes: [{ table: 'farm_expenses', after: { id: 'expense', description: 'Diesel', amount: 350, private_note: 'SECRET', auth_token: 'SECRET' } }] } });
  assert.equal(projected.changes[0].details.amount, 350);
  assert.equal(JSON.stringify(projected).includes('SECRET'), false);
});
test('a different customer cannot read the property dashboard', async () => {
  await assert.rejects(() => farmDashboard(service({ id: randomUUID() }), farm.id, now), /encontrada|acesso/);
});
test('disabled modules avoid new tables and disabled expenses are unavailable, not zero', async () => {
  process.env.AGRO_MODULES_ENABLED = 'false'; process.env.EXPENSES_ENABLED = 'false';
  try {
    const result = await farmDashboard(service(), farm.id, now);
    assert.equal(result.expenses, null); assert.equal(result.modules_enabled, false);
    assert.deepEqual(result.production, []); assert.deepEqual(result.activities, []);
  } finally { process.env.AGRO_MODULES_ENABLED = 'true'; process.env.EXPENSES_ENABLED = 'true'; }
});
test('period presets and inclusive custom dates change totals without hiding pending tasks or recent records', async () => {
  const instant = new Date('2026-10-02T13:00:00Z');
  const current = await farmDashboard(service(), farm.id, instant);
  const previous = await farmDashboard(service(), farm.id, instant, { period: 'previous_month' });
  const today = await farmDashboard(service(), farm.id, instant, { period: 'today' });
  const custom = await farmDashboard(service(), farm.id, instant, { period: 'custom', from: '2026-09-30', to: '2026-10-02' });
  assert.equal(current.expenses.amount, 900); assert.equal(previous.expenses.amount, 51.3); assert.equal(today.expenses.amount, 0);
  assert.equal(custom.expenses.amount, 951.2);
  assert.deepEqual(previous.period, { from: '2026-09-01', to_exclusive: '2026-10-01' });
  assert.ok([previous, today, custom].every(result => result.agenda.pending === current.agenda.pending));
  assert.deepEqual(previous.recent_records, current.recent_records);
  assert.equal(previous.production.find(row => row.unit === 'kg').quantity, 3.5);
  for (const filters of [{ period: 'custom', from: '2026-10-02', to: '2026-10-01' }, { period: 'custom', from: '2025-01-01', to: '2026-10-01' }, { period: 'custom' }, { period: 'month', from: '2026-01-01' }, { period: 'unknown' }]) await assert.rejects(() => farmDashboard(service(), farm.id, instant, filters));
  assert.deepEqual((await farmDashboard(service(), farm.id, new Date('2027-01-01T13:00:00Z'), { period: 'previous_month' })).period, { from: '2026-12-01', to_exclusive: '2027-01-01' });
});
test('the home deduplicates records, reads their current state and retains paginated scoped history', async () => {
  const isolated = await service().save('farms', null, { name: 'Histórico de teste' });
  const expense = await service().save('farm_expenses', isolated.id, { description: 'Diesel inicial', category: 'combustivel', amount: 350, expense_date: '2026-10-02' });
  for (let index = 0; index < 24; index++) await service().save('farm_expenses', isolated.id, { amount: 351 + index, description: `Diesel corrigido ${index}` }, expense.id);
  const task = await service().save('farm_tasks', isolated.id, { title: 'Olhar baia', due_at: '2099-10-03T12:00:00Z', remind: false });
  await service().save('farm_tasks', isolated.id, { status: 'completed' }, task.id);
  const result = await farmDashboard(service(), isolated.id);
  const changes = result.recent_records.flatMap(action => action.changes);
  assert.equal(changes.filter(change => change.entity_id === expense.id).length, 1);
  assert.equal(Number(changes.find(change => change.entity_id === expense.id).details.amount), 374);
  assert.equal(changes.find(change => change.entity_id === task.id).details.status, 'completed');
  const first = await recordHistory(service(), isolated.id, 'farm_expenses', expense.id);
  assert.equal(first.items.length, 20); assert.equal(first.has_more, true);
  assert.ok(first.items.every(item => item.changes.every(change => change.entity_id === expense.id)));
  const second = await recordHistory(service(), isolated.id, 'farm_expenses', expense.id, 20);
  assert.equal(second.items.length, 5); assert.equal(second.has_more, false);
  assert.ok(second.items.some(item => item.changes.some(change => change.type === 'created' && Number(change.details.amount) === 350)));
  assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 25);
  await assert.rejects(() => recordHistory(service(), farm.id, 'farm_expenses', expense.id), /não encontrado/);
  await assert.rejects(() => recordHistory(service({ id: randomUUID() }), isolated.id, 'farm_expenses', expense.id), /acesso|encontrada/);
  await assert.rejects(() => recordHistory(service(), isolated.id, 'farm_expenses', expense.id, -1), /Página/);
});
