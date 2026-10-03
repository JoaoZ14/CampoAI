// Synthetic login and intercepted responses. No real users, WhatsApp or database writes.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { agroCatalog } from '../src/rural/agroCatalog.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = createApp().listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
await mkdir('test-artifacts/dashboard', { recursive: true });
const farms = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Sítio Boa Vista', timezone: 'America/Sao_Paulo' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'CT Horizonte', timezone: 'America/Sao_Paulo' },
];
const user = { id: '33333333-3333-4333-8333-333333333333', email: 'teste@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: 'fixture-token', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user };
const task = { id: 'task-test', title: 'Revisar bomba de irrigação', due_at: '2026-10-01T12:00:00Z', status: 'pending' };
const action = (id, entity, label, title, details, source = 'lida') => ({ id, created_at: '2026-10-01T14:30:00Z', source, status: 'completed', changes: [{ entity, entity_id: id, label, title, type: 'created', details }] });
const records = [
  action('expense-test', 'farm_expenses', 'Despesa', 'Diesel para o trator', { amount: 350, expense_date: '2026-10-01' }),
  action('harvest-test', 'production_events', 'Registro de produção', 'Cebolinha colhida no Canteiro 3', { quantity: 20, unit: 'maço', event_type: 'harvest', event_date: '2026-10-01' }),
  action('milk-test', 'production_events', 'Registro de produção', 'Ordenha da manhã', { quantity: 85, unit: 'l', event_type: 'milk', event_date: '2026-10-01' }),
  action('task-test', 'farm_tasks', 'Tarefa', task.title, { due_at: task.due_at }),
  action('app-test', 'farm_expenses', 'Despesa', 'Compra de sementes', { amount: 100, expense_date: '2026-10-01' }, 'app'),
];
const fixture = {
  generated_at: '2026-10-01T15:00:00Z', timezone: 'America/Sao_Paulo', today: '2026-10-01',
  period: { from: '2026-10-01', to_exclusive: '2026-11-01' }, modules_enabled: true,
  expenses: { amount: 450, count: 2, recent: [{ id: 'expense-test', description: 'Diesel para o trator', amount: 350, expense_date: '2026-10-01', category: 'combustivel' }] },
  agenda: { pending: 2, today: 1, overdue: 1, next: [task] },
  activities: [{ id: 'horta', name: 'Horta', module_key: 'horticulture', units: 3 }, { id: 'leite', name: 'Gado de leite', module_key: 'dairy_cattle', units: 1 }, { id: 'aves', name: 'Galinhas', module_key: 'poultry', units: 1 }], units_count: 5,
  production: [
    { activity_id: 'horta', production_unit_id: 'canteiro', name: 'Canteiro 3', event_type: 'harvest', unit: 'maço', quantity: 20 },
    { activity_id: 'leite', production_unit_id: 'lote', name: 'Lote Leiteiro', event_type: 'milk', unit: 'l', quantity: 85 },
    { activity_id: 'aves', production_unit_id: 'galinheiro', name: 'Galinheiro 1', event_type: 'production', unit: 'un', quantity: 42 },
  ], recent_records: records,
};
let checks = 0; let diagnosticPage;
function check(value, message) { assert.ok(value, message); checks++; }
try {
  for (const width of [1440, 768, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/London', reducedMotion: 'reduce' });
    await context.addInitScript(value => localStorage.setItem('ag-customer-auth', JSON.stringify(value)), session);
    const page = await context.newPage(); diagnosticPage = page;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let fail = false, empty = false, slowFirst = false, dashboardRequests = 0, summaryReady = false, productionQuery, summaryRequests = 0;
    const periodRequests = [];
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      let data, status = 200;
      if (path === '/api/customer/config') { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, supabaseUrl: 'https://auth.example.test', supabaseAnonKey: 'public-test-key' }) }); return; }
      if (path === '/api/customer/workspace') data = { linked: true, capabilities: { reminders: false, modules: true }, whatsappUrl: 'https://wa.me/5511999999999' };
      else if (path === '/api/rural/farms') data = farms;
      else {
        const second = path.includes(farms[1].id), farm = farms[second ? 1 : 0];
        if (path.endsWith('/dashboard')) {
          dashboardRequests++;
          if (slowFirst && !second) await new Promise(done => setTimeout(done, 650));
          if (fail) { status = 503; data = { error: 'private database diagnostic' }; }
          else if (empty || second) data = { ...fixture, expenses: { amount: 0, count: 0, recent: [] }, agenda: { pending: 0, today: 0, overdue: 0, next: [] }, production: [], activities: [], units_count: 0, recent_records: [] };
          else {
            const period = url.searchParams.get('period') || 'month'; periodRequests.push(url.searchParams);
            data = structuredClone(fixture);
            if (period === 'previous_month') { data.period = { from: '2026-09-01', to_exclusive: '2026-10-01' }; data.expenses.amount = 120; }
            if (period === 'today') { data.period = { from: data.today, to_exclusive: '2026-10-02' }; data.expenses.amount = 350; }
            if (period === 'custom') { data.period = { from: url.searchParams.get('from'), to_exclusive: url.searchParams.get('to') }; data.expenses.amount = 470; }
          }
        } else if (path.endsWith('/summary')) {
          summaryRequests++;
          await new Promise(done => setTimeout(done, 900)); summaryReady = true;
          data = { farm, fields: [], seasons: [], tasks: [], operations: [], expenses: { amount: 9999, count: 50, cost_per_ha: null }, alerts: [] };
        } else if (path.endsWith('/weather')) { status = 400; data = { error: 'Localização não cadastrada' }; }
        else if (path.endsWith('/activity')) data = { items: records, has_more: false };
        else if (path.endsWith('/farm_tasks')) data = [task];
        else if (path.endsWith('/history')) data = { items: [records[0], { ...records[0], id: 'older-audit', created_at: '2026-09-30T14:00:00Z', changes: [{ ...records[0].changes[0], details: { amount: 320 } }] }], has_more: false };
        else if (path.endsWith('/farm_expenses/expense-test')) data = { id: 'expense-test', description: 'Diesel para o trator', amount: 350, expense_date: '2026-10-01', category: 'combustivel' };
        else if (path.endsWith('/agro/overview')) {
          productionQuery = url.searchParams;
          data = { activities: fixture.activities.map(row => ({ ...row, status: 'active' })), units: [], catalog: agroCatalog(), unit_stats: {}, production_totals: [], recent_events: [{ id: 'harvest-test', description: 'Cebolinha colhida', event_type: 'harvest', event_date: '2026-10-01', production_unit_id: 'canteiro', status: 'active', quantity: 20, unit: 'maço' }], sales: [], expenses: [], tasks: [], feed_inventory: [], financial: null, more_events: false, more_sales: false, more_expenses: false, more_tasks: false };
        } else if (path.endsWith('/farm_operations') || path.endsWith('/farm_expenses')) data = [];
        else if (path.endsWith('/expenses/summary')) data = { amount: 0, count: 0, cost_per_ha: null };
        else { status = 404; data = { error: 'Fixture unavailable' }; }
      }
      try { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { ok: true, data } : { ok: false, ...data }) }); } catch { /* interrupted when switching property */ }
    });
    await page.goto(`${base}/app/`);
    await page.locator('.dash-record').first().waitFor();
    check(!summaryReady, `${width}: dashboard does not wait for the slower old summary`);
    check(await page.getByRole('heading', { name: 'Seu resumo', exact: true }).count() === 1, `${width}: clear start`);
    check((await page.locator('.dash-number.expenses').innerText()).includes('450,00'), `${width}: monthly total, not lifetime summary`);
    check((await page.locator('.dash-number.expenses').innerText()).includes('outubro de 2026'), `${width}: explicit period`);
    check((await page.locator('.dash-record').first().innerText()).includes('350,00'), `${width}: expense amount immediately visible`);
    check((await page.locator('.dash-record').nth(1).innerText()).includes('20 maços'), `${width}: harvest quantity visible`);
    check((await page.locator('.dash-record').nth(2).innerText()).includes('85 litros'), `${width}: milk quantity visible`);
    check((await page.locator('.dash-record').first().innerText()).includes('Hoje, 11:30'), `${width}: farm timezone, not browser London`);
    check((await page.locator('.dash-record').last().innerText()).includes('Feito no app'), `${width}: app writes also included`);
    check(await page.getByRole('button', { name: 'Atualizar resumo', exact: true }).isVisible(), `${width}: mobile refresh visible`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no horizontal overflow`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `test-artifacts/dashboard/home-${width}.png`, fullPage: true });
    await page.locator('.dash-record').first().click();
    await page.getByRole('region', { name: 'Registro selecionado' }).waitFor();
    check((await page.getByRole('region', { name: 'Registro selecionado' }).innerText()).includes('350,00'), `${width}: home record opens its actual details`);
    await page.getByText('Histórico deste registro', { exact: true }).click();
    await page.locator('.record-history li').first().waitFor();
    check(await page.locator('.record-history li').count() === 2, `${width}: detail retains the audit history`);
    check((await page.locator('.record-history').innerText()).includes('320,00'), `${width}: original amount visible in history`);
    await page.getByRole('navigation').filter({ visible: true }).getByRole('button', { name: 'Início', exact: true }).click();
    await page.locator('.dash-number.expenses').click();
    check((await page.locator('#dash-expenses').innerText()).includes('Diesel para o trator'), `${width}: spending tile opens read-only expenses`);
    await page.getByRole('button', { name: 'Fechar gastos do mês' }).click();
    await page.getByRole('button', { name: 'Ver minha produção' }).click();
    await page.getByText('Cebolinha colhida', { exact: true }).waitFor();
    check(await page.getByLabel('Período da atividade').inputValue() === 'range', `${width}: production opens the same monthly scope`);
    check(productionQuery?.has('from') && productionQuery?.has('to'), `${width}: half-open month sent to server`);
    await page.getByRole('navigation').filter({ visible: true }).getByRole('button', { name: 'Início', exact: true }).click();
    const summariesBefore = summaryRequests;
    await page.getByLabel('Período de gastos e produção').selectOption('previous_month');
    await page.waitForFunction(() => document.querySelector('.dash-number.expenses')?.textContent.includes('120,00'));
    check((await page.locator('.dash-number.expenses').innerText()).includes('setembro de 2026'), `${width}: previous month explicit`);
    check(await page.locator('.dash-record').count() === 5, `${width}: period does not hide recent records`);
    check(await page.locator('.dash-task').count() === 1, `${width}: period does not hide pending tasks`);
    check(summaryRequests === summariesBefore, `${width}: period does not reload unrelated sections`);
    await page.getByLabel('Período de gastos e produção').selectOption('custom');
    await page.getByLabel('De', { exact: true }).fill('2026-09-30');
    await page.getByLabel('Até', { exact: true }).fill('2026-10-01');
    await page.getByRole('button', { name: 'Consultar período', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.dash-number.expenses')?.textContent.includes('470,00'));
    check(periodRequests.at(-1).get('from') === '2026-09-30' && periodRequests.at(-1).get('to') === '2026-10-02', `${width}: custom includes the last selected day`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: custom controls fit mobile`);
    await page.screenshot({ path: `test-artifacts/dashboard/period-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Ver minha produção' }).click();
    await page.getByText('Cebolinha colhida', { exact: true }).waitFor();
    check(productionQuery?.get('from') === '2026-09-30' && productionQuery?.get('to') === '2026-10-02', `${width}: production keeps the custom period`);
    await page.getByRole('navigation').filter({ visible: true }).getByRole('button', { name: 'Início', exact: true }).click();
    await page.getByLabel('Período de gastos e produção').selectOption('today');
    await page.waitForFunction(() => document.querySelector('.dash-number.expenses')?.textContent.includes('350,00'));
    check(periodRequests.at(-1).get('period') === 'today', `${width}: today uses the local-day preset`);
    await page.getByLabel('Período de gastos e produção').selectOption('month');
    await page.waitForFunction(() => document.querySelector('.dash-number.expenses')?.textContent.includes('450,00'));
    fail = true;
    await page.getByRole('button', { name: 'Atualizar resumo' }).click();
    await page.getByText('Os números abaixo são da última consulta.', { exact: false }).waitFor();
    check((await page.locator('.dash-number.expenses').innerText()).includes('450,00'), `${width}: error keeps last known data`);
    check(!(await page.locator('body').innerText()).includes('private database'), `${width}: diagnostic not exposed`);
    fail = false;
    await page.getByRole('button', { name: 'Atualizar resumo' }).click();
    await page.locator('.dash-stale').waitFor({ state: 'detached' });
    await page.waitForFunction(() => !document.querySelector('.refresh').disabled);
    const before = dashboardRequests;
    await page.evaluate(() => { const original = Date.now.bind(Date); Date.now = () => original() + 12000; window.dispatchEvent(new Event('focus')); });
    await page.waitForFunction(() => document.querySelector('.dash-updated').textContent.includes('Atualizado às'));
    check(dashboardRequests > before, `${width}: returning from WhatsApp refreshes data`);
    slowFirst = true;
    await page.getByLabel('Propriedade', { exact: true }).selectOption(farms[1].id);
    await page.getByLabel('Propriedade', { exact: true }).selectOption(farms[0].id);
    await page.getByLabel('Propriedade', { exact: true }).selectOption(farms[1].id);
    await page.getByRole('heading', { name: 'Seus pedidos vão aparecer aqui.' }).waitFor();
    await new Promise(done => setTimeout(done, 750));
    check(await page.locator('.dash-record').count() === 0, `${width}: late response cannot mix property records`);
    check((await page.locator('.dash-heading').innerText()).includes('CT Horizonte'), `${width}: selected property clear`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: empty state fits viewport`);
    slowFirst = false; fail = true;
    await page.getByLabel('Propriedade', { exact: true }).selectOption(farms[0].id);
    await page.getByRole('heading', { name: 'Não conseguimos abrir o resumo' }).waitFor();
    check(await page.locator('.dash-number').count() === 0, `${width}: initial failure is not a fake zero`);
    fail = false; empty = true;
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await page.getByRole('heading', { name: 'Seus pedidos vão aparecer aqui.' }).waitFor();
    check((await page.locator('.dash-number.expenses').innerText()).includes('0,00'), `${width}: confirmed empty month is zero`);
    await context.setOffline(true);
    await page.getByText('Sem conexão.', { exact: false }).first().waitFor();
    check(!await page.getByRole('button', { name: 'Atualizar resumo' }).isEnabled(), `${width}: offline refresh disabled`);
    check(errors.length === 0, `${width}: no runtime errors ${errors}`);
    await context.close();
  }
  console.log(`PASS: ${checks} verificações da dashboard em desktop, tablet e celular.`);
} catch (error) { if (diagnosticPage && !diagnosticPage.isClosed()) await diagnosticPage.screenshot({ path: 'test-artifacts/dashboard/failure.png', fullPage: true }).catch(() => {}); throw error; } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
