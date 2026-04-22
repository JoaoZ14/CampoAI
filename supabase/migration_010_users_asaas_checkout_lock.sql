-- Exclusão mútua no checkout Asaas (evita várias assinaturas por cliques repetidos).
-- Rode após migration_005_users_asaas.sql.

alter table public.users
  add column if not exists asaas_checkout_started_at timestamptz;

comment on column public.users.asaas_checkout_started_at is
  'Reserva de checkout: bloqueia concorrência até concluir ou stale (~5 min) permitir retry.';

create or replace function public.claim_asaas_checkout(p_user_id uuid, p_stale_before timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $func$
begin
  update public.users u
  set asaas_checkout_started_at = now()
  where u.id = p_user_id
    and u.asaas_subscription_id is null
    and (
      u.asaas_checkout_started_at is null
      or u.asaas_checkout_started_at < p_stale_before
    );
  return found;
end;
$func$;

create or replace function public.release_asaas_checkout_claim(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  update public.users
  set asaas_checkout_started_at = null
  where id = p_user_id;
end;
$func$;

revoke all on function public.claim_asaas_checkout(uuid, timestamptz) from public;
revoke all on function public.release_asaas_checkout_claim(uuid) from public;

grant execute on function public.claim_asaas_checkout(uuid, timestamptz) to service_role;
grant execute on function public.release_asaas_checkout_claim(uuid) to service_role;
