-- Cadastro obrigatório no site + trial híbrido (dias + análises).

alter table public.users
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists signup_completed_at timestamptz,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists welcome_sent_at timestamptz,
  add column if not exists trial_expired_notified_at timestamptz,
  add column if not exists signup_source text;

comment on column public.users.signup_completed_at is 'Preenchido após cadastro verificado no site ou checkout pago';
comment on column public.users.trial_ends_at is 'Fim do trial gratuito (horário UTC); bloqueio também por usage_count';
comment on column public.users.welcome_sent_at is 'Quando a mensagem de boas-vindas pós-cadastro foi enviada';
comment on column public.users.trial_expired_notified_at is 'Quando o aviso proativo de trial expirado (cron) foi enviado';

create table if not exists public.signup_phone_otp (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  expires_at timestamptz not null,
  verified_at timestamptz,
  verification_token text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists signup_phone_otp_phone_idx
  on public.signup_phone_otp (phone, created_at desc);

create unique index if not exists signup_phone_otp_token_uidx
  on public.signup_phone_otp (verification_token)
  where verification_token is not null;

alter table public.signup_phone_otp enable row level security;
