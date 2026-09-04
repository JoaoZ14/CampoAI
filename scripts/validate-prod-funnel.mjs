#!/usr/bin/env node
/**
 * Valida o funil comercial em produção (ou staging) sem enviar SMS real.
 * Uso: node scripts/validate-prod-funnel.mjs [baseUrl]
 */
const base = (process.argv[2] || process.env.PUBLIC_APP_URL || 'http://localhost:3001').replace(
  /\/$/,
  '',
);

let failed = 0;
let warned = 0;

function pass(name, detail = '') {
  console.log(`OK   ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  failed += 1;
}

function warn(name, detail = '') {
  console.warn(`WARN ${name}${detail ? ` — ${detail}` : ''}`);
  warned += 1;
}

async function fetchJson(path, opts = {}) {
  const url = `${base}${path}`;
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _raw: text.slice(0, 200) };
  }
  return { url, res, data, text };
}

async function checkJson(name, path, expect, opts = {}) {
  try {
    const { url, res, data } = await fetchJson(path, opts);
    if (!res.ok || !expect(data, res)) {
      fail(name, `HTTP ${res.status} ${url}`);
      return null;
    }
    pass(name);
    return data;
  } catch (e) {
    fail(name, e.message);
    return null;
  }
}

async function checkHtml(name, path, needle) {
  try {
    const { url, res, text } = await fetchJson(path);
    if (!res.ok || !text.includes(needle)) {
      fail(name, `HTTP ${res.status} ${url}`);
      return;
    }
    pass(name);
  } catch (e) {
    fail(name, e.message);
  }
}

console.log(`\nValidando funil comercial em: ${base}\n`);

// 1. Endpoints públicos
await checkJson('health', '/health', (d) => d.ok === true);
await checkJson('openapi', '/openapi.json', (d) => d.openapi?.startsWith('3.'));

const plans = await checkJson('plans', '/api/plans', (d) => Array.isArray(d.plans) && d.plans.length >= 3);
if (plans) {
  const codes = plans.plans.map((p) => p.code);
  for (const code of ['lite', 'basic', 'premium']) {
    if (!codes.includes(code)) warn('plan-catalog', `plano "${code}" ausente`);
  }
  if (plans.catalogSource === 'database') pass('plan-catalog-source', 'banco');
  else warn('plan-catalog-source', `fonte: ${plans.catalogSource ?? 'desconhecida'}`);
}

await checkJson('noticias', '/api/noticias', (d) => Array.isArray(d.items) || Array.isArray(d.articles) || d.ok !== false);

// 2. Páginas do funil
await checkHtml('cadastro-page', '/cadastro', 'AG Assist');
await checkHtml('entrar-page', '/entrar', 'Entrar');
await checkHtml('planos-page', '/planos', 'planos');
await checkHtml('portal-page', '/area-do-cliente', 'Minha conta');
await checkHtml('termos-page', '/legal/termos-de-uso', 'Termos de uso');
await checkHtml('privacidade-page', '/legal/politica-de-privacidade', 'Privacidade');

// 3. API de cadastro — validação de entrada (sem SMS)
const signupBad = await fetchJson('/api/signup/otp/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
});
if (signupBad.res.status === 400) pass('signup-otp-validation', 'rejeita telefone vazio');
else fail('signup-otp-validation', `esperado 400, recebeu ${signupBad.res.status}`);

// 4. Checkout protegido
const checkoutNoSecret = await fetchJson('/api/billing/asaas/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '+5524999999999', planCode: 'lite' }),
});
if ([401, 500].includes(checkoutNoSecret.res.status)) {
  pass('checkout-secret-guard', `HTTP ${checkoutNoSecret.res.status}`);
} else {
  warn('checkout-secret-guard', `HTTP ${checkoutNoSecret.res.status} — verifique ASAAS_CHECKOUT_API_SECRET`);
}

// 5. Webhook Asaas — sem token
const asaasNoToken = await fetchJson('/webhook/asaas', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ event: 'PING' }),
});
if (asaasNoToken.res.status === 401) pass('asaas-webhook-guard', 'token obrigatório');
else if (asaasNoToken.res.status === 200) warn('asaas-webhook-guard', 'webhook desprotegido (ASAAS_WEBHOOK_TOKEN vazio)');
else fail('asaas-webhook-guard', `HTTP ${asaasNoToken.res.status}`);

await checkJson('customer-config', '/api/customer/config', (d) => d.ok === true && Boolean(d.supabaseUrl));

const portalMe = await fetchJson('/api/customer/me');
if (portalMe.res.status === 401) pass('portal-auth-guard', 'GET /me exige Bearer');
else warn('portal-auth-guard', `HTTP ${portalMe.res.status}`);

console.log('\n--- Etapas manuais (não automatizáveis) ---');
console.log('• Cadastro real com conta web + OTP SMS em /cadastro');
console.log('• Mensagem no WhatsApp após cadastro');
console.log('• Paywall após 10 análises ou 14 dias');
console.log('• Checkout com cartão Asaas em /planos (logado)');
console.log('• Login em /entrar e painel em /area-do-cliente');

if (failed) {
  console.error(`\n${failed} check(s) falharam, ${warned} aviso(s).`);
  process.exit(1);
}

console.log(`\nFunil validado: ${warned} aviso(s), nenhuma falha crítica.`);
if (warned) process.exit(2);
process.exit(0);
