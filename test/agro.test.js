import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database } from './support/database.js';
import { RuralRepository } from '../src/rural/repository.js';
import { RuralService } from '../src/rural/service.js';
import { agroModules } from '../src/rural/agroCatalog.js';
import { createTools, executeTool } from '../src/ai/tools/catalog.js';
import { actionReceipt } from '../src/ai/policies/receipts.js';
import { publicActivity } from '../src/rural/activity.js';
import { runAgent } from '../src/ai/agent/runAgent.js';
import { intentHint, isExplicitWriteRequest } from '../src/ai/policies/intent.js';
import { buildFarmReportText } from '../src/rural/reports.js';

let pg, repo, user, outsider, farm, otherFarm;
const request = (source = randomUUID(), actor = user) => new RuralService(actor, repo, source);
const save = (table, values, recordId) => request().save(table, farm.id, values, recordId);
const activity = key => save('farm_activities', { name: `Atividade ${key}`, module_key: key });
const unit = (a, values) => save('production_units', { activity_id: a.id, ...values });
const event = (a, u, type, values = {}) => save('production_events', { activity_id: a.id, production_unit_id: u.id, event_type: type, event_date: '2026-09-30', description: 'Registro de teste', ...values });
before(async () => {
  process.env.AGENT_TOOLS_ENABLED = 'true'; process.env.AGRO_MODULES_ENABLED = 'true'; process.env.EXPENSES_ENABLED = 'true';
  process.env.REMINDERS_ENABLED = 'true'; process.env.MOCK_WHATSAPP = 'true';
  const data = await database(); pg = data.pg; repo = new RuralRepository(data.db);
  user = { id: randomUUID() }; outsider = { id: randomUUID() };
  await pg.query('insert into users(id,phone) values($1,$2),($3,$4)', [user.id, '+5511980000001', outsider.id, '+5511980000002']);
  farm = await request().save('farms', null, { name: 'Operação mista de teste' });
  otherFarm = await request(randomUUID(), outsider).save('farms', null, { name: 'Outro cliente' });
});
after(async () => pg?.close());

test('CT: ficha, treino, passada, despesa vinculada e correção auditável', async () => {
  const a = await activity('equines');
  const u = await unit(a, { name: 'Luna', unit_type: 'animal', species: 'equine', identifier: 'LUNA-01', owner_name: 'Cliente do CT', location: 'Baia 2' });
  await event(a, u, 'training', { duration_minutes: 25, operator: 'Treinador' });
  const result = await event(a, u, 'competition', { time_seconds: 18.42, penalty_seconds: 0 });
  const updated = await save('production_events', { time_seconds: 18.32 }, result.id);
  assert.equal(Number(updated.time_seconds), 18.32);
  const expense = await save('farm_expenses', { activity_id: a.id, production_unit_id: u.id, category: 'ferrageamento', description: 'Ferrageamento da Luna', amount: 180, expense_date: '2026-09-30' });
  assert.equal(expense.production_unit_id, u.id);
  const task = await save('farm_tasks', { activity_id: a.id, production_unit_id: u.id, title: 'Ferrageamento da Luna', due_at: '2099-10-02T12:00:00Z', remind: true });
  const changed = await save('farm_tasks', { due_at: '2099-10-02T14:00:00Z' }, task.id);
  assert.equal(changed.production_unit_id, u.id);
  const overview = await request().agroOverview(farm.id, { activity_id: a.id });
  assert.equal(overview.financial.expenses, 180);
  assert.equal(overview.unit_stats[u.id].training_sessions, 1);
  assert.equal(overview.unit_stats[u.id].training_minutes, 25);
  assert.equal(overview.unit_stats[u.id].best_measured_seconds, 18.32);
  assert.equal(overview.unit_stats[u.id].best_time_plus_penalties_seconds, 18.32);
  const audits = await pg.query("select * from assistant_actions where tool_name='update_production_events'");
  assert.equal(Number(audits.rows[0].input_json.changes[0].before.time_seconds), 18.42);
  assert.equal(publicActivity(audits.rows[0]).changes[0].entity, 'production_events');
  assert.match(actionReceipt('save_agro_record', { entity: 'production_events', record: updated, updated: true }), /18.32 s/);
});
test('Bovinos: ganho calculado apenas de pesagens individuais em datas diferentes', async () => {
  const a = await activity('beef_cattle');
  const u = await unit(a, { name: 'Animal 145', identifier: '145', species: 'bovine', unit_type: 'animal' });
  await event(a, u, 'weighing', { quantity: 300, unit: 'kg', event_date: '2026-09-10' });
  await event(a, u, 'weighing', { quantity: 320, unit: 'kg', event_date: '2026-09-30' });
  const overview = await request().agroOverview(farm.id, { activity_id: a.id });
  assert.equal(overview.unit_stats[u.id].average_daily_gain_kg, 1);
  await assert.rejects(event(a, u, 'weighing', { quantity: 321, unit: 'kg' }), /Já existe pesagem/);
  await assert.rejects(event(a, u, 'weighing', { quantity: 50, unit: 'L' }), /unidade.*kg/);
  await assert.rejects(unit(a, { name: 'Espécie errada', species: 'equine', unit_type: 'animal' }), /espécie compatível/);
});
test('Leite: períodos sem sobreposição, correção e anulação com totais reais', async () => {
  const a = await activity('dairy_cattle');
  const u = await unit(a, { name: 'Vaca 20', species: 'bovine', unit_type: 'animal' });
  const morning = await event(a, u, 'milk', { quantity: 10, unit: 'L', period: 'morning' });
  await event(a, u, 'milk', { quantity: 8, unit: 'L', period: 'evening' });
  await assert.rejects(event(a, u, 'milk', { quantity: 18, unit: 'L', period: 'day' }), /período/);
  await save('production_events', { quantity: 12 }, morning.id);
  let overview = await request().agroOverview(farm.id, { activity_id: a.id });
  assert.equal(overview.production_totals[0].quantity, 20);
  await save('production_events', { status: 'voided' }, morning.id);
  overview = await request().agroOverview(farm.id, { activity_id: a.id });
  assert.equal(overview.production_totals[0].quantity, 8);
});
test('Grupos: saldo derivado, correções e cronologia impedem quantidades negativas', async () => {
  const a = await activity('poultry');
  const u = await unit(a, { name: 'Poedeiras', species: 'poultry', unit_type: 'flock', opening_count: 50 });
  await event(a, u, 'stock_entry', { quantity: 20, unit: 'un', event_date: '2026-09-29' });
  const deaths = await event(a, u, 'mortality', { quantity: 3, unit: 'un' });
  assert.equal((await request().one('production_units', farm.id, u.id)).current_count, 67);
  await save('production_events', { quantity: 4 }, deaths.id);
  assert.equal((await request().one('production_units', farm.id, u.id)).current_count, 66);
  await assert.rejects(event(a, u, 'stock_exit', { quantity: 100, unit: 'un' }), /quantidade negativa/);
  await assert.rejects(save('production_units', { current_count: 500 }, u.id), /campo não permitido/);
  await assert.rejects(event(a, u, 'production', { quantity: 2.5, unit: 'un' }), /quantidade inteira/);
  await event(a, u, 'production', { quantity: 28, unit: 'un' });
  const empty = await unit(a, { name: 'Grupo novo', species: 'poultry', unit_type: 'flock', opening_count: 0 });
  await event(a, empty, 'stock_entry', { quantity: 10, unit: 'un', event_date: '2026-09-30' });
  await assert.rejects(event(a, empty, 'stock_exit', { quantity: 5, unit: 'un', event_date: '2026-09-29' }), /quantidade negativa/);
});
test('Aquicultura, apicultura e áreas agrícolas conservam as unidades específicas', async () => {
  const fish = await activity('aquaculture');
  const pond = await unit(fish, { name: 'Viveiro 1', unit_type: 'pond', species: 'fish', opening_count: 1000 });
  await event(fish, pond, 'harvest', { quantity: 80, unit: 'kg' });
  await assert.rejects(event(fish, pond, 'harvest', { quantity: 80, unit: 'caixa' }), /Unidade de colheita/);
  const bees = await activity('beekeeping');
  const hive = await unit(bees, { name: 'Colmeia 1', unit_type: 'hive' });
  await event(bees, hive, 'harvest', { quantity: 12, unit: 'kg' });
  await assert.rejects(event(bees, hive, 'stock_exit', { quantity: 1, unit: 'un' }), /grupo/);
  const forest = await activity('forestry');
  const block = await unit(forest, { name: 'Área 1', unit_type: 'forestry_block' });
  await event(forest, block, 'harvest', { quantity: 20, unit: 'm3' });
  const garden = await activity('horticulture');
  const bed = await unit(garden, { name: 'Canteiro 3', unit_type: 'crop_area' });
  await event(garden, bed, 'harvest', { quantity: 20, unit: 'maço' });
  await event(garden, bed, 'harvest', { quantity: 4, unit: 'kg' });
  await assert.rejects(event(garden, bed, 'training', { duration_minutes: 10 }), /incompatível/);
  const summary = await request().agroOverview(farm.id, { activity_id: garden.id });
  assert.equal(summary.production_totals.length, 2);
  assert.equal(summary.production_totals.find(t => t.unit === 'kg').quantity, 4);
});
test('Vendas e serviços: pagamentos parciais, limites, anulação e saldos por período', async () => {
  const a = await activity('other');
  const sale = await save('farm_sales', { activity_id: a.id, description: 'Serviço realizado', customer: 'Cliente A', amount: 100, sale_date: '2026-08-01', due_date: '2026-08-10' });
  const p1 = await save('sale_payments', { sale_id: sale.id, amount: 40, payment_date: '2026-09-10', method: 'pix' });
  await assert.rejects(save('sale_payments', { sale_id: sale.id, amount: 61, payment_date: '2026-09-20', method: 'cash' }), /ultrapassa/);
  const p2 = await save('sale_payments', { sale_id: sale.id, amount: 60, payment_date: '2026-09-20', method: 'cash' });
  let summary = await request().agroOverview(farm.id, { activity_id: a.id, from: '2026-09-01', to: '2026-10-01' });
  assert.equal(summary.financial.received, 100); assert.equal(summary.financial.sold, 0); assert.equal(summary.financial.outstanding, 0);
  await assert.rejects(save('farm_sales', { status: 'cancelled' }, sale.id), /Corrija ou anule/);
  await save('sale_payments', { status: 'voided', notes: 'Recebimento informado por engano' }, p2.id);
  summary = await request().agroOverview(farm.id, { activity_id: a.id });
  assert.equal(summary.financial.outstanding, 60);
  await assert.rejects(save('farm_sales', { amount: 20 }, sale.id), /Corrija ou anule/);
  await save('sale_payments', { status: 'voided' }, p1.id);
  await save('farm_sales', { status: 'cancelled' }, sale.id);
  await assert.rejects(save('sale_payments', { sale_id: sale.id, amount: 10, payment_date: '2026-09-30', method: 'pix' }), /cancelada/);
});
test('Idempotência, auditoria e isolamento entre clientes também cobrem os módulos', async () => {
  const a = (await request().list('farm_activities', farm.id, { module_key: 'equines' }))[0];
  const service = request('web:agro-idempotent');
  const values = { activity_id: a.id, name: 'Estrela', unit_type: 'animal', species: 'equine' };
  const first = await service.save('production_units', farm.id, values);
  const second = await service.save('production_units', farm.id, values);
  assert.equal(first.id, second.id);
  await assert.rejects(request(randomUUID(), outsider).one('production_units', farm.id, first.id), /sem acesso/);
  await assert.rejects(request().save('production_units', otherFarm.id, values), /sem acesso/);
  const anotherActivity = (await request().list('farm_activities', farm.id, { module_key: 'beef_cattle' }))[0];
  await assert.rejects(save('farm_expenses', { activity_id: anotherActivity.id, production_unit_id: first.id, description: 'Teste', category: 'outros', amount: 1, expense_date: '2026-09-30' }), /não pertence/);
  await assert.rejects(save('production_units', { activity_id: anotherActivity.id }, first.id), /vínculo/);
});
test('Ferramentas resolvem ambiguidades, gravam e devolvem recibo com dados reais', async () => {
  const a = (await request().list('farm_activities', farm.id, { module_key: 'equines' }))[0];
  await unit(a, { name: 'Estrela', unit_type: 'animal', species: 'equine' });
  const tools = createTools(request(), { text: 'Registre um treino do cavalo Estrela' });
  const lookup = await tools.find(t => t.name === 'resolve_production_unit').run({ farm_id: farm.id, name: 'Estrela' });
  assert.equal(lookup.ambiguous, true);
  assert.ok(tools.find(t => t.name === 'save_agro_record'));
  const written = await executeTool(tools.find(t => t.name === 'save_agro_record'), { farm_id: farm.id, entity: 'farm_activities', values: { name: 'Frutas', module_key: 'orchards' } }, request());
  assert.match(actionReceipt('save_agro_record', written), /Frutas/);
  assert.equal(agroModules.length, 13);
  const context = await pg.query("select count(*) n from production_units where name='Estrela'");
  assert.equal(Number(context.rows[0].n), 2);
});
test('Registros futuros, dados incompatíveis e dinheiro com precisão inválida são rejeitados', async () => {
  const a = (await request().list('farm_activities', farm.id, { module_key: 'equines' }))[0];
  const u = (await request().list('production_units', farm.id, { activity_id: a.id }))[0];
  await assert.rejects(event(a, u, 'training', { duration_minutes: 20, event_date: '2099-01-01' }), /ação futura/);
  await assert.rejects(event(a, u, 'care', { duration_minutes: 20 }), /não pertence/);
  await assert.rejects(save('farm_sales', { activity_id: a.id, description: 'Pensão', customer: 'Cliente', amount: 100.001, sale_date: '2026-09-30', due_date: '2026-10-10' }), /duas casas/);
});
test('Alimentação vinculada ao estoque é atômica, corrigível e reversível', async () => {
  process.env.INVENTORY_ENABLED = 'true';
  const a = (await request().list('farm_activities', farm.id, { module_key: 'equines' }))[0];
  const u = (await request().list('production_units', farm.id, { activity_id: a.id }))[0];
  const item = await save('inventory_items', { name: 'Ração em kg', category: 'racao', unit: 'kg' });
  await save('inventory_movements', { inventory_item_id: item.id, type: 'entry', quantity: 10 });
  const feed = await event(a, u, 'feeding', { quantity: 3, unit: 'kg', inventory_item_id: item.id });
  assert.equal(Number((await request().one('inventory_items', farm.id, item.id)).current_quantity), 7);
  await save('production_events', { quantity: 4 }, feed.id);
  assert.equal(Number((await request().one('inventory_items', farm.id, item.id)).current_quantity), 6);
  await assert.rejects(save('production_events', { quantity: 11 }, feed.id), /estoque disponível/);
  assert.equal(Number((await request().one('production_events', farm.id, feed.id)).quantity), 4);
  await save('production_events', { status: 'voided' }, feed.id);
  assert.equal(Number((await request().one('inventory_items', farm.id, item.id)).current_quantity), 10);
  await save('production_events', { status: 'active' }, feed.id);
  assert.equal(Number((await request().one('inventory_items', farm.id, item.id)).current_quantity), 6);
  const overview = await request().agroOverview(farm.id, { activity_id: a.id });
  assert.equal(overview.feed_inventory.find(row => row.id === item.id).current_quantity, 6);
});
test('Todos os perfis têm registro, consulta e correção válidos; campos opcionais podem ser removidos', async () => {
  for (const module of agroModules) {
    let a = (await request().list('farm_activities', farm.id, { module_key: module.key }))[0];
    if (!a) a = await activity(module.key);
    const type = module.types[0];
    const u = await unit(a, { name: `Ficha ${module.key}`, unit_type: type, ...(module.species.length ? { species: module.species[0] } : {}), ...(type === 'animal' ? { owner_name: 'Informação a corrigir' } : {}) });
    const inspection = await event(a, u, 'inspection', { description: `Inspeção de ${module.label}` });
    await save('production_events', { description: `Inspeção corrigida: ${module.label}` }, inspection.id);
    assert.match((await request().one('production_events', farm.id, inspection.id)).description, /corrigida/);
    if (type === 'animal') {
      await save('production_units', { owner_name: null }, u.id);
      assert.equal((await request().one('production_units', farm.id, u.id)).owner_name, null);
    }
  }
});

test('Relatório de uma ficha preserva escopo, unidades e correções sem misturar outras atividades', async () => {
  const a = (await request().list('farm_activities', farm.id, { module_key: 'equines' }))[0];
  const u = (await request().list('production_units', farm.id, { activity_id: a.id })).find(row => row.name === 'Luna');
  const text = await buildFarmReportText(request(), farm.id, { production_unit_id: u.id });
  assert.match(text, /Atividade equines/);
  assert.match(text, /18.32 s/);
  assert.match(text, /Ferrageamento da Luna/);
  assert.match(text, /AGENDA NO PERÍODO/);
  assert.doesNotMatch(text, /Atividade aquaculture|Vaca 20|Inspeção corrigida: Apicultura/);
  await assert.rejects(buildFarmReportText(request(), otherFarm.id), /sem acesso/);
  const all = await buildFarmReportText(request(), farm.id);
  assert.match(all, /Viveiro 1/);
});

test('O agente grava uma pesagem relatada e confirma valores persistidos sem depender do texto do modelo', async () => {
  const a = (await request().list('farm_activities', farm.id, { module_key: 'beef_cattle' }))[0];
  const u = await unit(a, { name: 'Boi 900', identifier: '900', unit_type: 'animal', species: 'bovine' });
  let round = 0;
  const text = 'O animal de brinco 900 pesou 350 kg hoje';
  assert.equal(intentHint(text), 'operation_registration');
  assert.equal(isExplicitWriteRequest(text), true);
  const reply = await runAgent({ user, service: request(), text, provider: {
    inputParts: async ({ text }) => [{ text }],
    turn: async ({ tools, contents }) => {
      assert.ok(tools.some(t => t.name === 'save_agro_record'));
      assert.doesNotMatch(contents[0].parts[0].text, /Boi 900/); // Whole herds are not loaded into the prompt.
      if (round++ === 0) return { calls: [{ name: 'save_agro_record', args: { farm_id: farm.id, entity: 'production_events', values: { activity_id: a.id, production_unit_id: u.id, event_type: 'weighing', event_date: '2026-09-30', description: 'Pesagem do animal 900', quantity: 350, unit: 'kg' } } }] };
      return { calls: [], text: 'Registrei 999 kg.' };
    },
  } });
  assert.match(reply, /350 kg/);
  assert.doesNotMatch(reply, /999/);
  assert.equal(Number((await request().list('production_events', farm.id, { production_unit_id: u.id }))[0].quantity), 350);
});

test('Consulta modular força leitura; resumo por ficha é compacto e não expõe contagem de outras fichas', async () => {
  const a = (await request().list('farm_activities', farm.id, { module_key: 'equines' }))[0];
  const u = (await request().list('production_units', farm.id, { activity_id: a.id })).find(row => row.name === 'Luna');
  const tools = createTools(request(), { text: 'Mostre o histórico da Luna' });
  const summary = await tools.find(t => t.name === 'get_agro_summary').run({ farm_id: farm.id, filters: { production_unit_id: u.id } });
  assert.equal(summary.units_count, 1); assert.equal(summary.units_partial, false);
  assert.equal(summary.units.length, 1);
  const options = await tools.find(t => t.name === 'get_agro_options').run({ module_key: 'aquaculture' });
  assert.deepEqual(options.events.harvest.fields.find(f => f.key === 'unit').options, ['kg']);
  let round = 0;
  const reply = await runAgent({ user, service: request(), text: 'Mostre o histórico da Luna', provider: {
    inputParts: async ({ text }) => [{ text }],
    turn: async ({ toolMode }) => {
      if (round++ === 0) return { calls: [], text: 'Sem registros.' };
      if (round === 2) { assert.equal(toolMode, 'ANY'); return { calls: [{ name: 'get_agro_summary', args: { farm_id: farm.id, filters: { production_unit_id: u.id } } }] }; }
      return { calls: [], text: 'Luna: 1 treino realizado.' };
    },
  } });
  assert.match(reply, /Luna: 1 treino/);
  assert.equal(isExplicitWriteRequest('Quanto leite a vaca produziu?'), false);
});

test('Desabilitar módulos mantém despesas antigas e remove novas entidades e ferramentas', async () => {
  const original = process.env.AGRO_MODULES_ENABLED;
  try {
    process.env.AGRO_MODULES_ENABLED = 'false';
    assert.equal(createTools(request()).some(t => t.name === 'save_agro_record'), false);
    await assert.rejects(request().list('production_units', farm.id), /não está habilitado/);
    const expense = await save('farm_expenses', { description: 'Despesa geral anterior', category: 'outros', amount: 5, expense_date: '2026-09-30' });
    assert.equal(Number((await save('farm_expenses', { amount: 6 }, expense.id)).amount), 6);
    assert.doesNotMatch(await buildFarmReportText(request(), farm.id), /ATIVIDADES PRODUTIVAS/);
  } finally { process.env.AGRO_MODULES_ENABLED = original; }
});

test('Novas tabelas mantêm RLS e acesso exclusivo pelo servidor', async () => {
  for (const table of ['farm_activities', 'production_units', 'production_events', 'farm_sales', 'sale_payments']) {
    const { rows } = await pg.query("select relrowsecurity,has_table_privilege('anon',oid,'SELECT') anon_read,has_table_privilege('authenticated',oid,'INSERT') auth_write,has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE') server_access from pg_class where relnamespace='public'::regnamespace and relname=$1", [table]);
    assert.equal(rows[0].relrowsecurity, true);
    assert.equal(rows[0].anon_read, false); assert.equal(rows[0].auth_write, false);
    assert.equal(rows[0].server_access, true);
  }
  const { rows } = await pg.query("select has_function_privilege('anon','apply_rural_action(uuid,text,text,text,jsonb)','EXECUTE') allowed");
  assert.equal(rows[0].allowed, false);
});

test('Custos mistos de animais e áreas não viram custo por hectare por suposição', async () => {
  await save('farms', { total_area_ha: 10 }, farm.id);
  const totals = await request().expenses(farm.id);
  assert.ok(totals.amount > 0);
  assert.equal(totals.cost_per_ha, null);
});
