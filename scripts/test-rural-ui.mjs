// Browser-only fixtures. Never mounted by the production app.
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { createApp } from "../src/app.js";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = createApp().listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
await mkdir("test-artifacts", { recursive: true });
const farm = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Fazenda Santa Helena (teste)",
  city: "Resende",
  state: "RJ",
  total_area_ha: 42,
  timezone: "America/Sao_Paulo",
};
const authStub = `export const initCustomerSupabase=async()=>{};export const getSession=async()=>({});export const signOutCustomer=async()=>{};
const call=async(path,method='GET',body)=>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok)throw Object.assign(new Error(j.error),{status:r.status});return j;};
export const apiGet=p=>call(p);export const apiPost=(p,b)=>call(p,'POST',b);export const apiPatch=(p,b)=>call(p,'PATCH',b);export const apiDelete=(p,b)=>call(p,'DELETE',b);`;
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let mode = "populated",
      created = 0;
    await page.route("**/shared/supabaseAuth.js", (r) =>
      r.fulfill({ contentType: "text/javascript", body: authStub }),
    );
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data;
      if (path === "/api/customer/me")
        data = {
          linked: true,
          email: "teste@example.test",
          profile: { name: "João", phone: "+5524999999999", isPaid: false },
          usage: {},
          organization: null,
        };
      else if (
        path === "/api/rural/farms" &&
        route.request().method() === "POST"
      ) {
        created++;
        mode = "populated";
        data = { data: farm };
      } else if (path === "/api/rural/farms")
        data = { data: mode === "empty" ? [] : [farm] };
      else if (path.endsWith("/summary")) {
        if (mode === "error")
          return route.fulfill({
            status: 503,
            json: { error: "Não foi possível acessar os dados rurais." },
          });
        data = {
          data: {
            farm,
            seasons: [{ name: "Safra 2026/27", status: "active" }],
            fields: [{ id: "field1", name: "Talhão Norte", area_ha: 12 }],
            operations: [
              { operation_date: "2026-09-28", description: "Plantio de milho" },
            ],
            tasks: [
              {
                id: "task1",
                title: "Verificar o milho",
                status: "pending",
                due_at: "2026-10-03T12:00:00Z",
              },
            ],
            occurrences: [],
            inventory: [],
            alerts: [],
            expenses: { amount: 3150 },
          },
        };
      } else if (path.endsWith("/weather"))
        return route.fulfill({
          status: 503,
          json: { error: "Clima indisponível" },
        });
      else data = { data: {} };
      return route.fulfill({ json: data });
    });
    await page.goto(base + "/area-do-cliente");
    await page.getByText("Registros atualizados.", { exact: false }).waitFor();
    await page.screenshot({
      path: `test-artifacts/rural-${width}.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.equal(
      await page.getByRole("heading", { name: "Plano e uso" }).count(),
      1,
    );
    mode = "empty";
    await page.getByRole("button", { name: "Atualizar", exact: true }).click();
    await page
      .getByText("Você ainda não cadastrou uma propriedade.", { exact: false })
      .waitFor();
    await page.screenshot({
      path: `test-artifacts/rural-empty-${width}.png`,
      fullPage: true,
    });
    await page
      .getByLabel("Nome da propriedade", { exact: true })
      .fill("Fazenda teste");
    await page
      .getByRole("button", { name: "Salvar propriedade", exact: true })
      .click();
    await page.getByText("Registros atualizados.", { exact: false }).waitFor();
    assert.equal(created, 1);
    mode = "error";
    await page.getByRole("button", { name: "Atualizar", exact: true }).click();
    await page
      .getByText("Não foi possível acessar os dados rurais.", { exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "UI: desktop/mobile, no overflow, empty, create, error, existing account controls: OK",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
