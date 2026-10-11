// Browser routing checks with isolated authentication and data; no real writes.
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { agroCatalog } from '../src/rural/agroCatalog.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const nativeDir = process.env.NATIVE_APP_DIR ? path.resolve(process.env.NATIVE_APP_DIR) : null;
const server = (nativeDir ? createServer(async (req, res) => {
  const requested = decodeURIComponent(new URL(req.url, 'http://local.test').pathname);
  const file = path.resolve(nativeDir, '.' + (requested === '/' ? '/index.html' : requested));
  if (!file.startsWith(nativeDir + path.sep)) { res.writeHead(404); res.end(); return; }
  try { const body = await readFile(file); res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}) : createApp()).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const appURL = appPath => nativeDir ? base + '/#' + appPath : base + appPath;
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
await mkdir('test-artifacts/routes', { recursive: true });
const farms = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Sítio Boa Vista', timezone: 'America/Sao_Paulo' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Fazenda Horizonte', timezone: 'America/Sao_Paulo' },
];
const user = { id: '33333333-3333-4333-8333-333333333333', email: 'teste@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: 'fixture-token', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user };
let checks = 0, diagnosticPage;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
try {
  for (const width of [1280, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); diagnosticPage = page;
    const errors = [], requests = [], writes = [];
    let failRead = false, delayRead = false, failSave = false, saving = false;
    let expense = { id: 'diesel', farm_id: farms[0].id, description: 'Diesel do trator', amount: 350, category: 'combustivel', expense_date: '2026-10-01' };
    const currentPath = () => nativeDir ? new URL(page.url()).hash.slice(1).split('?')[0] : new URL(page.url()).pathname;
    const ruralPath = section => `/${farms[0].id}${section ? '/' + section : ''}`;
    await page.route('**/auth/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) }));
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url()), path = url.pathname, method = route.request().method();
      requests.push(path);
      let data, status = 200;
      if (path === '/api/customer/config') { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, supabaseUrl: 'https://auth.example.test', supabaseAnonKey: 'public-test-key' }) }); return; }
      if (path === '/api/signup/otp/send' || path === '/api/signup/otp/verify') { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, verificationToken: 'isolated-verification-token' }) }); return; }
      if (path === '/api/signup/complete') { check(JSON.parse(route.request().postData()).verificationToken === 'isolated-verification-token', `${width}: signup confirmation uses the isolated token`); data = { whatsappOpenUrl: 'https://wa.me/5511999999999' }; }
      else if (path === '/api/customer/workspace') data = { linked: true, capabilities: { reminders: true, modules: true }, whatsappUrl: 'https://wa.me/5511999999999' };
      else if (path === '/api/rural/farms') data = farms;
      else {
        const farm = farms.find(item => path.includes(item.id));
        if (!farm) { status = 403; data = { error: 'Forbidden fixture scope' }; }
        else if (path.endsWith('/dashboard')) data = { generated_at: '2026-10-01T12:00:00Z', timezone: farm.timezone, today: '2026-10-01', period: { from: '2026-10-01', to_exclusive: '2026-11-01' }, modules_enabled: true, expenses: { amount: farm.id === farms[0].id ? expense.amount : 0, count: farm.id === farms[0].id ? 1 : 0, recent: [] }, agenda: { pending: 0, today: 0, overdue: 0, next: [] }, activities: [], units_count: 0, production: [], recent_records: [] };
        else if (path.endsWith('/summary') && !path.endsWith('/expenses/summary')) data = { farm, fields: [], seasons: [], tasks: [], operations: [], expenses: { amount: 350, count: 1, cost_per_ha: null }, alerts: [] };
        else if (path.endsWith('/weather')) { status = 400; data = { error: 'Sem localização' }; }
        else if (path.endsWith('/farm_tasks') || path.endsWith('/farm_operations')) data = [];
        else if (path.endsWith('/history')) data = { items: [], has_more: false };
        else if (path.endsWith('/farm_expenses')) {
          if (method === 'POST') { writes.push({ path, body: JSON.parse(route.request().postData()) }); data = { id: 'created-expense', ...writes.at(-1).body }; }
          else data = farm.id === farms[0].id && (!url.searchParams.get('category') || url.searchParams.get('category') === 'combustivel') ? [expense] : [];
        } else if (path.endsWith('/expenses/summary')) data = { amount: farm.id === farms[0].id ? expense.amount : 0, count: farm.id === farms[0].id ? 1 : 0, cost_per_ha: null };
        else if (path.endsWith('/farm_expenses/diesel')) {
          if (delayRead) await new Promise(resolve => setTimeout(resolve, 500));
          if (farm.id !== farms[0].id) { status = 404; data = { error: 'Registro não encontrado' }; }
          else if (method === 'PATCH') {
            writes.push({ path, body: JSON.parse(route.request().postData()), key: route.request().headers()['idempotency-key'] });
            saving = true; await new Promise(resolve => setTimeout(resolve, 1000)); saving = false;
            if (failSave) { failSave = false; status = 503; data = { error: 'Isolated write failure' }; }
            else { expense = { ...expense, ...writes.at(-1).body }; data = expense; }
          } else if (failRead) { failRead = false; status = 503; data = { error: 'Isolated read failure' }; }
          else data = expense;
        } else if (path.endsWith('/agro/overview')) data = { activities: [], units: [], catalog: agroCatalog(), unit_stats: {}, production_totals: [], recent_events: [], sales: [], expenses: [], tasks: [], feed_inventory: [], financial: null };
        else { status = 404; data = { error: 'Registro não encontrado' }; }
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { ok: true, data } : { ok: false, ...data }) }).catch(() => {});
    });
    // A copied deep link is retained through login, rather than silently opening home.
    const initial = await page.goto(appURL(ruralPath('gastos/diesel')));
    check(initial.status() === 200, `${width}: server delivers the app for direct detail URLs`);
    await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
    await page.getByLabel('E-mail', { exact: true }).fill(user.email);
    await page.getByLabel('Senha', { exact: true }).fill('isolated-password');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('heading', { name: expense.description, exact: true }).waitFor();
    check(currentPath() === ruralPath('gastos/diesel'), `${width}: successful login retains the copied detail address`);
    check(await page.getByRole('dialog').count() === 0, `${width}: record is a page, not an overlay`);
    await page.reload();
    await page.getByRole('heading', { name: expense.description, exact: true }).waitFor();
    check(await page.getByLabel('Propriedade', { exact: true }).inputValue() === farms[0].id, `${width}: refresh selects property from the address`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: record page fits`);
    await page.evaluate(() => document.documentElement.style.fontSize = '200%');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: record page fits with larger text`);
    await page.evaluate(() => document.documentElement.style.fontSize = '');
    const beforeSkip = page.url();
    await page.locator('.skip').evaluate(link => link.click());
    check(page.url() === beforeSkip, `${width}: skip-to-content preserves the route, including native hash`);
    await page.screenshot({ path: `test-artifacts/routes/detail-${width}.png`, fullPage: true });
    await page.locator('.record-page').getByRole('link', { name: '← Meus gastos', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir Diesel do trator', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
    await page.getByLabel('Filtrar por categoria', { exact: true }).selectOption('combustivel');
    await page.getByRole('button', { name: 'Abrir Diesel do trator', exact: true }).waitFor();
    const filteredURL = page.url();
    await page.reload();
    await page.getByRole('button', { name: 'Abrir Diesel do trator', exact: true }).waitFor();
    check(await page.getByLabel('Filtrar por categoria', { exact: true }).inputValue() === 'combustivel', `${width}: filters survive refresh`);
    await page.getByRole('button', { name: 'Abrir Diesel do trator', exact: true }).click();
    await page.getByRole('heading', { name: expense.description, exact: true }).waitFor();
    await page.goBack();
    await page.getByRole('button', { name: 'Abrir Diesel do trator', exact: true }).waitFor();
    check(page.url() === filteredURL, `${width}: browser back restores the exact filtered list`);
    await page.goForward();
    await page.getByRole('heading', { name: expense.description, exact: true }).waitFor();
    check(currentPath() === ruralPath('gastos/diesel'), `${width}: browser forward restores details`);
    await page.getByRole('link', { name: 'Corrigir este registro', exact: true }).click();
    await page.getByRole('heading', { name: 'Corrigir registro', exact: true }).waitFor();
    check(currentPath() === ruralPath('gastos/diesel/editar'), `${width}: correction has its own address`);
    await page.getByLabel('Valor em reais', { exact: true }).fill('375,50');
    await page.getByRole('navigation').filter({ visible: true }).getByRole('link', { name: 'Início', exact: true }).click();
    let guard = page.getByRole('dialog', { name: 'Sair sem salvar?', exact: true }); await guard.waitFor();
    await guard.getByRole('button', { name: 'Continuar preenchendo', exact: true }).click();
    check(await page.getByLabel('Valor em reais', { exact: true }).inputValue() === '375,50', `${width}: leaving protection retains the draft`);
    check(writes.length === 0, `${width}: navigation never saves implicitly`);
    failSave = true;
    await page.getByRole('button', { name: 'Salvar correção', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Não recebemos a confirmação' }).waitFor();
    check(await page.getByLabel('Valor em reais', { exact: true }).inputValue() === '375,50', `${width}: failed save preserves entered value`);
    await page.getByRole('button', { name: 'Salvar correção', exact: true }).click();
    await page.getByRole('button', { name: 'Salvando…', exact: true }).waitFor();
    await page.getByRole('navigation').filter({ visible: true }).getByRole('link', { name: 'Início', exact: true }).evaluate(link => link.click());
    guard = page.getByRole('dialog', { name: 'Aguarde o envio', exact: true }); await guard.waitFor();
    check(currentPath().endsWith('/editar'), `${width}: navigation waits for the pending write`);
    await guard.getByRole('button', { name: 'Continuar aqui', exact: true }).click();
    await page.getByRole('link', { name: 'Corrigir este registro', exact: true }).waitFor();
    check(!saving && writes[0].key === writes[1].key && writes[1].body.amount === 375.5, `${width}: retry confirms the write with the same idempotency key`);
    check(currentPath() === ruralPath('gastos/diesel'), `${width}: confirmed correction returns to its record`);
    await page.getByRole('link', { name: '← Meus gastos', exact: true }).click();
    await page.locator('.records-amount').getByText(/375,50/).waitFor();
    check(page.url() === filteredURL, `${width}: correction preserves the original list filters`);
    await page.getByRole('button', { name: 'Adicionar gasto', exact: true }).click();
    await page.getByRole('heading', { name: 'Adicionar gasto', exact: true }).waitFor();
    check(currentPath().endsWith('/gastos/novo'), `${width}: creation is a separate page`);
    await page.getByLabel('Descrição', { exact: true }).fill('Rascunho de gasto');
    await page.goBack();
    guard = page.getByRole('dialog', { name: 'Sair sem salvar?', exact: true }); await guard.waitFor();
    await guard.getByRole('button', { name: 'Sair sem salvar', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir Diesel do trator', exact: true }).waitFor();
    check(writes.length === 2, `${width}: abandoning a draft does not create a record`);
    for (const [section, heading] of [['tarefas', 'Minhas tarefas'], ['trabalhos', 'Trabalhos do campo'], ['registros', 'Meus registros'], ['propriedade', 'Meus animais e áreas'], ['producao', 'Minha produção'], ['vendas', 'Minhas vendas e recebimentos'], ['agenda-da-propriedade', 'Tarefas da propriedade']]) {
      await page.goto(appURL(ruralPath(section)));
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      check(currentPath() === ruralPath(section), `${width}: direct ${section} page opens`);
    }
    await page.goto(appURL(ruralPath('gastos/diesel')));
    await page.getByRole('heading', { name: expense.description, exact: true }).waitFor();
    await page.getByLabel('Propriedade', { exact: true }).selectOption(farms[1].id);
    await page.getByRole('heading', { name: 'Meus gastos', exact: true }).waitFor();
    check(currentPath() === `/${farms[1].id}/gastos`, `${width}: changing property leaves the old record and opens the matching section`);
    check(await page.getByRole('heading', { name: expense.description, exact: true }).count() === 0, `${width}: record from previous property is cleared`);
    await page.goto(appURL(`/${farms[1].id}/gastos/diesel`));
    await page.getByRole('heading', { name: 'Registro não encontrado', exact: true }).waitFor();
    check(await page.getByText('R$ 375,50', { exact: true }).count() === 0, `${width}: record from another property is not shown`);
    const unauthorized = '99999999-9999-4999-8999-999999999999', before = requests.length;
    await page.goto(appURL(`/${unauthorized}/gastos/diesel`));
    await page.getByRole('heading', { name: 'Propriedade não disponível', exact: true }).waitFor();
    check(!requests.slice(before).some(path => path.includes(unauthorized)), `${width}: unavailable property triggers no scoped API requests`);
    await page.goto(appURL(ruralPath('pagina-inexistente')));
    await page.getByRole('heading', { name: 'Página não encontrada', exact: true }).waitFor();
    check(await page.locator('.dash-record').count() === 0, `${width}: unknown paths do not silently open home`);
    failRead = true;
    await page.goto(appURL(ruralPath('gastos/diesel')));
    await page.getByRole('heading', { name: 'Não foi possível abrir este registro', exact: true }).waitFor();
    await page.locator('.record-page, .workspace-state').getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await page.getByRole('heading', { name: expense.description, exact: true }).waitFor();
    check(await page.locator('.record-details').getByText(/375,50/).isVisible(), `${width}: direct detail page recovers from read failure`);
    delayRead = true;
    await page.goto(appURL(ruralPath('gastos/diesel')));
    await page.getByRole('navigation').filter({ visible: true }).getByRole('link', { name: 'Tarefas', exact: true }).click();
    await page.getByRole('heading', { name: 'Minhas tarefas', exact: true }).waitFor();
    await new Promise(resolve => setTimeout(resolve, 550));
    check(await page.locator('.record-page').count() === 0, `${width}: late response does not reopen a page already left`);
    const asset404 = await context.request.get(`${base}/assets/does-not-exist.js`);
    check(asset404.status() === 404 && !(asset404.headers()['content-type'] || '').includes('text/html'), `${width}: missing assets stay 404 rather than returning HTML`);
    await page.goto(appURL('/cadastro'));
    await page.getByLabel('Seu nome', { exact: true }).fill('Pessoa de teste');
    await page.getByLabel('WhatsApp com DDD', { exact: true }).fill('11999999999');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Enviar código', exact: true }).click();
    await page.getByLabel('Código de verificação', { exact: true }).fill('123456');
    await page.getByRole('button', { name: 'Confirmar e começar', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir meu app', exact: true }).click();
    await page.getByRole('heading', { name: 'Seu resumo', exact: true }).waitFor();
    check(!currentPath().endsWith('/cadastro'), `${width}: completing signup opens the app instead of reopening signup`);
    check(errors.length === 0, `${width}: no runtime errors: ${errors}`);
    await context.close();
  }
  // New-account e-mail confirmation must use the new web root, including native.
  const signupContext = await browser.newContext();
  let signupRedirect;
  await signupContext.route('**/api/customer/config', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, supabaseUrl: 'https://auth.example.test', supabaseAnonKey: 'public-test-key' }) }));
  await signupContext.route('**/auth/v1/signup**', async route => {
    signupRedirect = new URL(route.request().url()).searchParams.get('redirect_to');
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user: { ...user, identities: [{ id: user.id }] } }) });
  });
  const signupPage = await signupContext.newPage();
  await signupPage.goto(appURL('/cadastro'));
  await signupPage.getByLabel('E-mail', { exact: true }).fill(user.email);
  await signupPage.getByLabel('Crie uma senha', { exact: true }).fill('isolated-password');
  await signupPage.getByRole('button', { name: 'Continuar', exact: true }).click();
  await signupPage.getByRole('heading', { name: 'Confira seu e-mail', exact: true }).waitFor();
  check(signupRedirect === (nativeDir ? 'https://app.useaggi.com/' : base + '/'), 'Signup e-mail confirmation targets the web root');
  await signupContext.close();
  console.log(`PASS: ${checks} routing, direct access, history, scope and draft checks.`);
} catch (error) { if (diagnosticPage && !diagnosticPage.isClosed()) await diagnosticPage.screenshot({ path: 'test-artifacts/routes/failure.png', fullPage: true }).catch(() => {}); throw error; }
finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
