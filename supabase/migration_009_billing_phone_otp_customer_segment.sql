-- OTP por telefone + plan_code + segmento (evita colisão entre PRO PF e PRO PJ).

alter table public.billing_phone_otp
  add column if not exists customer_segment text;

update public.billing_phone_otp
set customer_segment = 'personal'
where customer_segment is null;

alter table public.billing_phone_otp
  alter column customer_segment set default 'personal',
  alter column customer_segment set not null;

alter table public.billing_phone_otp drop constraint if exists billing_phone_otp_customer_segment_check;
alter table public.billing_phone_otp
  add constraint billing_phone_otp_customer_segment_check
  check (customer_segment in ('personal', 'company'));

create index if not exists billing_phone_otp_phone_plan_segment_idx
  on public.billing_phone_otp (phone, plan_code, customer_segment, created_at desc);
