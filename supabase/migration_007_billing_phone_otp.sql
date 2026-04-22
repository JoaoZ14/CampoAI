-- OTP de confirmação por WhatsApp para checkout na página /planos.

create table if not exists public.billing_phone_otp (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  plan_code text not null check (plan_code in ('basic', 'pro', 'premium')),
  code_hash text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  expires_at timestamptz not null,
  verified_at timestamptz,
  verification_token text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists billing_phone_otp_phone_idx
  on public.billing_phone_otp (phone, created_at desc);

create unique index if not exists billing_phone_otp_token_uidx
  on public.billing_phone_otp (verification_token)
  where verification_token is not null;

alter table public.billing_phone_otp enable row level security;
