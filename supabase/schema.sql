-- Execute no SQL Editor do Supabase (projeto novo) antes de rodar o backend.
-- Projetos antigos: se já existir só users + chat_messages, rode migration_002_organizations.sql.

-- Conta equipe/família (vários números WhatsApp no mesmo plano).
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text,
  owner_user_id uuid,
  max_seats integer not null check (max_seats >= 1 and max_seats <= 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.organizations is 'Conta equipe/família: limite de números WhatsApp com acesso pago';
comment on column public.organizations.owner_user_id is 'Usuário titular da conta empresa (pode gerir assentos/números)';

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

alter table public.users
  add column if not exists asaas_customer_id text,
  add column if not exists asaas_subscription_id text,
  add column if not exists subscription_plan_code text,
  add column if not exists asaas_subscription_status text;

alter table public.users
  add column if not exists billing_usage_ym text,
  add column if not exists billing_usage_count integer not null default 0 check (billing_usage_count >= 0);

comment on column public.users.billing_usage_ym is 'YYYY-MM (America/Sao_Paulo) do ciclo de contagem de análises (planos com teto mensal)';
comment on column public.users.billing_usage_count is 'Análises com IA no mês billing_usage_ym';

create unique index if not exists users_asaas_subscription_id_uidx
  on public.users (asaas_subscription_id)
  where asaas_subscription_id is not null;

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
  $plan$[{"code":"basic","name":"Básico","priceBrl":29,"period":"mês","summary":"Orientação no dia a dia da roça: menos pesquisa solta, mais clareza para decidir sem enrolação.","bullets":["Um número de WhatsApp com análises ilimitadas (uso razoável no campo)","Lavoura, pecuária e sanidade em linguagem simples; calculadora integrada (calc ajuda)","Memória da conversa conforme a configuração do servidor"]},{"code":"pro","name":"PRO — melhor custo-benefício","priceBrl":59,"period":"mês","summary":"O plano que a gente quer que a maioria escolha: menos risco de erro, decisão melhor e tempo sobrando.","bullets":["Tudo do Básico + foco em resposta boa quando você mais precisa","Você não compra \"IA\": compra tranquilidade para não errar na hora H","Relatório em PDF da conversa quando estiver ativo no servidor"]},{"code":"premium","name":"Premium","priceBrl":119,"period":"mês","seats":3,"summary":"Para fazenda, família ou time: mais de um celular no mesmo plano, com o mesmo padrão de resposta.","bullets":["Tudo do PRO para até 3 números de WhatsApp no mesmo plano","Um responsável contrata; você define quem usa (painel administrativo)","Ideal quando várias pessoas mandam foto e áudio do mesmo talhão ou rebanho"]}]$plan$::jsonb,
  $notes$["Posicionamento: o produtor compra menos prejuízo por decisão mal informada e menos tempo perdido pesquisando — não compra \"tecnologia por tecnologia\".","Na página de planos, destaque visual no PRO (R$59): é o melhor custo-benefício para a maior parte dos produtores."]$notes$::jsonb
)
on conflict (id) do nothing;

-- Planos em colunas (preço, SKU, Stripe); copy/marketing em bullets segue em plan_catalog.
create table if not exists public.product_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  customer_segment text not null default 'personal' check (customer_segment in ('personal', 'company')),
  name text not null,
  price_brl numeric(12, 2) not null check (price_brl >= 0 and price_brl <= 999999.99),
  currency text not null default 'BRL' check (currency in ('BRL')),
  billing_period_label text not null default 'mês',
  summary text,
  max_whatsapp_seats integer check (max_whatsapp_seats is null or (max_whatsapp_seats >= 1 and max_whatsapp_seats <= 500)),
  external_sku text,
  stripe_product_id text,
  stripe_price_id text,
  highlight boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code, customer_segment)
);

alter table public.product_plans
  add column if not exists max_analyses_per_month integer
  check (max_analyses_per_month is null or (max_analyses_per_month >= 1 and max_analyses_per_month <= 100000));

comment on column public.product_plans.max_analyses_per_month is 'Teto de análises/mês; null = ilimitado';

comment on table public.product_plans is 'Planos SaaS: colunas tipadas para preço e IDs externos; bullets/copy longos continuam em plan_catalog.plans (JSON)';
comment on column public.product_plans.customer_segment is 'personal = CPF; company = CNPJ';

create index if not exists product_plans_active_sort_idx
  on public.product_plans (active, sort_order);

alter table public.product_plans enable row level security;

insert into public.product_plans (
  code,
  customer_segment,
  name,
  price_brl,
  billing_period_label,
  summary,
  max_whatsapp_seats,
  max_analyses_per_month,
  external_sku,
  highlight,
  sort_order,
  active
)
values
  (
    'lite',
    'personal',
    'Essencial',
    29.00,
    'mês',
    'Até 35 análises por mês com uso justo; um número de WhatsApp. Ideal para validar o serviço com custo menor.',
    1,
    35,
    'AG-LITE-PF-MONTH',
    false,
    1,
    true
  ),
  (
    'basic',
    'personal',
    'Starter',
    49.00,
    'mês',
    'Entrada no serviço: um número de WhatsApp, análises ilimitadas com política de uso justo e suporte no ritmo do seu trabalho.',
    1,
    null,
    'AG-BASIC-PF-MONTH',
    true,
    2,
    true
  ),
  (
    'pro',
    'personal',
    'PRO — produtor (CPF)',
    59.00,
    'mês',
    'Melhor custo-benefício para quem já usa toda semana: respostas mais completas, histórico e foco em decisão rápida no talhão.',
    1,
    null,
    'AG-PRO-PF-MONTH',
    false,
    3,
    false
  ),
  (
    'premium',
    'personal',
    'Team',
    119.00,
    'mês',
    'Até 3 números na mesma assinatura: equipe ou família com o mesmo nível de serviço, gestão centralizada e previsibilidade de custo.',
    3,
    null,
    'AG-PREMIUM-PF-MONTH',
    false,
    4,
    true
  ),
  (
    'pro',
    'company',
    'PRO — empresa (CNPJ)',
    59.00,
    'mês',
    'Nota fiscal em nome da empresa, uso profissional e governança: um WhatsApp corporativo com o mesmo núcleo do PRO para produtor.',
    1,
    null,
    'AG-PRO-PJ-MONTH',
    false,
    5,
    false
  ),
  (
    'premium',
    'company',
    'Business',
    199.00,
    'mês',
    'Plano empresarial (CNPJ): até 5 números, faturamento e cadastro alinhados à empresa e o mesmo padrão de resposta para a equipe.',
    5,
    null,
    'AG-PREMIUM-PJ-MONTH',
    true,
    6,
    true
  )
on conflict (code, customer_segment) do update set
  name = excluded.name,
  price_brl = excluded.price_brl,
  billing_period_label = excluded.billing_period_label,
  summary = excluded.summary,
  max_whatsapp_seats = excluded.max_whatsapp_seats,
  max_analyses_per_month = excluded.max_analyses_per_month,
  external_sku = excluded.external_sku,
  highlight = excluded.highlight,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();

-- Solicitações vindas da página /planos (cadastro simplificado).
create table if not exists public.subscription_requests (
  id uuid primary key default gen_random_uuid(),
  customer_type text not null check (customer_type in ('personal', 'company')),
  plan_code text not null check (plan_code in ('lite', 'basic', 'pro', 'premium')),
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

-- OTP de confirmação de telefone para checkout em /planos.
create table if not exists public.billing_phone_otp (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  plan_code text not null check (plan_code in ('lite', 'basic', 'pro', 'premium')),
  customer_segment text not null default 'personal' check (customer_segment in ('personal', 'company')),
  billing_cycle text not null default 'MONTHLY' check (billing_cycle in ('MONTHLY', 'YEARLY')),
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

create index if not exists billing_phone_otp_phone_plan_segment_idx
  on public.billing_phone_otp (phone, plan_code, customer_segment, created_at desc);

create index if not exists billing_phone_otp_phone_plan_segment_cycle_idx
  on public.billing_phone_otp (phone, plan_code, customer_segment, billing_cycle, created_at desc);

create unique index if not exists billing_phone_otp_token_uidx
  on public.billing_phone_otp (verification_token)
  where verification_token is not null;

alter table public.billing_phone_otp enable row level security;
