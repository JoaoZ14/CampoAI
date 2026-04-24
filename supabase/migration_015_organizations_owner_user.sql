-- Titular da organização para área do cliente (gestão de números).
alter table public.organizations
  add column if not exists owner_user_id uuid;

comment on column public.organizations.owner_user_id is 'Usuário titular da conta empresa (pode gerir assentos/números)';

create index if not exists organizations_owner_user_idx
  on public.organizations (owner_user_id);
