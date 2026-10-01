import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "./support/database.js";
import { RuralRepository } from "../src/rural/repository.js";
import { RuralService, expenseTotals } from "../src/rural/service.js";
import { createTools, executeTool } from "../src/ai/tools/catalog.js";
import { runAgent } from "../src/ai/agent/runAgent.js";
import { simpleFuelExpense } from "../src/ai/agent/directExpense.js";
import { OpenMeteoProvider, WeatherService } from "../src/rural/weather.js";
import {
  dispatchReminder,
  enqueueRuralMessage,
} from "../src/jobs/ruralWorker.js";
import { tryResolveFieldCalcMessage } from "../src/services/fieldCalcService.js";
import { validate, object, str } from "../src/rural/validation.js";
import { deterministicSafety, isExplicitWriteRequest } from "../src/ai/policies/intent.js";
import { buildFarmReportText } from "../src/rural/reports.js";
import { buildConversationReportPdf } from "../src/services/reportPdfService.js";
import { MarketPriceProvider } from "../src/rural/market.js";
import {
  rememberIncomingMedia,
  loadOccurrenceMedia,
  attachPendingMedia,
  expireMedia,
} from "../src/rural/media.js";
import { buildContext } from "../src/ai/context/buildContext.js";
import {
  GeminiAgentProvider,
  geminiSchema,
} from "../src/ai/agent/geminiProvider.js";
import { actionReceipt } from "../src/ai/policies/receipts.js";
import { firstContactReply } from "../src/ai/policies/onboarding.js";
import { publicActivity } from "../src/rural/activity.js";
import { ruralQuery } from "../src/rural/httpQuery.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { AppError } from "../src/utils/errors.js";
import { customerWorkspace } from "../src/services/customerWorkspace.js";
let pg, repo, user, service, other, farm, field, season;
test('workspace exposes effective capabilities and configured public contact only', () => {
  const original = process.env.TWILIO_WHATSAPP_FROM;
  const reminder = process.env.REMINDER_CONTENT_SID;
  try {
    process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+5511999999999';
    delete process.env.REMINDER_CONTENT_SID;
    const data = customerWorkspace({ id: 'test', name: 'Teste', phone: 'private', authUserId: 'private' }, 'test@example.test');
    assert.equal(data.whatsappUrl, 'https://wa.me/5511999999999');
    assert.equal(data.capabilities.reminders, false);
    assert.equal(JSON.stringify(data).includes('private'), false);
    assert.equal(customerWorkspace(null, '').linked, false);
  } finally {
    if (original === undefined) delete process.env.TWILIO_WHATSAPP_FROM; else process.env.TWILIO_WHATSAPP_FROM = original;
    if (reminder === undefined) delete process.env.REMINDER_CONTENT_SID; else process.env.REMINDER_CONTENT_SID = reminder;
  }
});
test('HTTP pagination converts scalar strings and rejects ambiguous filters', () => {
  assert.deepEqual(ruralQuery({ offset: '50', status: 'pending' }), { offset: 50, status: 'pending' });
  for (const offset of ['-1', '1.5', '100001', '', '5e1', ['50'], { value: '50' }])
    assert.throws(() => ruralQuery({ offset }), error => error.statusCode === 400);
  assert.throws(() => ruralQuery({ from: '2026-10-02', to: '2026-10-01' }), /data inicial/);
});
test('API hides infrastructure errors but preserves actionable client errors and correlation', () => {
  const saved = console.error;
  console.error = () => {};
  try {
    let body, status;
    const res = { status(value) { status = value; return this; }, json(value) { body = value; } };
    errorHandler(new AppError('column users.auth_user_id does not exist', 503), { requestId: 'test-request' }, res);
    assert.equal(status, 503);
    assert.equal(body.requestId, 'test-request');
    assert.equal(JSON.stringify(body).includes('auth_user_id'), false);
    errorHandler(new AppError('Informe a data da tarefa.', 400), {}, res);
    assert.equal(status, 400);
    assert.equal(body.error, 'Informe a data da tarefa.');
  } finally { console.error = saved; }
});
test('fuel shortcut never discards a date, another farm, conditions or an extra amount', () => {
  assert.deepEqual(simpleFuelExpense('Anote R$ 1.250,50 de diesel hoje'), { amount: 1250.5, category: 'combustivel', description: 'Diesel' });
  for (const text of [
    'Registre 350 reais de diesel amanhã', 'Registre 350 reais de diesel na Fazenda Sul',
    'Registre 350 reais de diesel e 100 de adubo', 'Registre 350 reais de diesel se ainda não tiver registrado',
    'Registre 35.00 reais de diesel', 'Registre 1.23.456 reais de diesel',
    'Registre 350 reais de diesel em 2026-09-01', 'Registre 350 reais de diesel semana que vem',
  ]) assert.equal(simpleFuelExpense(text), null, text);
});
test("customer activity exposes a safe summary of persisted changes", () => {
  const row = {
    id: "action-1",
    created_at: "2026-09-28T12:00:00Z",
    source_message_id: "SMexample",
    status: "success",
    input_json: { changes: [{ table: "farm_tasks", before: null, after: { id: "task-1", title: "Conferir bomba", private_note: "secret" } }] },
    output_json: { private_note: "secret" },
  };
  const result = publicActivity(row);
  assert.equal(result.source, "lida");
  assert.equal(result.changes[0].title, "Conferir bomba");
  assert.equal(result.changes[0].entity_id, "task-1");
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(JSON.stringify(result).includes("SMexample"), false);
});
before(async () => {
  for (const flag of [
    "AGENT_TOOLS_ENABLED",
    "FARM_MEMORY_ENABLED",
    "WEATHER_ENABLED",
    "REMINDERS_ENABLED",
    "EXPENSES_ENABLED",
    "INVENTORY_ENABLED",
    "FARM_REPORTS_ENABLED",
    "OCCURRENCES_ENABLED",
  ])
    process.env[flag] = "true";
  process.env.REMINDER_CONTENT_SID = "HX" + "1".repeat(32);
  const data = await database();
  pg = data.pg;
  repo = new RuralRepository(data.db);
  user = { id: randomUUID() };
  other = { id: randomUUID() };
  await pg.query("insert into users(id,phone) values($1,$2),($3,$4)", [
    user.id,
    "+5524999999999",
    other.id,
    "+5524988888888",
  ]);
  service = new RuralService(user, repo, "SM" + "a".repeat(32));
});
after(async () => {
  await pg?.close();
});
test("first contact guides a new producer without inventing records or spending an analysis", async () => {
  const empty = { farms: [] };
  assert.match(firstContactReply("Oi, acabei de conhecer vocês, tenho um sítio e queria entender como vc pode me ajudar", empty), /como você chama sua propriedade/i);
  assert.match(firstContactReply("Eu planto alface, milho, cebolinha e crio umas galinhas", empty), /ainda não registrei/i);
  assert.equal(firstContactReply("Cadastre minha propriedade Sítio Boa Vista", empty), null);
  assert.equal(firstContactReply("Minha alface está com manchas, o que faço?", empty), null);
  assert.equal(firstContactReply("Acabei de conhecer vocês", { farms: [{ id: randomUUID() }] }), null);
  let charge;
  const reply = await runAgent({
    user: other,
    service: new RuralService(other, repo, randomUUID()),
    text: "Oi, acabei de conhecer vocês, tenho um sítio e queria entender como vc pode me ajudar",
    provider: { turn: () => { throw new Error("O modelo não deve ser chamado no primeiro contato."); } },
    onOutcome: outcome => { charge = outcome.charge; },
  });
  assert.match(reply, /propriedade/i);
  assert.equal(charge, false);
  assert.equal((await repo.farms(other.id)).length, 0);
});
test("migrations: server-only permissions and RLS", async () => {
  const r = await pg.query(
    "select has_table_privilege('authenticated','farms','SELECT') allowed, relrowsecurity from pg_class where relname='farms'",
  );
  assert.equal(r.rows[0].allowed, false);
  assert.equal(r.rows[0].relrowsecurity, true);
  const fn = await pg.query(
    "select has_function_privilege('anon','apply_rural_action(uuid,text,text,text,jsonb)','EXECUTE') allowed",
  );
  assert.equal(fn.rows[0].allowed, false);
});
test('HTTP offset reaches the real database without overlapping pages', async () => {
  const owner = { id: randomUUID() };
  await pg.query('insert into users(id,phone) values($1,$2)', [owner.id, '+5524966666666']);
  const local = new RuralService(owner, repo, randomUUID());
  const ownFarm = await local.save('farms', null, { name: 'Propriedade de paginação' });
  for (let i = 0; i < 51; i++) await local.save('farm_operations', ownFarm.id, {
    operation_type: 'observacao', operation_date: '2026-10-01', description: `Observação ${i}`,
  });
  const first = await local.list('farm_operations', ownFarm.id, ruralQuery({ offset: '0' }));
  const next = await local.list('farm_operations', ownFarm.id, ruralQuery({ offset: '50' }));
  assert.equal(first.length, 50);
  assert.equal(next.length, 1);
  assert.equal(new Set([...first, ...next].map(row => row.id)).size, 51);
  await assert.rejects(() => new RuralService(other, repo, randomUUID()).list('farm_operations', ownFarm.id), /sem acesso/);
});
test("A: progressive farm, one farm selection, isolation and duplicate action", async () => {
  farm = await service.save("farms", null, {
    total_area_ha: 42,
    city: "Resende",
  });
  assert.equal((await service.farm()).id, farm.id);
  assert.equal(
    (await service.save("farms", null, { city: "Resende", total_area_ha: 42 }))
      .id,
    farm.id,
  );
  await assert.rejects(
    () => new RuralService(other, repo, "other").farm(farm.id),
    /sem acesso/,
  );
  await assert.rejects(
    () => service.save("farms", null, { owner_user_id: other.id }),
    /não permitido/,
  );
});
test("B/C/L: field, planting transaction and persistent cycle lookup", async () => {
  field = await service.save("fields", farm.id, {
    name: "Talhão Norte",
    area_ha: 12,
  });
  season = await service.save("crop_seasons", farm.id, {
    name: "2026/27",
    start_date: "2026-09-01",
    end_date: "2027-08-31",
  });
  const tool = createTools(service).find((t) => t.name === "register_planting");
  const args = {
    farm_id: farm.id,
    values: {
      field_id: field.id,
      crop_season_id: season.id,
      crop_name: "milho",
      planting_date: "2026-09-28",
      area_ha: 12,
    },
  };
  const result = await executeTool(tool, args, service);
  assert.equal(result.length, 2);
  assert.equal(result[1].field_cycle_id, result[0].id);
  const cycles = await service.list("field_cycles", farm.id);
  assert.equal(cycles[0].planting_date, "2026-09-28");
  assert.equal((await service.one("fields", farm.id, field.id)).area_ha, "12");
});
test("field aliases, ambiguity and multi-property context expiration", async () => {
  await service.save("field_aliases", farm.id, {
    field_id: field.id,
    alias: "talhão de baixo",
  });
  assert.equal(
    (await service.resolveField(farm.id, "Talhão de Baixo")).matches[0].id,
    field.id,
  );
  const second = await service.save("farms", null, { name: "Boa Vista" });
  await service.setActive(second.id);
  assert.equal((await service.farm()).id, second.id);
  await pg.query(
    "update assistant_context set expires_at=now()-interval '1 day' where user_id=$1",
    [user.id],
  );
  await assert.rejects(() => service.farm(), /qual propriedade/);
  await assert.rejects(
    () =>
      service.save("farm_operations", second.id, {
        field_id: field.id,
        operation_type: "plantio",
        operation_date: "2026-09-28",
        description: "Milho",
      }),
    /não pertence/,
  );
});
test("D/E: expense, server totals, season scope and replay", async () => {
  const values = {
    amount: 850,
    category: "combustivel",
    description: "Diesel",
    expense_date: "2026-09-28",
    crop_season_id: season.id,
  };
  const one = await service.save("farm_expenses", farm.id, values);
  const two = await service.save("farm_expenses", farm.id, values);
  assert.equal(one.id, two.id);
  const total = await service.expenses(farm.id, { crop_season_id: season.id });
  assert.equal(total.amount, 850);
  assert.equal(total.cost_per_ha, 70.83);
  assert.equal(
    expenseTotals([
      { amount: "0.10", category: "a" },
      { amount: "0.20", category: "a" },
    ]).amount,
    0.3,
  );
});
test("purchase: 10 x 230, transaction rollback, no negative stock", async () => {
  const item = await service.save("inventory_items", farm.id, {
    name: "Adubo",
    category: "fertilizantes",
    unit: "sacos",
  });
  const args = {
    inventory_item_id: item.id,
    quantity: 10,
    unit_price: 230,
    expense_date: "2026-09-28",
    crop_season_id: season.id,
  };
  await service.purchase(farm.id, args);
  await service.purchase(farm.id, args);
  assert.equal(
    Number(
      (await service.one("inventory_items", farm.id, item.id)).current_quantity,
    ),
    10,
  );
  assert.equal((await service.expenses(farm.id)).amount, 3150);
  await assert.rejects(() =>
    service.save("inventory_movements", farm.id, {
      inventory_item_id: item.id,
      type: "usage",
      quantity: 11,
    }),
  );
  const before = (await service.expenses(farm.id)).amount;
  await assert.rejects(() =>
    service.commit("bad_purchase", {}, [
      {
        table: "farm_expenses",
        values: {
          farm_id: farm.id,
          category: "a",
          description: "a",
          amount: 100,
          expense_date: "2026-09-28",
        },
      },
      {
        table: "inventory_movements",
        values: {
          farm_id: farm.id,
          inventory_item_id: item.id,
          type: "usage",
          quantity: 100,
        },
      },
    ]),
  );
  assert.equal((await service.expenses(farm.id)).amount, before);
});
test("F/G: persistent reminder, claim locking and no second send", async () => {
  const task = await service.save("farm_tasks", farm.id, {
    title: "Verificar milho",
    due_at: new Date(Date.now() + 5 * 86400000).toISOString(),
    remind: true,
  });
  assert.equal(
    (await pg.query("select * from scheduled_jobs where task_id=$1", [task.id]))
      .rows.length,
    1,
  );
  await pg.query(
    "update scheduled_jobs set run_at=now()-interval '1 minute' where task_id=$1",
    [task.id],
  );
  const jobs = await repo.result(
    repo.db.rpc("claim_rural_jobs", { p_limit: 10 }),
  );
  assert.equal(jobs.length, 1);
  assert.equal(
    (await repo.result(repo.db.rpc("claim_rural_jobs", { p_limit: 10 })))
      .length,
    0,
  );
  let sends = 0;
  const send = async () => {
    sends++;
    return { sid: "SMsent" };
  };
  await dispatchReminder(repo, jobs[0], send);
  await dispatchReminder(repo, jobs[0], send);
  assert.equal(sends, 1);
});
test("Twilio duplicate inbox and persisted unfinished dispatch", async () => {
  const payload = {
    phone: "+5524999999999",
    messageSid: "SM" + "b".repeat(32),
    message: "Gastei 850 reais de diesel.",
  };
  await enqueueRuralMessage(payload, repo);
  await enqueueRuralMessage(payload, repo);
  assert.equal(
    (await pg.query("select * from assistant_inbox")).rows.length,
    1,
  );
  assert.equal((await repo.result(repo.db.rpc("claim_rural_inbox"))).length, 1);
  assert.equal((await repo.result(repo.db.rpc("claim_rural_inbox"))).length, 0);
});
test("H: coordinates, city/UF, ambiguous city, weather outage and cache", async () => {
  const p = new OpenMeteoProvider(async () => ({
    ok: true,
    json: async () => ({
      results: [
        {
          name: "Resende",
          country_code: "BR",
          admin1: "Rio de Janeiro",
          latitude: -22,
          longitude: -44,
        },
      ],
    }),
  }));
  assert.equal(
    (await p.resolveLocation({ latitude: 1, longitude: 2 })).latitude,
    1,
  );
  assert.equal(
    (await p.resolveLocation({ city: "Resende", state: "RJ" })).latitude,
    -22,
  );
  await assert.rejects(
    () => p.resolveLocation({ city: "Resende", state: "SP" }),
    /segurança/,
  );
  let hits = 0;
  const w = new WeatherService(repo, {
    resolveLocation: async () => ({}),
    forecast: async () => {
      hits++;
      return { daily: { time: ["2026-09-29"] } };
    },
  });
  await w.forecast(farm);
  await w.forecast(farm);
  assert.equal(hits, 1);
  await assert.rejects(
    () =>
      new OpenMeteoProvider(async () => ({ ok: false })).forecast(
        { latitude: 1, longitude: 2 },
        3,
      ),
    /indisponível/,
  );
});
const provider = (responses) => ({
  inputParts: async ({ text }) => [{ text }],
  turn: async () => responses.shift(),
});
test("agent queries call tools; generic conversation never writes; failed tool never reports success", async () => {
  await service.setActive(farm.id);
  let calls = 0;
  const original = repo.farm.bind(repo);
  repo.farm = async (...args) => {
    calls++;
    return original(...args);
  };
  const query = await runAgent({
    user,
    service,
    text: "Quantos hectares tem a fazenda?",
    provider: provider([
      { calls: [{ name: "get_farm_details", args: { farm_id: farm.id } }] },
      { calls: [], text: "Sua propriedade tem 42 hectares." },
    ]),
  });
  assert.match(query, /42/);
  assert.ok(calls > 0);
  const before = (await pg.query("select count(*) from assistant_actions"))
    .rows[0].count;
  const conversation = await runAgent({
    user,
    service,
    text: "Seria interessante registrar meus gastos?",
    provider: provider([
      { calls: [], text: "Sim, isso ajuda a acompanhar seus custos." },
    ]),
  });
  assert.match(conversation, /custos/);
  assert.equal(
    (await pg.query("select count(*) from assistant_actions")).rows[0].count,
    before,
  );
  const bad = await runAgent({
    user,
    service,
    text: "teste",
    provider: provider([
      {
        calls: [{ name: "get_farm_details", args: { farm_id: randomUUID() } }],
      },
      { calls: [], text: "Registrei!" },
    ]),
  });
  assert.doesNotMatch(bad, /Registrei!/);
  const hallucination = await runAgent({
    user,
    service,
    text: "oi",
    provider: provider([{ calls: [], text: "Registrei sua despesa." }]),
  });
  assert.match(hallucination, /Ainda não registrei/);
});
test("simple fuel expense is saved directly; other explicit expenses force a tool call", async () => {
  assert.equal(isExplicitWriteRequest("consegue registrar para mim 350 reais de diesel que eu gastei?"), true);
  assert.equal(isExplicitWriteRequest("Seria interessante registrar meus gastos?"), false);
  assert.equal(isExplicitWriteRequest("Quanto gastei de diesel?"), false);
  assert.equal(simpleFuelExpense("Quanto gastei de diesel?"), null);
  assert.equal(simpleFuelExpense("Registre 350 reais de diesel que gastei ontem"), null);
  assert.equal(simpleFuelExpense("Registre 350 reais de diesel e 100 de gasolina"), null);
  assert.equal(simpleFuelExpense("Comprei 20 litros de diesel por 350 reais"), null);
  let clarificationCharged;
  const noFarmReply = await runAgent({
    user: other,
    service: new RuralService(other, repo, randomUUID()),
    text: "consegue registrar para mim 350 reais de diesel que eu gastei?",
    provider: { turn: () => { throw new Error("Deve pedir a propriedade sem chamar o modelo."); } },
    onOutcome: outcome => { clarificationCharged = outcome.charge; },
  });
  assert.match(noFarmReply, /propriedade/);
  assert.equal(clarificationCharged, false);
  const expenseUser = { id: randomUUID() };
  await pg.query("insert into users(id,phone) values($1,$2)", [expenseUser.id, "+5524977777777"]);
  const local = new RuralService(expenseUser, repo, randomUUID());
  const expenseFarm = await local.save("farms", null, { name: "Sítio do teste", city: "Resende" });
  const today = (await buildContext(local)).local_date;
  const direct = await runAgent({
    user: expenseUser,
    service: new RuralService(expenseUser, repo, randomUUID()),
    text: "consegue registrar para mim 350 reais de diesel que eu gastei?",
    provider: { turn: () => { throw new Error("Registro simples não precisa do modelo."); } },
  });
  assert.match(direct, /R\$\s*350,00/);
  assert.match(direct, /data de hoje/);
  const modes = [];
  const replies = [
    { calls: [], text: "Posso ajudar com isso." },
    { calls: [{ name: "get_farm_details", args: { farm_id: expenseFarm.id } }] },
    { calls: [], text: "Vou registrar a despesa." },
    { calls: [{ name: "create_expense", args: { farm_id: expenseFarm.id, values: { amount: 120, category: "insumos", description: "Adubo", expense_date: today } } }] },
    { calls: [], text: "Despesa registrada." },
  ];
  const result = await runAgent({
    user: expenseUser,
    service: new RuralService(expenseUser, repo, randomUUID()),
    text: "consegue registrar para mim 120 reais de adubo que eu gastei?",
    provider: {
      inputParts: async ({ text }) => [{ text }],
      turn: async ({ toolMode }) => {
        modes.push(toolMode);
        return replies.shift();
      },
    },
  });
  assert.deepEqual(modes, ["AUTO", "ANY", "AUTO", "ANY", "AUTO"]);
  assert.match(result, /R\$\s*120,00/);
  assert.match(result, /insumos/);
  const expenses = await local.list("farm_expenses", expenseFarm.id, { from: today });
  assert.ok(expenses.some((expense) => Number(expense.amount) === 350 && expense.description === "Diesel"));
  assert.ok(expenses.some((expense) => Number(expense.amount) === 120 && expense.description === "Adubo"));
});
test("strict input, calculator and safety policies", () => {
  assert.throws(() =>
    validate(object({ name: str }), { name: "ok", user_id: other.id }),
  );
  assert.match(tryResolveFieldCalcMessage("calc area-ret 320 180"), /5.76 ha/);
  const calc = createTools(service).find((t) => t.name === "calculator");
  assert.throws(() => calc.run({ command: "calc dose 3 4" }));
  assert.match(
    deterministicSafety("Qual dose de defensivo devo usar?"),
    /Não posso prescrever/,
  );
  assert.match(
    deterministicSafety("Minha vaca está caída e não consegue respirar"),
    /veterinário imediatamente/,
  );
  assert.equal(deterministicSafety("Usei 5 litros do produto X."), null);
});
test("cancellation requires persisted confirmation; rescheduling updates same job", async () => {
  const task = await service.save("farm_tasks", farm.id, {
    title: "Vistoria para cancelar",
    due_at: new Date(Date.now() + 86400000).toISOString(),
    remind: true,
  });
  const request = await service.cancelTask(
    farm.id,
    task.id,
    "cancele a vistoria",
  );
  assert.equal(request.confirmation_required, true);
  assert.equal(
    (await service.one("farm_tasks", farm.id, task.id)).status,
    "pending",
  );
  assert.equal(
    (await service.cancelTask(farm.id, task.id, "sim")).cancelled,
    true,
  );
  assert.equal(
    (
      await pg.query("select status from scheduled_jobs where task_id=$1", [
        task.id,
      ])
    ).rows[0].status,
    "cancelled",
  );
  await service.save(
    "farm_tasks",
    farm.id,
    {
      status: "pending",
      due_at: new Date(Date.now() + 2 * 86400000).toISOString(),
    },
    task.id,
  );
  assert.equal(
    (await pg.query("select * from scheduled_jobs where task_id=$1", [task.id]))
      .rows.length,
    1,
  );
});
test("unknown outbound outcome never silently retries", async () => {
  const task = await service.save("farm_tasks", farm.id, {
    title: "Teste timeout",
    due_at: new Date(Date.now() + 86400000).toISOString(),
    remind: true,
  });
  await pg.query(
    "update scheduled_jobs set run_at=now()-interval '1 minute' where task_id=$1",
    [task.id],
  );
  const [job] = await repo.result(
    repo.db.rpc("claim_rural_jobs", { p_limit: 10 }),
  );
  let sends = 0;
  await dispatchReminder(repo, job, async () => {
    sends++;
    throw new Error("timeout after acceptance");
  });
  assert.equal(
    (await pg.query("select status from scheduled_jobs where id=$1", [job.id]))
      .rows[0].status,
    "uncertain",
  );
  await dispatchReminder(repo, job, async () => {
    sends++;
  });
  assert.equal(sends, 1);
});
test("I/J/K: occurrence, farm summary, weekly facts and structured PDF", async () => {
  const occurrence = await service.save("field_occurrences", farm.id, {
    field_id: field.id,
    type: "observacao",
    title: "Manchas nas folhas",
    description: "Manchas visíveis; causa incerta.",
    detected_at: "2026-09-28T12:00:00-03:00",
  });
  await service.save("occurrence_followups", farm.id, {
    occurrence_id: occurrence.id,
    description: "Nova observação sem diagnóstico fechado.",
  });
  const summary = await service.summary(farm.id);
  assert.equal(summary.occurrences.length, 1);
  assert.equal(summary.expenses.amount, 3150);
  const weekly = await service.weekly(farm.id, "2026-09-28", "2026-10-05");
  assert.equal(weekly.operations_count, 1);
  assert.equal(weekly.occurrences_count, 1);
  const text = await buildFarmReportText(service, farm.id, {
    crop_season_id: season.id,
  });
  assert.match(text, /CULTURAS E CICLOS/);
  assert.match(text, /Diesel|combustivel/);
  assert.match(text, /Manchas/);
  const pdf = await buildConversationReportPdf({ body: text });
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdf.length > 1000);
});
test("memory is limited, confirmed, and expired facts are excluded", async () => {
  await assert.rejects(
    () =>
      service.save("assistant_memories", farm.id, {
        type: "preference",
        key: "horario",
        value_json: { text: "De manhã" },
        confirmed: false,
      }),
    /Confirme/,
  );
  await service.save("assistant_memories", farm.id, {
    type: "preference",
    key: "horario",
    value_json: { text: "De manhã" },
    confirmed: true,
    expires_at: "2020-01-01T00:00:00Z",
  });
  await service.setActive(farm.id);
  assert.equal((await buildContext(service)).memories.length, 0);
});
test("market never presents old quotes as current and preserves source/date", async () => {
  process.env.MARKET_PRICES_URL = "https://example.test/cotacoes.json";
  const market = new MarketPriceProvider(async () => ({
    ok: true,
    json: async () => ({
      items: [
        {
          commodity: "soja",
          uf: "BR",
          price: 127.84,
          unit: "BRL/sc60kg",
          source: "cepea",
          date: "2026-04-09",
        },
      ],
    }),
  }));
  const out = await market.prices("soja", "RJ");
  assert.equal(out.items[0].stale, true);
  assert.equal(out.items[0].source, "cepea");
});
test("media URL isolation and cross-user occurrence access", async () => {
  process.env.FARM_MEDIA_ENABLED = "true";
  await assert.rejects(
    () =>
      rememberIncomingMedia(
        service,
        { active_farm: farm },
        { imageUrl: "http://127.0.0.1/secrets" },
      ),
    /Origem/,
  );
  const rows = await service.list("field_occurrences", farm.id);
  await assert.rejects(
    () =>
      loadOccurrenceMedia(
        new RuralService(other, repo, "other"),
        farm.id,
        rows[0].id,
      ),
    /sem acesso/,
  );
  delete process.env.FARM_MEDIA_ENABLED;
});
test("low-stock alerts are deterministic and resolved by replenishment", async () => {
  const item = await service.save("inventory_items", farm.id, {
    name: "Sementes",
    category: "sementes",
    unit: "sacos",
    minimum_quantity: 5,
  });
  assert.equal(
    (
      await pg.query(
        "select status from assistant_alerts where related_entity_id=$1",
        [item.id],
      )
    ).rows[0].status,
    "pending",
  );
  await service.save("inventory_movements", farm.id, {
    inventory_item_id: item.id,
    type: "entry",
    quantity: 10,
  });
  assert.equal(
    (
      await pg.query(
        "select status from assistant_alerts where related_entity_id=$1",
        [item.id],
      )
    ).rows[0].status,
    "resolved",
  );
});

test("opted-in low-stock alert creates one durable notification per low-stock episode", async () => {
  const item = await service.save("inventory_items", farm.id, {
    name: "Adubo alerta",
    category: "fertilizantes",
    unit: "sacos",
  });
  await service.setInventoryAlert(farm.id, item.id, 5);
  const query =
    "select j.* from scheduled_jobs j join assistant_alerts a on a.id=j.alert_id where a.related_entity_id=$1";
  let jobs = (await pg.query(query, [item.id])).rows;
  assert.equal(jobs.length, 1);
  await service.save("inventory_movements", farm.id, {
    inventory_item_id: item.id,
    type: "entry",
    quantity: 2,
  });
  assert.equal((await pg.query(query, [item.id])).rows.length, 1);
  let sends = 0;
  const claimed = await repo.result(
    repo.db.rpc("claim_rural_jobs", { p_limit: 10 }),
  );
  const job = claimed.find((j) => j.alert_id === jobs[0].alert_id);
  await dispatchReminder(repo, job, async () => {
    sends++;
    return { sid: "SMstock" };
  });
  assert.equal(sends, 1);
  await service.save("inventory_movements", farm.id, {
    inventory_item_id: item.id,
    type: "entry",
    quantity: 10,
  });
  await service.save("inventory_movements", farm.id, {
    inventory_item_id: item.id,
    type: "usage",
    quantity: 10,
  });
  jobs = (await pg.query(query, [item.id])).rows;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, "pending");
});

test("consented occurrence media stays private, is retrieved for comparison, and expires", async () => {
  const originalFetch = globalThis.fetch;
  const oldSid = process.env.TWILIO_ACCOUNT_SID,
    oldToken = process.env.TWILIO_AUTH_TOKEN;
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "test-only";
  process.env.FARM_MEDIA_ENABLED = "true";
  const objects = new Map();
  repo.db.storage = {
    from(bucket) {
      assert.equal(bucket, "farm-media");
      return {
        upload: async (path, data) => {
          objects.set(path, data);
          return { error: null };
        },
        download: async (path) => ({
          data: new Blob([objects.get(path)]),
          error: null,
        }),
        remove: async (paths) => {
          paths.forEach((p) => objects.delete(p));
          return { error: null };
        },
      };
    },
  };
  globalThis.fetch = async () =>
    new Response(Buffer.from("test-image-bytes"), {
      headers: { "content-type": "image/png" },
    });
  try {
    const occurrence = (await service.list("field_occurrences", farm.id))[0];
    await rememberIncomingMedia(
      service,
      { active_farm: farm, active_field: field },
      {
        imageUrl:
          "https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages/SMtest/Media/MEtest",
      },
    );
    assert.equal(
      (await attachPendingMedia(service, occurrence)).attached,
      true,
    );
    assert.equal(objects.size, 1);
    assert.equal(
      (await loadOccurrenceMedia(service, farm.id, occurrence.id)).attachments
        .length,
      1,
    );
    assert.equal(service.toolMedia.length, 1);
    await pg.query(
      "update message_attachments set expires_at=now()-interval '1 minute'",
    );
    await expireMedia(repo);
    assert.equal(objects.size, 0);
    assert.equal(
      (await pg.query("select count(*) from message_attachments")).rows[0]
        .count,
      0,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (oldSid === undefined) delete process.env.TWILIO_ACCOUNT_SID;
    else process.env.TWILIO_ACCOUNT_SID = oldSid;
    if (oldToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
    else process.env.TWILIO_AUTH_TOKEN = oldToken;
    delete process.env.FARM_MEDIA_ENABLED;
  }
});

test("Gemini transient fallback locks native tool conversation to successful model", async () => {
  const old = process.env.GEMINI_API_KEY,
    model = process.env.GEMINI_AGENT_MODEL,
    fallback = process.env.GEMINI_AGENT_FALLBACK;
  process.env.GEMINI_API_KEY = "test-only";
  process.env.GEMINI_AGENT_MODEL = "primary";
  process.env.GEMINI_AGENT_FALLBACK = "fallback";
  try {
    const p = new GeminiAgentProvider();
    const models = [];
    p.generate = async ({ modelName }) => {
      models.push(modelName);
      if (modelName === "primary")
        throw Object.assign(new Error("busy"), { status: 503 });
      return {
        calls: [{ name: "get_user_farms", args: {} }],
        text: "",
        content: {
          role: "model",
          parts: [
            {
              functionCall: { name: "get_user_farms", args: {} },
              thoughtSignature: "preserve-me",
            },
          ],
        },
      };
    };
    await p.turn({});
    await p.turn({});
    assert.deepEqual(models, ["primary", "fallback", "fallback"]);
    assert.deepEqual(geminiSchema(object({ name: str })), {
      type: "object",
      properties: { name: { type: "string" } },
    });
    let requestedMode;
    const configProvider = new GeminiAgentProvider();
    configProvider.client = {
      getGenerativeModel: (config) => {
        requestedMode = config.toolConfig.functionCallingConfig.mode;
        return { generateContent: async () => ({ response: { functionCalls: () => [], text: () => "", candidates: [] } }) };
      },
    };
    await configProvider.generate({ system: "test", contents: [], tools: [{ name: "get_user_farms", description: "test", parameters: object({}) }], toolMode: "ANY", modelName: "test", timeoutMs: 1000 });
    assert.equal(requestedMode, "ANY");
    const timeoutProvider = new GeminiAgentProvider();
    const attempted = [];
    timeoutProvider.generate = async ({ modelName, timeoutMs }) => {
      attempted.push({ modelName, timeoutMs });
      if (modelName === "primary") throw Object.assign(new Error("timed out"), { name: "AbortError" });
      return { calls: [], text: "Disponível." };
    };
    assert.equal((await timeoutProvider.turn({ timeoutMs: 60000 })).text, "Disponível.");
    assert.deepEqual(attempted.map((item) => item.modelName), ["primary", "fallback"]);
    assert.ok(attempted[0].timeoutMs < 60000);
  } finally {
    for (const [key, value] of Object.entries({
      GEMINI_API_KEY: old,
      GEMINI_AGENT_MODEL: model,
      GEMINI_AGENT_FALLBACK: fallback,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
test("write acknowledgements use persisted amounts instead of model claims", async () => {
  const local = new RuralService(user, repo, randomUUID());
  const result = await runAgent({
    user,
    service: local,
    text: "Gastei 20 de diesel",
    provider: provider([
      {
        calls: [
          {
            name: "create_expense",
            args: {
              farm_id: farm.id,
              values: {
                amount: 20,
                category: "combustivel",
                description: "Diesel teste",
                expense_date: "2026-09-28",
              },
            },
          },
        ],
      },
      { calls: [], text: "Registrei 999 mil e agendei um lembrete." },
    ]),
  });
  assert.match(result, /20,00/);
  assert.doesNotMatch(result, /999|lembrete/);
  assert.match(
    actionReceipt("create_task", {
      title: "Ver milho",
      due_at: "2026-10-03T12:00:00Z",
      status: "pending",
      remind: true,
    }),
    /09:00/,
  );
});
test("a provider outage after a write still returns the persisted receipt", async () => {
  const local = new RuralService(user, repo, randomUUID());
  let calls = 0;
  const result = await runAgent({
    user,
    service: local,
    text: "Registre 33 reais de adubo que gastei hoje",
    provider: {
      inputParts: async ({ text }) => [{ text }],
      turn: async () => {
        if (calls++ === 0) return { calls: [{ name: "create_expense", args: { farm_id: farm.id, values: { amount: 33, category: "insumos", description: "Adubo", expense_date: "2026-09-30" } } }] };
        throw Object.assign(new Error("provider indisponível"), { status: 503 });
      },
    },
  });
  assert.match(result, /R\$\s*33,00/);
  assert.match(result, /interrompida/);
  assert.ok((await local.list("farm_expenses", farm.id)).some((expense) => Number(expense.amount) === 33));
});
