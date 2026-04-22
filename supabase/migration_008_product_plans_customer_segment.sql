-- Segmento do plano (CPF vs CNPJ). Rode após migration_004.
-- Cada combinação (code, customer_segment) é uma linha; vitrine e checkout usam o par.

alter table public.product_plans
  add column if not exists customer_segment text;

update public.product_plans
set customer_segment = 'personal'
where customer_segment is null;

alter table public.product_plans
  alter column customer_segment set default 'personal',
  alter column customer_segment set not null;

alter table public.product_plans drop constraint if exists product_plans_customer_segment_check;
alter table public.product_plans
  add constraint product_plans_customer_segment_check
  check (customer_segment in ('personal', 'company'));

alter table public.product_plans drop constraint if exists product_plans_code_key;

create unique index if not exists product_plans_code_customer_segment_uidx
  on public.product_plans (code, customer_segment);

comment on column public.product_plans.customer_segment is
  'personal = produtor/CPF; company = contrato em nome de empresa (CNPJ)';

insert into public.product_plans (
  code,
  customer_segment,
  name,
  price_brl,
  billing_period_label,
  summary,
  max_whatsapp_seats,
  external_sku,
  highlight,
  sort_order,
  active
)
values
  (
    'basic',
    'personal',
    'Básico — produtor (CPF)',
    29.00,
    'mês',
    'Para quem decide no campo com um WhatsApp: análises no ritmo do dia a dia, sem complicação de contrato empresarial.',
    1,
    'AG-BASIC-PF-MONTH',
    false,
    1,
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
    'AG-PRO-PF-MONTH',
    true,
    2,
    true
  ),
  (
    'premium',
    'personal',
    'Premium — família ou time (CPF)',
    119.00,
    'mês',
    'Até 3 números no mesmo plano: fazenda ou família com o mesmo padrão de resposta, um responsável paga no CPF.',
    3,
    'AG-PREMIUM-PF-MONTH',
    false,
    3,
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
    'AG-PRO-PJ-MONTH',
    false,
    4,
    true
  ),
  (
    'premium',
    'company',
    'Premium — empresa (CNPJ)',
    119.00,
    'mês',
    'Contrato empresarial com até 3 linhas WhatsApp: equipe técnica, consultoria ou operações que precisam de NF e rastreabilidade.',
    3,
    'AG-PREMIUM-PJ-MONTH',
    false,
    5,
    true
  )
on conflict (code, customer_segment) do update set
  name = excluded.name,
  price_brl = excluded.price_brl,
  billing_period_label = excluded.billing_period_label,
  summary = excluded.summary,
  max_whatsapp_seats = excluded.max_whatsapp_seats,
  external_sku = excluded.external_sku,
  highlight = excluded.highlight,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();
