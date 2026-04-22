-- Tabela relacional de planos (nome, valor, referências externas).
-- Complementa o JSON em plan_catalog: use esta tabela para checkout, relatórios e integrações.
-- Projetos já existentes: rode este arquivo no SQL Editor do Supabase.

create table if not exists public.product_plans (
  id uuid primary key default gen_random_uuid(),

  -- Referência interna estável (URL, admin, código)
  code text not null unique,

  name text not null,
  price_brl numeric(12, 2) not null check (price_brl >= 0 and price_brl <= 999999.99),
  currency text not null default 'BRL' check (currency in ('BRL')),

  -- Texto de cobrança ex.: "mês", "ano"
  billing_period_label text not null default 'mês',

  summary text,
  max_whatsapp_seats integer check (max_whatsapp_seats is null or (max_whatsapp_seats >= 1 and max_whatsapp_seats <= 500)),

  -- Referências comerciais / integração (preencha quando tiver Stripe ou outro gateway)
  external_sku text,
  stripe_product_id text,
  stripe_price_id text,

  highlight boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.product_plans is 'Planos SaaS: colunas tipadas para preço e IDs externos; bullets/copy longos continuam em plan_catalog.plans (JSON)';

comment on column public.product_plans.code is 'Slug único: basic, pro, premium';
comment on column public.product_plans.external_sku is 'SKU ou código interno de faturamento (opcional)';
comment on column public.product_plans.highlight is 'true = destaque na vitrine (ex.: plano PRO)';

create index if not exists product_plans_active_sort_idx
  on public.product_plans (active, sort_order);

alter table public.product_plans enable row level security;

-- Sem políticas públicas: leitura/escrita via service_role (backend) ou políticas futuras no painel.

insert into public.product_plans (
  code,
  name,
  price_brl,
  billing_period_label,
  summary,
  max_whatsapp_seats,
  external_sku,
  highlight,
  sort_order
)
values
  (
    'basic',
    'Básico',
    29.00,
    'mês',
    'Orientação no dia a dia da roça: menos pesquisa solta, mais clareza para decidir sem enrolação.',
    1,
    'AG-BASIC-MONTH',
    false,
    1
  ),
  (
    'pro',
    'PRO — melhor custo-benefício',
    59.00,
    'mês',
    'O plano que a gente quer que a maioria escolha: menos risco de erro, decisão melhor e tempo sobrando.',
    1,
    'AG-PRO-MONTH',
    true,
    2
  ),
  (
    'premium',
    'Premium',
    119.00,
    'mês',
    'Para fazenda, família ou time: mais de um celular no mesmo plano, com o mesmo padrão de resposta.',
    3,
    'AG-PREMIUM-MONTH',
    false,
    3
  )
on conflict (code) do update set
  name = excluded.name,
  price_brl = excluded.price_brl,
  billing_period_label = excluded.billing_period_label,
  summary = excluded.summary,
  max_whatsapp_seats = excluded.max_whatsapp_seats,
  external_sku = excluded.external_sku,
  highlight = excluded.highlight,
  sort_order = excluded.sort_order,
  updated_at = now();
