-- Ciclo de cobrança (mensal vs anual) vinculado ao OTP de checkout /planos.

alter table public.billing_phone_otp
  add column if not exists billing_cycle text not null default 'MONTHLY';

alter table public.billing_phone_otp
  drop constraint if exists billing_phone_otp_billing_cycle_check;

alter table public.billing_phone_otp
  add constraint billing_phone_otp_billing_cycle_check
  check (billing_cycle in ('MONTHLY', 'YEARLY'));

create index if not exists billing_phone_otp_phone_plan_segment_cycle_idx
  on public.billing_phone_otp (phone, plan_code, customer_segment, billing_cycle, created_at desc);
