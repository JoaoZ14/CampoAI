// Synthetic accounts and intercepted APIs exist only in this browser test.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createApp } from '../src/app.js';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = createApp().listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const farms = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Fazenda Horizonte (teste)', city: 'Resende', state: 'RJ' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Sítio Boa Vista (teste)', city: 'Resende', state: 'RJ' },
];
const task = { id: 'task-fixture', title: 'Conferir a irrigação (teste)', due_at: '2026-10-02T12:00:00Z', status: 'pending' };
const user = { id: '33333333-3333-4333-8333-333333333333', email: 'teste@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: 'fixture-token', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user };
await mkdir('test-artifacts/app', { recursive: true });
let checks = 0;
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let failWorkspace = false, failHistory = false, slowFirstFarm = false, completed = false, taskWrites = 0, expenseWrites = 0;
    const expenseKeys = [];
    await page.route('**/auth/v1/**', route => new URL(route.request().url()).pathname.endsWith('/logout')
      ? route.fulfill({ status: 204 })
      : route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'invalid_credentials', message: 'Invalid login credentials' }) }));
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();
      let data, status = 200;
      if (path === '/api/customer/config') data = { ok: true, supabaseUrl: 'https://auth.example.test', supabaseAnonKey: 'test-only-public-key' };
      else if (path === '/api/customer/workspace') {
        await sleep(250);
        if (failWorkspace) { status = 503; data = { error: 'column users.auth_user_id does not exist' }; }
        else data = { linked: true, whatsappUrl: 'https://wa.me/5511999999999', capabilities: { reminders: false } };
      }
      else if (path === '/api/rural/farms') data = farms;
      else {
        const farm = path.includes(farms[1].id) ? farms[1] : farms[0];
        if (slowFirstFarm && farm.id === farms[0].id && method === 'GET') await sleep(800);
        if (path.endsWith('/dashboard')) data = { generated_at: '2026-10-01T12:00:00Z', timezone: 'America/Sao_Paulo', today: '2026-10-01', period: { from: '2026-10-01', to_exclusive: '2026-11-01' }, modules_enabled: false, expenses: { amount: 350, count: 1, recent: [] }, agenda: { pending: completed ? 0 : 1, today: 0, overdue: 0, next: completed ? [] : [task] }, activities: [], units_count: 0, production: [], recent_records: [] };
        else if (path.endsWith('/summary') && !path.endsWith('/expenses/summary')) data = { farm, fields: [{ id: 'field-fixture', name: farm.id === farms[0].id ? 'Talhão Norte (teste)' : 'Horta Sul (teste)', area_ha: 2 }], seasons: [], tasks: [], operations: [], expenses: { amount: 350, count: 1, cost_per_ha: null }, alerts: [] };
        else if (path.endsWith('/weather')) { status = 400; data = { error: 'Informe a localização.' }; }
        else if (path.endsWith('/activity')) {
          if (failHistory) { status = 503; data = { error: 'internal database detail' }; }
          else data = { items: [{ id: url.searchParams.has('offset') ? 'activity-more' : 'activity-first', source: 'lida', status: 'completed', created_at: '2026-10-01T12:00:00Z', changes: [{ entity: 'farm_expenses', entity_id: 'expense-fixture', type: 'created', label: 'Despesa', title: url.searchParams.has('offset') ? 'Sementes (teste)' : 'Diesel (teste)' }] }], has_more: !url.searchParams.has('offset') };
        }
        else if (path.endsWith('/farm_tasks/task-fixture') && method === 'PATCH') { taskWrites++; completed = true; await sleep(200); data = { ...task, status: 'completed' }; }
        else if (path.endsWith('/farm_tasks')) data = completed ? [] : [task];
        else if (path.endsWith('/history')) data = { items: [], has_more: false };
        else if (path.endsWith('/farm_expenses/expense-fixture')) data = { id: 'expense-fixture', description: 'Diesel (teste)', amount: 350, category: 'combustivel', expense_date: '2026-10-01' };
        else if (path.endsWith('/farm_expenses') && method === 'POST') {
          expenseWrites++; expenseKeys.push(route.request().headers()['idempotency-key']); await sleep(200);
          if (expenseWrites === 1) { status = 503; data = { error: 'database failed' }; }
          else if (expenseWrites === 3) { await route.fulfill({ status: 200, body: '<html>broken proxy response</html>' }); return; }
          else data = { id: 'new-expense', ...JSON.parse(route.request().postData()) };
        }
        else if (path.endsWith('/farm_operations') || path.endsWith('/farm_expenses')) data = [];
        else if (path.endsWith('/expenses/summary')) data = { amount: 350, count: 1, cost_per_ha: null };
        else { status = 404; data = { error: `Unconfigured fixture: ${method} ${path}` }; }
      }
      try { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { ok: true, data } : { ok: false, ...data }) }); } catch { /* an intentionally aborted stale request */ }
    });
    // The config endpoint has a flat payload, unlike rural endpoints.
    await page.route('**/api/customer/config', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, supabaseUrl: 'https://auth.example.test', supabaseAnonKey: 'test-only-public-key' }) }));
    await page.goto(`${base}/app/`);
    await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await page.getByLabel('E-mail', { exact: true }).fill('teste@example.test');
    assert.equal(await page.getByLabel('E-mail', { exact: true }).evaluate(element => document.activeElement === element), true);
    await page.getByLabel('Senha', { exact: true }).fill('test-password');
    await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'E-mail ou senha incorretos' }).waitFor();
    await page.screenshot({ path: `test-artifacts/app/login-${width}.png` });
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Entrar na minha conta' }).evaluate(element => document.activeElement === element), true);
    checks += 3;

    await page.addInitScript(value => localStorage.setItem('ag-customer-auth', JSON.stringify(value)), session);
    await page.reload();
    await page.getByRole('heading', { name: 'Preparando sua fazenda' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Comece pela sua propriedade' }).count(), 0);
    await page.getByText(task.title, { exact: true }).waitFor();
    await page.screenshot({ path: `test-artifacts/app/home-${width}.png` });
    checks++;

    slowFirstFarm = true;
    await page.getByLabel('Propriedade', { exact: true }).selectOption(farms[1].id);
    await page.getByLabel('Propriedade', { exact: true }).selectOption(farms[0].id);
    await page.getByLabel('Propriedade', { exact: true }).selectOption(farms[1].id);
    await page.getByRole('navigation').filter({ visible: true }).getByRole('button', { name: 'Fazenda', exact: true }).click();
    await page.getByText('Horta Sul (teste)', { exact: true }).waitFor();
    await sleep(900);
    assert.equal(await page.getByText('Talhão Norte (teste)', { exact: true }).count(), 0);
    checks++;

    slowFirstFarm = false; failHistory = true;
    await page.getByLabel('Propriedade', { exact: true }).selectOption(farms[0].id);
    await page.getByRole('navigation').filter({ visible: true }).getByRole('button', { name: 'Agenda', exact: true }).click();
    await page.getByText(task.title, { exact: true }).waitFor();
    await page.getByRole('alert').filter({ hasText: 'Alguns dados' }).waitFor();
    assert.equal((await page.locator('body').innerText()).includes('internal database'), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'error recovery must fit the mobile viewport');
    await page.screenshot({ path: `test-artifacts/app/agenda-error-${width}.png` });
    failHistory = false;
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Alguns dados' }).waitFor({ state: 'detached' });
    checks++;

    const complete = page.getByRole('button', { name: `Concluir ${task.title}` });
    await complete.evaluate(button => { button.click(); button.click(); });
    await complete.waitFor({ state: 'detached' });
    assert.equal(taskWrites, 1);
    checks++;

    await page.getByRole('navigation').filter({ visible: true }).getByRole('button', { name: 'Registros', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir registro' }).click();
    await page.getByText('R$ 350,00', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Carregar mais registros' }).click();
    await page.getByText('Sementes (teste)', { exact: true }).waitFor();
    await page.screenshot({ path: `test-artifacts/app/activity-${width}.png` });
    checks++;

    await page.getByRole('navigation').filter({ visible: true }).getByRole('button', { name: 'Fazenda', exact: true }).click();
    await page.getByRole('button', { name: 'Despesa', exact: true }).click();
    await page.getByRole('combobox', { name: /^Categoria/ }).selectOption('combustivel');
    await page.getByLabel('Valor em reais').fill('350');
    await page.getByLabel('Descrição', { exact: true }).fill('Diesel para o trator (teste)');
    const save = page.getByRole('button', { name: 'Salvar despesa', exact: true });
    await save.evaluate(button => { button.click(); button.click(); });
    await page.getByRole('alert').filter({ hasText: 'Não recebemos a confirmação' }).waitFor();
    assert.equal(expenseWrites, 1);
    assert.equal(await page.getByLabel('Descrição', { exact: true }).inputValue(), 'Diesel para o trator (teste)');
    await save.click();
    await page.getByRole('heading', { name: 'Registrar despesa', exact: true }).waitFor({ state: 'detached' });
    assert.equal(expenseKeys[0], expenseKeys[1]);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `test-artifacts/app/farm-${width}.png` });
    checks += 2;
    await page.getByRole('button', { name: 'Despesa', exact: true }).click();
    await page.getByRole('combobox', { name: /^Categoria/ }).selectOption('combustivel');
    await page.getByLabel('Valor em reais').fill('120');
    await page.getByLabel('Descrição', { exact: true }).fill('Gasolina (teste)');
    await page.getByRole('button', { name: 'Salvar despesa', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Não recebemos a confirmação' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Registrar despesa', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Salvar despesa', exact: true }).click();
    await page.getByRole('heading', { name: 'Registrar despesa', exact: true }).waitFor({ state: 'detached' });
    assert.equal(expenseKeys[2], expenseKeys[3]);
    assert.notEqual(expenseKeys[0], expenseKeys[2]);
    checks++;

    await context.setOffline(true);
    await page.getByText('Sem conexão.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Despesa', exact: true }).isDisabled(), true);
    checks++;
    await context.setOffline(false);

    failWorkspace = true;
    await page.reload();
    await page.getByRole('heading', { name: 'Não conseguimos abrir sua fazenda' }).waitFor();
    assert.equal((await page.locator('body').innerText()).includes('auth_user_id'), false);
    failWorkspace = false;
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await page.getByRole('heading', { name: 'Seu resumo' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    checks += 2;
    if (width < 800) {
      await page.getByRole('button', { name: 'Abrir menu' }).click();
      await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
    } else await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await page.getByRole('button', { name: 'Entrar na minha conta' }).waitFor();
    assert.equal(await page.getByLabel('Propriedade', { exact: true }).count(), 0);
    checks++;
    await context.close();
  }
  console.log(`PASS: ${checks} checks across desktop and mobile; screenshots in test-artifacts/app.`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
