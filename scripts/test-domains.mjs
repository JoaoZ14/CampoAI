import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { get as httpGet } from 'node:http';
import { createApp } from '../src/app.js';

// No env loader, database reads, outbound messages or real-user writes.
const server = createApp().listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const index = await readFile(new URL('../app/dist/index.html', import.meta.url), 'utf8');
let checks = 0;
const check = (condition, name) => { assert.ok(condition, name); checks++; };
try {
  for (const route of ['/', '/cadastro', '/cadastro/', '/11111111-1111-4111-8111-111111111111/gastos/diesel', '/11111111-1111-4111-8111-111111111111/gastos?category=combustivel']) {
    const response = await fetch(base + route, { headers: { Accept: 'text/html' } });
    check(response.status === 200 && await response.text() === index, `React entry for ${route}`);
    check(response.headers.get('cache-control') === 'no-cache', `Fresh entry for ${route}`);
  }
  for (const [oldPath, newPath] of [
    ['/app', '/'], ['/app/', '/'], ['/app?origin=landing', '/?origin=landing'],
    ['/app/cadastro?origin=landing', '/cadastro?origin=landing'],
    ['/app/11111111-1111-4111-8111-111111111111/gastos/diesel?category=combustivel&from=2026-10-01', '/11111111-1111-4111-8111-111111111111/gastos/diesel?category=combustivel&from=2026-10-01'],
    ['/app//example.test', '/example.test'],
  ]) {
    const response = await fetch(base + oldPath, { redirect: 'manual' });
    check(response.status === 308 && response.headers.get('location') === newPath, `Legacy redirect ${oldPath}`);
  }
  const asset = index.match(/src="(\/assets\/[^\"]+\.js)"/);
  check(Boolean(asset) && asset[1].startsWith('/assets/'), 'Web assets use the root');
  const script = await fetch(base + asset[1]);
  check(script.status === 200 && /javascript/.test(script.headers.get('content-type')), 'Root JS asset is served');
  for (const route of ['/assets/missing.js', '/assets/missing', '/api/missing', '/API/missing', '/webhook/missing', '/planos/missing', '/legal/missing', '/shared/missing.css', '/admin/missing', '/health/missing']) {
    const response = await fetch(base + route, { headers: { Accept: 'text/html' } });
    check(response.status === 404 && !(response.headers.get('content-type') || '').includes('text/html'), `No SPA fallback for ${route}`);
  }
  const health = await fetch(base + '/health');
  check((await health.json()).ok === true, 'Health route survives');
  const privateAPI = await fetch(base + '/api/customer/me');
  check(privateAPI.status === 401, 'API authentication survives');
  for (const [route, marker] of [['/planos', 'planos/app.js'], ['/entrar', 'entrar/app.js'], ['/area-do-cliente', 'area-do-cliente/app.js'], ['/legal/termos-de-uso', 'Termos de uso']]) {
    const response = await fetch(base + route);
    const html = await response.text();
    check(response.status === 200 && html.includes(marker) && html !== index, `Existing page ${route} survives`);
  }
} finally { await new Promise(resolve => server.close(resolve)); }

const saved = { app: process.env.PUBLIC_APP_URL, paywall: process.env.PAYWALL_URL };
try {
  process.env.PUBLIC_APP_URL = 'https://app.useaggi.com';
  for (const paywall of ['https://planos.useaggi.com/', 'https://planos.useaggi.com/planos', 'https://app.useaggi.com/planos', 'invalid-url']) {
    process.env.PAYWALL_URL = paywall;
    const hostServer = createApp().listen(0, '127.0.0.1');
    await new Promise(resolve => hostServer.once('listening', resolve));
    const hostBase = `http://127.0.0.1:${hostServer.address().port}`;
    // Node fetch rewrites Host. Use HTTP directly to test the real domain header.
    const get = (host, route) => new Promise((resolve, reject) => {
      httpGet(hostBase + route, { headers: { Host: host, Accept: 'text/html' } }, response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, headers: { get: name => response.headers[name] }, text: async () => body, json: async () => JSON.parse(body) }));
        response.on('error', reject);
      }).on('error', reject);
    });
    try {
      const root = await get('app.useaggi.com', '/');
      check(root.status === 200 && await root.text() === index, 'App domain opens React at the root');
      const dedicated = paywall.startsWith('https://planos.');
      const plans = await get('app.useaggi.com', '/planos?phone=5524999999999&origin=app');
      if (!dedicated) {
        check(plans.status === 200 && (await plans.text()).includes('planos/app.js'), 'Same host or invalid config keeps existing checkout');
        continue;
      }
      check(plans.status === 302 && plans.headers.get('location') === paywall + '?phone=5524999999999&origin=app', 'Old plans link preserves phone and origin');
      const checkoutRoot = await get('planos.useaggi.com', '/?origin=landing');
      if (paywall.endsWith('/planos')) {
        check(checkoutRoot.status === 302 && checkoutRoot.headers.get('location') === paywall + '?origin=landing', 'Checkout host supports a configured path');
      } else {
        check(checkoutRoot.status === 200 && (await checkoutRoot.text()).includes('planos/app.js'), 'Checkout domain opens plans directly');
      }
      for (const route of ['/planos', '/planos/styles.css', '/planos/app.js', '/shared/supabaseAuth.js', '/brand/aggi-lockup.png']) {
        const response = await get('planos.useaggi.com', route);
        check(response.status === 200, `Checkout resources work on separate host: ${route}`);
      }
      const signup = await get('planos.useaggi.com', '/cadastro?origin=checkout');
      check(signup.status === 302 && signup.headers.get('location') === 'https://app.useaggi.com/cadastro?origin=checkout', 'Signup stays on app domain');
      const login = await get('planos.useaggi.com', '/entrar?next=/planos');
      check(login.status === 200 && (await login.text()).includes('entrar/app.js'), 'Checkout login remains on its own origin');
      const health = await get('planos.useaggi.com', '/health');
      check(health.status === 200 && (await health.json()).ok, 'Service health survives on checkout host');
      const privateAPI = await get('planos.useaggi.com', '/api/customer/me');
      check(privateAPI.status === 401, 'Checkout API still requires authentication');
      for (const route of ['/unknown-page', '/api/missing', '/webhook/missing', '/assets/missing.js']) {
        const response = await get('planos.useaggi.com', route);
        check(response.status === 404 && /json/.test(response.headers.get('content-type')), 'Checkout never falls through to React');
      }
    } finally { await new Promise(resolve => hostServer.close(resolve)); }
  }
} finally {
  if (saved.app === undefined) delete process.env.PUBLIC_APP_URL; else process.env.PUBLIC_APP_URL = saved.app;
  if (saved.paywall === undefined) delete process.env.PAYWALL_URL; else process.env.PAYWALL_URL = saved.paywall;
}
console.log(`PASS: ${checks} root hosting, separate checkout host, legacy redirect, asset and service routing checks.`);
