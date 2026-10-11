// Isolated browser fixtures: no real accounts, database, Gemini or WhatsApp calls.
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
await mkdir('test-artifacts/clarity', { recursive: true });
const farm = { id: '11111111-1111-4111-8111-111111111111', name: 'Sítio Boa Vista', timezone: 'America/Sao_Paulo' };
const user = { id: '33333333-3333-4333-8333-333333333333', email: 'teste@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: 'fixture-token', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user };
let checks = 0, diagnosticPage;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
try {
  for (const width of [1280, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Europe/London', reducedMotion: 'reduce' });
    await context.addInitScript(value => localStorage.setItem('ag-customer-auth', JSON.stringify(value)), session);
    const page = await context.newPage(); diagnosticPage = page;
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let expense = { id: 'expense-test', farm_id: farm.id, description: 'Diesel para o trator', amount: 350, category: 'combustivel', expense_date: '2026-10-01' };
    let task = { id: 'task-test', farm_id: farm.id, title: 'Conferir a água dos animais', due_at: '2099-10-03T12:00:00Z', status: 'pending', remind: true };
    let empty = false, failTask = false, auditRequests = 0, historyRequests = 0, writes = [];
    const lists = [];
    const actions = () => [{ id: 'audit-test', source: 'lida', status: 'completed', created_at: '2026-10-03T15:00:00Z', changes: [{ entity: 'farm_expenses', entity_id: expense.id, label: 'Despesa', title: expense.description, type: 'updated', details: { amount: expense.amount, expense_date: expense.expense_date } }] }];
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url()), path = url.pathname, method = route.request().method();
      let data, status = 200;
      if (path === '/api/customer/config') { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, supabaseUrl: 'https://auth.example.test', supabaseAnonKey: 'public-test-key' }) }); return; }
      if (path === '/api/customer/workspace') data = { linked: true, capabilities: { reminders: true, modules: true }, whatsappUrl: 'https://wa.me/5511999999999' };
      else if (path === '/api/rural/farms') data = [farm];
      else if (path.endsWith('/dashboard')) data = {
        generated_at: '2026-10-03T15:00:00Z', timezone: farm.timezone, today: '2026-10-03', period: { from: '2026-10-01', to_exclusive: '2026-11-01' }, modules_enabled: true,
        expenses: { amount: empty ? 0 : expense.amount, count: empty ? 0 : 1, recent: empty ? [] : [expense] },
        agenda: { pending: empty ? 0 : 1, today: 0, overdue: 0, next: empty ? [] : [task] }, activities: [], units_count: 0, production: [], recent_records: empty ? [] : actions(),
      };
      else if (path.endsWith('/summary') && !path.endsWith('/expenses/summary')) data = { farm, fields: [], seasons: [], tasks: [], operations: [], expenses: { amount: expense.amount, count: 1, cost_per_ha: null }, alerts: [] };
      else if (path.endsWith('/weather')) { status = 400; data = { error: 'Sem localização' }; }
      else if (path.endsWith('/activity')) { auditRequests++; data = { items: actions(), has_more: false }; }
      else if (path.endsWith('/history')) { historyRequests++; data = { items: actions(), has_more: false }; }
      else if (path.endsWith('/farm_expenses/expense-test')) {
        if (method === 'PATCH') { const body = JSON.parse(route.request().postData()); writes.push({ path, body, key: route.request().headers()['idempotency-key'] }); expense = { ...expense, ...body }; }
        data = expense;
      } else if (path.endsWith('/farm_expenses')) { lists.push(url.searchParams); data = empty || url.searchParams.get('category') && url.searchParams.get('category') !== expense.category ? [] : [expense]; }
      else if (path.endsWith('/expenses/summary')) {
        const noMatch = empty || url.searchParams.get('category') && url.searchParams.get('category') !== expense.category;
        data = { amount: noMatch ? 0 : expense.amount, count: noMatch ? 0 : 1, cost_per_ha: null };
      }
      else if (path.endsWith('/farm_tasks/task-test')) {
        if (method === 'PATCH') {
          const body = JSON.parse(route.request().postData()); writes.push({ path, body, key: route.request().headers()['idempotency-key'] });
          if (failTask) { failTask = false; status = 503; data = { error: 'test failure' }; }
          else task = { ...task, ...body };
        }
        if (!data) data = task;
      } else if (path.endsWith('/farm_tasks')) data = empty ? [] : [task];
      else if (path.endsWith('/agro/overview')) data = { activities: [], units: [], catalog: agroCatalog(), unit_stats: {}, production_totals: [], recent_events: [], sales: [], expenses: [], tasks: [], feed_inventory: [], financial: null };
      else { status = 404; data = { error: 'Unconfigured isolated fixture' }; }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { ok: true, data } : { ok: false, ...data }) });
    });
    const navigate = name => page.getByRole('navigation').filter({ visible: true }).getByRole('link', { name, exact: true }).click();
    await page.goto(`${base}/`);
    await page.locator('.dash-record').first().waitFor();
    await page.evaluate(() => document.documentElement.style.fontSize = '200%');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: home fits with larger text`);
    await page.evaluate(() => document.documentElement.style.fontSize = '');
    await page.locator('.app-help').screenshot({ path: `test-artifacts/clarity/help-${width}.png` });
    await page.getByRole('button', { name: 'Ajuda', exact: true }).click();
    check(await page.getByRole('button', { name: 'Ajuda', exact: true }).getAttribute('aria-expanded') === 'true', `${width}: help button announces its expanded state`);
    await page.locator('.app-help').screenshot({ path: `test-artifacts/clarity/help-open-${width}.png` });
    check(await page.getByText('Peça à Lida no WhatsApp.', { exact: true }).isVisible(), `${width}: plain-language help is available`);
    await page.getByRole('button', { name: 'Ajuda', exact: true }).click();
    check(await page.locator('.app-help').getByRole('link', { name: 'Falar com a Lida' }).isVisible(), `${width}: WhatsApp is visible without opening a menu`);
    await page.getByRole('button', { name: 'Ajuda', exact: true }).click();
    check(await page.getByText('Peça à Lida no WhatsApp.', { exact: true }).isVisible(), `${width}: plain-language help is available`);
    await page.getByRole('button', { name: 'Ajuda', exact: true }).click();
    check(await page.locator('.app-help').getByRole('link', { name: 'Falar com a Lida' }).isVisible(), `${width}: WhatsApp is visible without opening a menu`);
    await navigate('Registros');
    await page.getByRole('heading', { name: 'Meus registros', exact: true }).waitFor();
    check(await page.locator('.records-destination').count() === 5, `${width}: purposeful destinations`);
    check(await page.getByRole('heading', { name: 'Histórico de registros', exact: true }).count() === 0, `${width}: changes are not the main records screen`);
    check(auditRequests === 0, `${width}: app does not fetch the global audit`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: records fit the screen`);
    const sizes = await page.locator('.bottom-nav a:visible').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
    check(sizes.every(height => height >= 48), `${width}: mobile navigation has large touch areas`);
    await page.evaluate(() => document.documentElement.style.fontSize = '200%');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: records fit with larger text`);
    await page.evaluate(() => document.documentElement.style.fontSize = '');
    await page.screenshot({ path: `test-artifacts/clarity/records-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: /^Meus gastos/ }).click();
    await page.getByRole('button', { name: 'Abrir Diesel para o trator', exact: true }).waitFor();
    check(await page.locator('.expense-entry').evaluate(entry => Math.abs(entry.querySelector('.records-amount').getBoundingClientRect().left - entry.querySelector('.expense-entry-description').getBoundingClientRect().left) <= 1), `${width}: expense amount aligns with its description`);
    await page.screenshot({ path: `test-artifacts/clarity/expenses-${width}.png`, fullPage: true });
    await page.locator('.expense-screen').evaluate(element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `test-artifacts/clarity/expense-list-${width}.png` });
    await page.evaluate(() => document.documentElement.style.fontSize = '200%');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: expense screen fits with larger text`);
    await page.evaluate(() => document.documentElement.style.fontSize = '');
    await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
    await page.getByLabel('Filtrar por categoria', { exact: true }).selectOption('veterinaria');
    await page.getByRole('heading', { name: 'Nenhum gasto com estes filtros', exact: true }).waitFor();
    check(await page.locator('.expense-overview > strong').innerText() === 'R$ 0,00', `${width}: unmatched category has zero total and empty list`);
    check(await page.getByRole('button', { name: 'Adicionar gasto', exact: true }).count() === 1, `${width}: empty list has a single clear creation action`);
    await page.getByRole('button', { name: 'Adicionar gasto', exact: true }).click();
    await page.getByRole('heading', { name: 'Adicionar gasto', exact: true }).waitFor();
    check(new URL(page.url()).pathname.endsWith('/gastos/novo'), `${width}: expense creation has its own address`);
    await page.goBack();
    await page.getByRole('heading', { name: 'Nenhum gasto com estes filtros', exact: true }).waitFor();
    check(writes.length === 0, `${width}: closing new expense does not save anything`);
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir Diesel para o trator', exact: true }).waitFor();
    check(!lists.at(-1).has('category') && await page.locator('.expense-overview > strong').innerText() === 'R$ 350,00', `${width}: clearing filters restores list and total`);
    await page.getByLabel('Filtrar por categoria', { exact: true }).selectOption('combustivel');
    await page.getByRole('button', { name: 'Abrir Diesel para o trator', exact: true }).waitFor();
    check(lists.at(-1).get('category') === 'combustivel', `${width}: category is filtered by the server, including unloaded pages`);
    check(lists.at(-1).get('from') === '2026-10-01' && lists.at(-1).get('to') === '2026-11-01', `${width}: expense list keeps dashboard interval`);
    await page.getByRole('button', { name: 'Abrir Diesel para o trator', exact: true }).click();
    let details = page.locator('.record-page');
    await details.getByRole('heading', { name: 'Diesel para o trator', exact: true }).waitFor();
    check(new URL(page.url()).pathname.endsWith('/gastos/expense-test'), `${width}: expense opens its own page`);
    check(await page.getByRole('dialog').count() === 0, `${width}: expense details do not use a modal`);
    check(historyRequests === 0, `${width}: history is fetched only when requested`);
    await page.screenshot({ path: `test-artifacts/clarity/details-${width}.png` });
    check(await details.getByRole('textbox').count() === 0, `${width}: details open read-only`);
    await details.getByRole('link', { name: 'Corrigir este registro' }).click();
    await details.getByLabel('Valor em reais', { exact: true }).fill('999');
    await details.getByRole('button', { name: 'Cancelar correção' }).click();
    check(writes.length === 0, `${width}: cancel makes no writes`);
    await details.getByRole('link', { name: 'Corrigir este registro' }).click();
    check(await details.getByLabel('Valor em reais', { exact: true }).inputValue() === '350', `${width}: a cancelled draft does not replace the saved amount`);
    await details.getByLabel('Valor em reais', { exact: true }).fill('375');
    await details.getByLabel('Data da despesa', { exact: true }).fill('2026-10-02');
    await details.getByRole('button', { name: 'Salvar correção', exact: true }).click();
    await details.getByRole('link', { name: 'Corrigir este registro' }).waitFor();
    await details.getByRole('link', { name: '← Meus gastos', exact: true }).click();
    await page.locator('.records-amount').getByText(/375,00/).waitFor();
    check(await page.getByLabel('Filtrar por categoria', { exact: true }).inputValue() === 'combustivel', `${width}: correction preserves selected filters`);
    check(writes[0].body.amount === 375 && writes[0].body.expense_date === '2026-10-02', `${width}: expense correction sends amount and date`);
    check(await page.locator('.records-list li').count() === 1, `${width}: correction refreshes the current record without duplicates`);
    await navigate('Tarefas');
    await page.getByText('Lembrete no WhatsApp ativado', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Ver detalhes', exact: true }).click();
    details = page.locator('.record-page'); await details.getByRole('heading', { name: 'Conferir a água dos animais', exact: true }).waitFor();
    await details.getByRole('link', { name: 'Corrigir este registro' }).click();
    check(await details.getByLabel('Data e hora na propriedade').inputValue() === '2099-10-03T09:00', `${width}: edit uses farm timezone, not browser timezone`);
    await details.getByLabel('Data e hora na propriedade').fill('2099-10-04T11:00');
    failTask = true;
    await details.getByRole('button', { name: 'Salvar correção', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Não recebemos a confirmação' }).waitFor();
    check(await details.getByLabel('Data e hora na propriedade').inputValue() === '2099-10-04T11:00', `${width}: failed correction preserves the draft`);
    await details.getByRole('button', { name: 'Salvar correção', exact: true }).click();
    await details.getByRole('link', { name: 'Corrigir este registro' }).waitFor();
    await details.getByRole('link', { name: '← Minhas tarefas', exact: true }).click();
    await page.getByRole('heading', { name: 'Minhas tarefas', exact: true }).waitFor();
    check(writes.at(-1).body.due_at === '2099-10-04T14:00:00.000Z', `${width}: reschedule converts local hour correctly`);
    check(!Object.hasOwn(writes.at(-1).body, 'remind') && task.remind, `${width}: reschedule preserves existing reminder`);
    check(writes.at(-1).key === writes.at(-2).key, `${width}: correction retry keeps idempotency key`);
    check(await page.getByRole('heading', { name: 'Minhas tarefas', exact: true }).isVisible(), `${width}: correction stays in its origin screen`);
    await page.getByRole('button', { name: 'Ver detalhes', exact: true }).click();
    details = page.locator('.record-page'); await details.getByRole('heading', { name: 'Conferir a água dos animais', exact: true }).waitFor();
    await details.getByRole('link', { name: 'Corrigir este registro' }).click();
    await details.getByLabel('Lida me lembra pelo WhatsApp').uncheck();
    await details.getByRole('button', { name: 'Salvar correção', exact: true }).click();
    await details.getByRole('link', { name: 'Corrigir este registro' }).waitFor();
    await details.getByRole('link', { name: '← Minhas tarefas', exact: true }).click();
    await page.getByRole('heading', { name: 'Minhas tarefas', exact: true }).waitFor();
    check(await page.getByRole('heading', { name: 'Minhas tarefas', exact: true }).isVisible(), `${width}: correction stays in its origin screen`);
    await page.getByText('Sem lembrete no WhatsApp', { exact: true }).waitFor();
    check(writes.at(-1).body.remind === false, `${width}: disabling reminder is explicit`);
    await navigate('Registros');
    await page.getByRole('button', { name: /^Meus animais e áreas/ }).click();
    await page.getByRole('heading', { name: 'Meus animais e áreas', exact: true }).waitFor();
    await navigate('Registros');
    await page.getByRole('button', { name: /^Minha produção/ }).click();
    await page.getByRole('heading', { name: 'Minha produção', exact: true }).waitFor();
    check(await page.getByRole('heading', { name: 'Minha produção', exact: true }).count() === 1, `${width}: production has a clear destination`);
    empty = true;
    await navigate('Início'); await page.getByRole('button', { name: 'Atualizar resumo', exact: true }).click();
    await page.getByRole('heading', { name: 'Faça um pedido. Veja ele aqui.', exact: true }).waitFor();
    await page.getByText('Começar com uma tarefa minha', { exact: true }).click();
    await page.getByLabel('O que você precisa fazer?', { exact: true }).fill('Conferir a água dos animais');
    await page.getByRole('button', { name: 'Preparar meu pedido', exact: true }).click();
    const draft = new URL(await page.getByRole('link', { name: 'Abrir pedido no WhatsApp' }).getAttribute('href')).searchParams.get('text');
    check(draft.includes(farm.name) && draft.includes('09:00') && draft.includes('Sem lembrete'), `${width}: prepared request makes scope and reminder clear`);
    check(writes.length === 4, `${width}: preparing WhatsApp request makes no writes`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: flow fits mobile`);
    await page.screenshot({ path: `test-artifacts/clarity/first-request-${width}.png`, fullPage: true });
    empty = false;
    await page.getByRole('button', { name: 'Já enviei, atualizar resumo', exact: true }).click();
    await page.locator('.dash-record').first().waitFor();
    check(await page.getByRole('heading', { name: 'Faça um pedido. Veja ele aqui.', exact: true }).count() === 0, `${width}: returning to confirmed work dismisses starter guide`);
    check(errors.length === 0, `${width}: no runtime errors: ${errors}`);
    await context.close();
  }
  console.log(`PASS: ${checks} checks for records, corrections, reminders and first-use flow.`);
} catch (error) { if (diagnosticPage && !diagnosticPage.isClosed()) await diagnosticPage.screenshot({ path: 'test-artifacts/clarity/failure.png', fullPage: true }).catch(() => {}); throw error; }
finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
