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

-- Histórico de conversa (texto) para memória multi-turn no Gemini. Rode após criar users.
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at desc);

comment on table public.chat_messages is 'Turnos user/assistente por usuário (só texto; mídias viram marcadores [Foto]/[Áudio])';
