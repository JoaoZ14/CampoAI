-- Integração Asaas: assinatura recorrente mensal (cartão) por usuário WhatsApp.
-- Rode no SQL Editor após migration_004_product_plans.sql.

alter table public.users
  add column if not exists asaas_customer_id text,
  add column if not exists asaas_subscription_id text,
  add column if not exists subscription_plan_code text,
  add column if not exists asaas_subscription_status text;

create unique index if not exists users_asaas_subscription_id_uidx
  on public.users (asaas_subscription_id)
  where asaas_subscription_id is not null;

comment on column public.users.asaas_customer_id is 'Cliente Asaas (cus_...)';
comment on column public.users.asaas_subscription_id is 'Assinatura Asaas (sub_...)';
comment on column public.users.subscription_plan_code is 'basic | pro | premium';
comment on column public.users.asaas_subscription_status is 'Status espelhado do Asaas (ex.: ACTIVE)';
