// Explicit live Gemini evaluation against disposable Postgres. No remote DB or WhatsApp calls.
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "../test/support/database.js";
import { RuralRepository } from "../src/rural/repository.js";
import { RuralService } from "../src/rural/service.js";
import { runAgent } from "../src/ai/agent/runAgent.js";
import { GeminiAgentProvider } from "../src/ai/agent/geminiProvider.js";
if (process.env.RUN_LIVE_AGENT_EVAL !== "true")
  throw new Error(
    "Set RUN_LIVE_AGENT_EVAL=true to authorize Gemini API usage with synthetic data.",
  );
if (!process.env.GEMINI_API_KEY)
  throw new Error("Gemini key is not configured.");
for (const flag of [
  "FARM_MEMORY_ENABLED",
  "WEATHER_ENABLED",
  "REMINDERS_ENABLED",
  "EXPENSES_ENABLED",
  "INVENTORY_ENABLED",
  "OCCURRENCES_ENABLED",
])
  process.env[flag] = "true";
process.env.FARM_MEDIA_ENABLED = "false";
process.env.FARM_REPORTS_ENABLED = "false";
const { pg, db } = await database();
const user = { id: randomUUID() };
const repo = new RuralRepository(db);
const history = [];
const provider = new GeminiAgentProvider();
const turn = provider.turn.bind(provider);
provider.turn = async (input) => {
  try {
    return await turn(input);
  } catch (error) {
    console.error(
      "Gemini evaluation:",
      String(error.message)
        .replaceAll(process.env.GEMINI_API_KEY, "[redacted]")
        .slice(0, 1400),
    );
    throw error;
  }
};
try {
  await pg.query("insert into users(id,phone) values($1,$2)", [
    user.id,
    "+5500000000000",
  ]);
  for (const text of [
    "Tenho uma fazenda chamada Teste de 42 hectares em Resende, RJ.",
    "O Talhão Norte tem 12 hectares e plantei milho hoje.",
    "Gastei 850 reais de diesel hoje.",
  ]) {
    const service = new RuralService(user, repo, randomUUID());
    const response = await runAgent({ user, service, text, history, provider });
    history.push({ role: "user", text }, { role: "assistant", text: response });
    console.log(response);
    if (/Não consegui concluir agora|resposta ser interrompida/.test(response))
      throw new Error("Live provider failed; evaluation stopped.");
  }
  const farms = await repo.farms(user.id);
  assert.equal(farms.length, 1);
  assert.equal(Number(farms[0].total_area_ha), 42);
  const cycles = await repo.list("field_cycles", farms[0].id);
  assert.ok(cycles.some((c) => c.crop_name.toLowerCase().includes("milho")));
  const expenses = await repo.list("farm_expenses", farms[0].id);
  assert.ok(expenses.some((e) => Number(e.amount) === 850));
  console.log("Live Gemini + isolated Postgres: A/B/D passed.");
} finally {
  await pg.close();
}
