-- Conta web (Supabase Auth) + perfil extensível.
-- auth_user_id é opcional para usuários legado (trial só WhatsApp).

alter table public.users
  add column if not exists auth_user_id uuid unique,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists cpf text;

create index if not exists users_auth_user_id_idx on public.users (auth_user_id)
  where auth_user_id is not null;

comment on column public.users.auth_user_id is 'UUID de auth.users (login web Google ou e-mail/senha)';
comment on column public.users.phone_verified_at is 'Preenchido após OTP SMS no cadastro, vínculo ou checkout';
comment on column public.users.cpf is 'CPF só dígitos (opcional; perfil web)';

-- Checkout deixa de criar senha própria; identidade passa a ser Supabase Auth.
alter table public.subscription_requests
  alter column password_hash drop not null;
