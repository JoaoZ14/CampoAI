-- Plano Essencial (lite): R$29, até 35 análises/mês; contador mensal em users.
-- Rode no SQL Editor após migration_013 (ou após 012 se não existir 013).

-- Limite mensal por plano (null = ilimitado).
alter table public.product_plans
  add column if not exists max_analyses_per_month integer
  check (max_analyses_per_month is null or (max_analyses_per_month >= 1 and max_analyses_per_month <= 100000));

update public.product_plans
set max_analyses_per_month = null
where code in ('basic', 'pro', 'premium');

alter table public.users
  add column if not exists billing_usage_ym text,
  add column if not exists billing_usage_count integer not null default 0 check (billing_usage_count >= 0);

comment on column public.users.billing_usage_ym is 'YYYY-MM (America/Sao_Paulo) do ciclo de contagem de análises para planos com teto mensal';
comment on column public.users.billing_usage_count is 'Análises com IA no mês billing_usage_ym (planos com max_analyses_per_month)';
comment on column public.product_plans.max_analyses_per_month is 'Teto de análises/mês; null = ilimitado';

-- plan_code: inclui lite
alter table public.billing_phone_otp drop constraint if exists billing_phone_otp_plan_code_check;
alter table public.billing_phone_otp
  add constraint billing_phone_otp_plan_code_check
  check (plan_code in ('lite', 'basic', 'pro', 'premium'));

alter table public.subscription_requests drop constraint if exists subscription_requests_plan_code_check;
alter table public.subscription_requests
  add constraint subscription_requests_plan_code_check
  check (plan_code in ('lite', 'basic', 'pro', 'premium'));

-- Ordem na vitrine PF: lite primeiro
update public.product_plans
set sort_order = sort_order + 1
where customer_segment = 'personal'
  and active = true;

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
values (
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
