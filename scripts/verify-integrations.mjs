#!/usr/bin/env node
/**
 * Verifica configuração de e-mail (Resend) e templates WhatsApp (Twilio).
 * Uso: node scripts/verify-integrations.mjs
 */
import 'dotenv/config';

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

function hasEnv(name) {
  return Boolean(process.env[name]?.trim());
}

console.log('\nVerificando integrações de e-mail e WhatsApp\n');

// Resend
if (hasEnv('RESEND_API_KEY')) pass('resend-api-key', 'configurada');
else fail('resend-api-key', 'RESEND_API_KEY ausente');

const from = process.env.SIGNUP_EMAIL_FROM?.trim() ?? '';
if (from.includes('resend.dev')) {
  warn('resend-from', 'usando onboarding@resend.dev — só entrega para e-mail da conta Resend');
} else if (from.includes('@')) {
  pass('resend-from', from);
} else {
  warn('resend-from', 'SIGNUP_EMAIL_FROM não configurado');
}

if (process.env.SIGNUP_EMAIL_ENABLED === 'false') warn('resend-enabled', 'SIGNUP_EMAIL_ENABLED=false');
else if (hasEnv('RESEND_API_KEY')) pass('resend-enabled', 'ativo');

// Twilio base
if (hasEnv('TWILIO_ACCOUNT_SID') && hasEnv('TWILIO_AUTH_TOKEN')) pass('twilio-credentials');
else fail('twilio-credentials', 'TWILIO_ACCOUNT_SID ou TWILIO_AUTH_TOKEN ausente');

if (hasEnv('TWILIO_WHATSAPP_FROM')) pass('twilio-whatsapp-from', process.env.TWILIO_WHATSAPP_FROM.trim());
else fail('twilio-whatsapp-from', 'TWILIO_WHATSAPP_FROM ausente');

// Templates WhatsApp
const templates = [
  ['WELCOME_SIGNUP_CONTENT_SID', 'boas-vindas pós-cadastro'],
  ['TRIAL_EXPIRED_CONTENT_SID', 'trial expirado (cron)'],
  ['PAYWALL_CONTENT_SID', 'paywall (opcional)'],
  ['WEEKLY_NEWS_WHATSAPP_CONTENT_SID', 'resumo semanal'],
];

for (const [env, label] of templates) {
  if (hasEnv(env)) pass(`template-${env}`, label);
  else if (env === 'PAYWALL_CONTENT_SID') warn(`template-${env}`, `${label} — fallback texto livre`);
  else warn(`template-${env}`, `${label} — fallback texto livre/SMS`);
}

// Asaas
if (hasEnv('ASAAS_API_KEY')) pass('asaas-api-key');
else fail('asaas-api-key', 'ASAAS_API_KEY ausente');

if (hasEnv('ASAAS_WEBHOOK_TOKEN')) pass('asaas-webhook-token');
else warn('asaas-webhook-token', 'webhook desprotegido');

if (hasEnv('ASAAS_CHECKOUT_API_SECRET')) pass('asaas-checkout-secret');
else warn('asaas-checkout-secret', 'checkout desprotegido em produção');

if (process.env.ASAAS_SANDBOX === 'true') warn('asaas-sandbox', 'modo sandbox ativo');

// URLs do funil
for (const [env, label] of [
  ['PUBLIC_APP_URL', 'URL pública'],
  ['SIGNUP_URL', 'cadastro'],
  ['PAYWALL_URL', 'planos'],
]) {
  const val = process.env[env]?.trim();
  if (val?.startsWith('https://')) pass(env, val);
  else warn(env, `${label} não configurada com HTTPS`);
}

console.log('\n--- Próximos passos manuais ---');
console.log('1. Resend: verificar domínio próprio (SPF/DKIM) e trocar SIGNUP_EMAIL_FROM');
console.log('2. Twilio: aprovar templates WELCOME_SIGNUP e TRIAL_EXPIRED no Meta');
console.log('3. Asaas: configurar webhook POST …/webhook/asaas com ASAAS_WEBHOOK_TOKEN');
console.log('4. Teste: npm run test:signup-email -- --email SEU_EMAIL_DA_CONTA_RESEND');

if (failed) {
  console.error(`\n${failed} falha(s), ${warned} aviso(s).`);
  process.exit(1);
}

console.log(`\nIntegrações verificadas: ${warned} aviso(s).`);
if (warned) process.exit(2);
process.exit(0);
