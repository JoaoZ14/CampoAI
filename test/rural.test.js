import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "./support/database.js";
import { RuralRepository } from "../src/rural/repository.js";
import { RuralService, expenseTotals } from "../src/rural/service.js";
import { createTools, executeTool } from "../src/ai/tools/catalog.js";
import { runAgent } from "../src/ai/agent/runAgent.js";
import { OpenMeteoProvider, WeatherService } from "../src/rural/weather.js";
import {
  dispatchReminder,
  enqueueRuralMessage,
} from "../src/jobs/ruralWorker.js";
import { tryResolveFieldCalcMessage } from "../src/services/fieldCalcService.js";
import { validate, object, str } from "../src/rural/validation.js";
import { deterministicSafety } from "../src/ai/policies/intent.js";
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
let pg, repo, user, service, other, farm, field, season;
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
