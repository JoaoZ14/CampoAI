-- Solicitações de assinatura vindas da página /planos.
-- Fluxo simples para usuário final (nome, telefone, senha) e fluxo completo para empresa.

create table if not exists public.subscription_requests (
  id uuid primary key default gen_random_uuid(),
  customer_type text not null check (customer_type in ('personal', 'company')),
  plan_code text not null check (plan_code in ('basic', 'pro', 'premium')),

  name text not null,
  phone text not null,
  password_hash text not null,

  company_name text,
  cnpj text,
  contact_name text,
  email text,
  notes text,

  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists subscription_requests_status_idx
  on public.subscription_requests (status, created_at desc);

create index if not exists subscription_requests_phone_idx
  on public.subscription_requests (phone);

alter table public.subscription_requests enable row level security;
