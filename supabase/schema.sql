-- Execute no SQL Editor do Supabase (projeto novo) antes de rodar o backend.
-- Projetos antigos: se já existir só users + chat_messages, rode migration_002_organizations.sql.

-- Conta equipe/família (vários números WhatsApp no mesmo plano).
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

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  usage_count integer not null default 0 check (usage_count >= 0),
  is_paid boolean not null default false,
  organization_id uuid references public.organizations (id) on delete set null,
  billing_kind text not null default 'free',
  created_at timestamptz not null default now(),
  constraint users_billing_kind_check check (billing_kind in ('free', 'personal', 'team'))
);

create index if not exists users_phone_idx on public.users (phone);
create index if not exists users_organization_id_idx on public.users (organization_id);

comment on table public.users is 'Usuários do AG Assist identificados pelo telefone WhatsApp';
comment on column public.users.billing_kind is 'free | personal (assinante individual) | team (assento de organização)';

-- Histórico de conversa (texto) para memória multi-turn no Gemini.
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

-- Catálogo de planos (preços/textos; editável pelo painel /admin).
create table if not exists public.plan_catalog (
  id text primary key default 'default',
  version text not null default '2026-04',
  plans jsonb not null,
  notes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint plan_catalog_singleton check (id = 'default')
);

comment on table public.plan_catalog is 'Catálogo de planos (uma linha id=default); leitura via API Node';

alter table public.plan_catalog enable row level security;

-- Dados iniciais (mesmo conteúdo que migration_003_plan_catalog.sql).
insert into public.plan_catalog (id, version, plans, notes)
values (
  'default',
  '2026-04',
  $plan$[{"code":"personal","name":"Pessoal","priceBrl":59,"period":"mês","summary":"Um número de WhatsApp com acesso ilimitado à IA (uso razoável no campo).","bullets":["Só o seu WhatsApp; sem cadastro de empresa","Após o checkout (quando integrar pagamento), o número liberado automaticamente","Memória da conversa e relatório em PDF conforme configuração do servidor"]},{"code":"family_team","name":"Família ou equipe","priceBrl":139,"period":"mês","seats":3,"summary":"Até 3 números de WhatsApp no mesmo plano (fazenda, família ou time pequeno).","bullets":["Um responsável contrata; você cadastra os 3 números que podem usar","Cada número com o mesmo tipo de acesso à IA","Gestão dos números pelo painel administrativo (AG Assist)"]},{"code":"business_team","name":"Empresa","priceBrl":379,"period":"mês","seats":10,"summary":"Até 10 números de WhatsApp para cooperativa, empresa rural ou consultoria.","bullets":["Até 10 números cadastrados pelo administrador do plano","Ideal para equipes que falam com produtores ou uso interno","Suporte à gestão de assentos pelo painel administrativo"]}]$plan$::jsonb,
  $notes$["Plano pessoal: o produtor usa só o WhatsApp; não precisa criar conta de empresa.","Planos equipe: a organização é só para gestão de números e cobrança — cada pessoa continua no próprio WhatsApp."]$notes$::jsonb
)
on conflict (id) do nothing;
