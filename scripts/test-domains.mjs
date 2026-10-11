import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  console.log(`PASS: ${checks} root hosting, legacy redirect, asset and service routing checks.`);
} finally { await new Promise(resolve => server.close(resolve)); }
