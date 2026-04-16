-- Execute no SQL Editor do Supabase (ou via migration) antes de rodar o backend.

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  usage_count integer not null default 0 check (usage_count >= 0),
  is_paid boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists users_phone_idx on public.users (phone);

comment on table public.users is 'Usuários do AgroAssist identificados pelo telefone WhatsApp';
