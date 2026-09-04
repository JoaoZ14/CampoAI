#!/usr/bin/env node
/**
 * Confirma se as migrações 017–020 estão aplicadas no Supabase de produção.
 * Uso: node scripts/confirm-migrations.mjs
 * Requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env ou ambiente.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error('FAIL Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = 0;

function pass(name, detail = '') {
  console.log(`OK   ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  failed += 1;
}

console.log(`\nVerificando migrações 017–020 em: ${url}\n`);

// migration_017: plan_catalog version 2026-04
const { data: catalogRows, error: catalogErr } = await supabase
  .from('plan_catalog')
  .select('version, plans')
  .limit(1);

if (catalogErr) {
  fail('migration_017', `plan_catalog: ${catalogErr.message}`);
} else if (!catalogRows?.length) {
  fail('migration_017', 'tabela plan_catalog vazia');
} else {
  const row = catalogRows[0];
  if (row.version === '2026-04') pass('migration_017', 'plan_catalog version 2026-04');
  else fail('migration_017', `version=${row.version ?? 'null'}`);
}

// migration_018: colunas signup/trial em users + tabela signup_phone_otp
const signupCols = [
  'signup_completed_at',
  'trial_started_at',
  'trial_ends_at',
  'welcome_sent_at',
  'trial_expired_notified_at',
  'signup_source',
];

const { data: userSample, error: userErr } = await supabase
  .from('users')
  .select(signupCols.join(', '))
  .limit(1);

if (userErr) {
  fail('migration_018', `users columns: ${userErr.message}`);
} else {
  pass('migration_018', 'colunas signup/trial em users');
}

const { error: otpErr } = await supabase.from('signup_phone_otp').select('id').limit(1);
if (otpErr) fail('migration_018', `signup_phone_otp: ${otpErr.message}`);
else pass('migration_018', 'tabela signup_phone_otp');

// migration_019: backfill de dados — verifica se há usuários legados sem signup_completed_at
const { count: legacyCount, error: legacyErr } = await supabase
  .from('users')
  .select('id', { count: 'exact', head: true })
  .gt('usage_count', 0)
  .eq('is_paid', false)
  .is('signup_completed_at', null);

if (legacyErr) {
  fail('migration_019', legacyErr.message);
} else if (legacyCount > 0) {
  fail('migration_019', `${legacyCount} usuário(s) com uso mas sem signup_completed_at`);
} else {
  pass('migration_019', 'backfill legado ok (nenhum usuário pendente)');
}

const authCols = ['auth_user_id', 'phone_verified_at', 'cpf'];
const { error: authColErr } = await supabase.from('users').select(authCols.join(', ')).limit(1);
if (authColErr) fail('migration_020', `users auth columns: ${authColErr.message}`);
else pass('migration_020', 'colunas auth_user_id, phone_verified_at, cpf');

// Resumo de usuários para beta
const { count: totalUsers } = await supabase
  .from('users')
  .select('id', { count: 'exact', head: true });

const { count: signedUp } = await supabase
  .from('users')
  .select('id', { count: 'exact', head: true })
  .not('signup_completed_at', 'is', null);

const { count: paidUsers } = await supabase
  .from('users')
  .select('id', { count: 'exact', head: true })
  .eq('is_paid', true);

console.log('\n--- Resumo do banco ---');
console.log(`Usuários totais: ${totalUsers ?? 0}`);
console.log(`Cadastros concluídos: ${signedUp ?? 0}`);
console.log(`Assinantes pagos: ${paidUsers ?? 0}`);

if (failed) {
  console.error(`\n${failed} verificação(ões) falharam. Rode as migrações em supabase/migration_017–020.`);
  process.exit(1);
}

console.log('\nMigrações 017–020 confirmadas.');
process.exit(0);
