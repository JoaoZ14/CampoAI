#!/usr/bin/env node
/**
 * Smoke test pós-deploy — valida endpoints públicos.
 * Uso: node scripts/smoke-deploy.mjs [baseUrl]
 * Ex.: node scripts/smoke-deploy.mjs https://campoai-production-b7c7.up.railway.app
 */
const base = (process.argv[2] || process.env.PUBLIC_APP_URL || 'http://localhost:3001').replace(
  /\/$/,
  '',
);

const checks = [
  { name: 'health', path: '/health', expect: (d) => d.ok === true },
  { name: 'openapi', path: '/openapi.json', expect: (d) => d.openapi?.startsWith('3.') },
  { name: 'plans', path: '/api/plans', expect: (d) => Array.isArray(d.plans) || Array.isArray(d) },
];

let failed = 0;

for (const { name, path, expect } of checks) {
  const url = `${base}${path}`;
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !expect(data)) {
      console.error(`FAIL ${name}: HTTP ${res.status} ${url}`);
      failed += 1;
    } else {
      console.log(`OK   ${name}`);
    }
  } catch (e) {
    console.error(`FAIL ${name}: ${e.message} (${url})`);
    failed += 1;
  }
}

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}

console.log('\nSmoke test passed.');
