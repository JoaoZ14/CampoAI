-- Migração: planos equipe/família (organizações + assentos por número WhatsApp).
-- Rode no SQL Editor do Supabase se o projeto já tinha sido criado só com schema.sql antigo.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text,
  max_seats integer not null check (max_seats >= 1 and max_seats <= 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.organizations is 'Conta equipe/família: limite de números WhatsApp com acesso pago';

create table if not exists public.organization_seats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  phone text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, phone)
);

create unique index if not exists organization_seats_one_active_phone_idx
  on public.organization_seats (phone)
  where active = true;

comment on table public.organization_seats is 'Números autorizados no plano equipe; um telefone ativo só em uma organização';

create index if not exists organization_seats_org_idx
  on public.organization_seats (organization_id);

alter table public.users add column if not exists organization_id uuid references public.organizations (id) on delete set null;
alter table public.users add column if not exists billing_kind text not null default 'free';

-- Quem já estava pago como individual (sem organização) passa a billing_kind personal.
update public.users
set billing_kind = 'personal'
where is_paid = true and billing_kind = 'free' and organization_id is null;

create index if not exists users_organization_id_idx on public.users (organization_id);

comment on column public.users.billing_kind is 'free | personal (assinante individual) | team (assento de organização)';
