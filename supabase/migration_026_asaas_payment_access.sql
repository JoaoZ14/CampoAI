-- Apply after migration 025, before deploying the matching billing code.
-- No charges, price changes or retroactive expiration of legacy subscriptions.
begin;

alter table public.users
  add column if not exists billing_access_status text,
  add column if not exists subscription_paid_until timestamptz,
  add column if not exists asaas_billing_cycle text,
  add column if not exists asaas_checkout_uncertain boolean not null default false,
  add column if not exists asaas_sync_token uuid,
  add column if not exists asaas_sync_started_at timestamptz;

create table if not exists public.asaas_billing_events (
  event_id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  subscription_id text not null,
  event_type text not null,
  access_status text not null,
  processed_at timestamptz not null default now()
);
alter table public.asaas_billing_events enable row level security;
revoke all on public.asaas_billing_events from anon, authenticated;
grant select, insert on public.asaas_billing_events to service_role;

-- A lease serializes remote snapshots across workers, including out-of-order events.
create or replace function public.claim_asaas_sync(p_subscription_id text, p_event_id text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare holder public.users; token uuid;
begin
  select * into holder from public.users where asaas_subscription_id=p_subscription_id for update;
  if holder.id is null then return jsonb_build_object('state','missing'); end if;
  if p_event_id is not null and exists(select 1 from public.asaas_billing_events where event_id=p_event_id) then
    return jsonb_build_object('state','duplicate');
  end if;
  if holder.asaas_sync_token is not null and holder.asaas_sync_started_at>now()-interval '5 minutes' then
    return jsonb_build_object('state','busy');
  end if;
  token := gen_random_uuid();
  update public.users set asaas_sync_token=token,asaas_sync_started_at=now() where id=holder.id;
  return jsonb_build_object('state','claimed','token',token,'userId',holder.id,'customerId',holder.asaas_customer_id,
    'billingCycle',coalesce(holder.asaas_billing_cycle,holder.subscription_terms->>'billingCycle'));
end $$;

create or replace function public.release_asaas_sync(p_user_id uuid, p_token uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.users set asaas_sync_token=null,asaas_sync_started_at=null
    where id=p_user_id and asaas_sync_token=p_token;
end $$;

create or replace function public.finish_asaas_sync(
  p_user_id uuid, p_token uuid, p_subscription_id text,
  p_event_id text, p_event_type text, p_access_status text,
  p_paid_until timestamptz, p_subscription_status text, p_billing_cycle text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare holder public.users; access_paid boolean;
begin
  select * into holder from public.users where id=p_user_id for update;
  if holder.asaas_sync_token is distinct from p_token or p_token is null
     or holder.asaas_subscription_id is distinct from p_subscription_id then
    raise exception 'BILLING_SYNC_LEASE_LOST';
  end if;
  if p_access_status is null or p_access_status not in ('ACTIVE','PENDING','PAST_DUE','CANCELLED','REFUNDED','CHARGEBACK','EXPIRED') then
    raise exception 'INVALID_BILLING_ACCESS_STATUS';
  end if;
  access_paid := coalesce(p_paid_until>now(),false) and p_access_status in ('ACTIVE','CANCELLED');
  if p_event_id is not null then
    insert into public.asaas_billing_events(event_id,user_id,subscription_id,event_type,access_status)
      values(p_event_id,holder.id,p_subscription_id,p_event_type,p_access_status);
  end if;
  update public.users set is_paid=access_paid,billing_access_status=p_access_status,
    subscription_paid_until=p_paid_until,asaas_subscription_status=p_subscription_status,
    asaas_billing_cycle=coalesce(asaas_billing_cycle,p_billing_cycle),
    signup_completed_at=case when access_paid then coalesce(signup_completed_at,now()) else signup_completed_at end,
    asaas_sync_token=null,asaas_sync_started_at=null where id=holder.id;
  return jsonb_build_object('paymentConfirmed',access_paid,'accessStatus',p_access_status,'paidUntil',p_paid_until);
end $$;

-- Legacy accounts (NULL status) retain their previous conditions until reconciled.
create or replace function public.subscription_payment_is_current(p_holder public.users)
returns boolean language sql stable set search_path=public as $$
  select coalesce(p_holder.is_paid and (p_holder.billing_access_status is null or
    (p_holder.billing_access_status in ('ACTIVE','CANCELLED') and p_holder.subscription_paid_until>now())),false);
$$;

-- Keep migration 025's quota/seat/lease behavior, adding payment expiry at the lock.
create or replace function public.increment_subscription_usage(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare actor public.users; owner_id uuid; org public.organizations; holder public.users; cap integer; ym text;
begin
  select * into actor from public.users where id=p_user_id;
  if actor.id is null then raise exception 'USER_NOT_FOUND'; end if;
  owner_id := actor.id;
  if actor.organization_id is not null then
    select * into org from public.organizations where id=actor.organization_id;
    if org.id is null or not org.is_active then raise exception 'TEAM_UNAVAILABLE'; end if;
    if org.owner_user_id is not null and org.owner_user_id <> actor.id then
      if not exists(select 1 from public.organization_seats where organization_id=org.id and phone=actor.phone and active) then raise exception 'SEAT_INACTIVE'; end if;
      owner_id := org.owner_user_id;
    end if;
  end if;
  select * into holder from public.users where id=owner_id for update;
  if not public.subscription_payment_is_current(holder) then raise exception 'SUBSCRIPTION_INACTIVE'; end if;
  if holder.subscription_terms is not null then cap := (holder.subscription_terms->>'maxAnalysesPerMonth')::integer;
  else select max_analyses_per_month into cap from public.product_plans where code=holder.subscription_plan_code and customer_segment=case when holder.billing_kind='team' then 'company' else 'personal' end; end if;
  if cap is null then update public.users set usage_count=usage_count+1 where id=owner_id;
  else
    ym := to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM');
    update public.users set billing_usage_count=case when billing_usage_ym=ym then billing_usage_count+1 else 1 end,billing_usage_ym=ym where id=owner_id;
  end if;
end $$;

create or replace function public.reserve_subscription_analysis(p_user_id uuid)
returns table(lease_id uuid) language plpgsql security definer set search_path=public as $$
declare actor public.users; owner_id uuid; org public.organizations; holder public.users;
  cap integer; ym text; used integer; expired integer; new_id uuid;
begin
  select * into actor from public.users where id=p_user_id;
  if actor.id is null then raise exception 'USER_NOT_FOUND'; end if;
  owner_id := actor.id;
  if actor.organization_id is not null then
    select * into org from public.organizations where id=actor.organization_id;
    if org.id is null or not org.is_active then raise exception 'TEAM_UNAVAILABLE'; end if;
    if org.owner_user_id is not null and org.owner_user_id <> actor.id then
      if not exists(select 1 from public.organization_seats where organization_id=org.id and phone=actor.phone and active) then raise exception 'SEAT_INACTIVE'; end if;
      owner_id := org.owner_user_id;
    end if;
  end if;
  select * into holder from public.users where id=owner_id for update;
  if not public.subscription_payment_is_current(holder) then raise exception 'SUBSCRIPTION_INACTIVE'; end if;
  if holder.subscription_terms is not null then cap := (holder.subscription_terms->>'maxAnalysesPerMonth')::integer;
  else select max_analyses_per_month into cap from public.product_plans where code=holder.subscription_plan_code and customer_segment=case when holder.billing_kind='team' then 'company' else 'personal' end; end if;
  if cap is null then return query select null::uuid; return; end if;
  ym := to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM');
  with removed as (delete from public.subscription_analysis_leases where owner_user_id=owner_id and created_at<now()-interval '30 minutes' returning usage_ym)
    select count(*)::integer into expired from removed where usage_ym=ym;
  used := case when holder.billing_usage_ym=ym then greatest(0,holder.billing_usage_count-expired) else 0 end;
  if used>=cap then raise exception 'QUOTA_EXHAUSTED'; end if;
  update public.users set billing_usage_ym=ym,billing_usage_count=used+1 where id=owner_id;
  insert into public.subscription_analysis_leases(owner_user_id,actor_user_id,usage_ym) values(owner_id,actor.id,ym) returning id into new_id;
  return query select new_id;
end $$;

revoke all on function public.claim_asaas_sync(text,text) from public,anon,authenticated;
revoke all on function public.release_asaas_sync(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finish_asaas_sync(uuid,uuid,text,text,text,text,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.subscription_payment_is_current(public.users) from public,anon,authenticated;
revoke all on function public.increment_subscription_usage(uuid) from public,anon,authenticated;
revoke all on function public.reserve_subscription_analysis(uuid) from public,anon,authenticated;
grant execute on function public.claim_asaas_sync(text,text) to service_role;
grant execute on function public.release_asaas_sync(uuid,uuid) to service_role;
grant execute on function public.finish_asaas_sync(uuid,uuid,text,text,text,text,timestamptz,text,text) to service_role;
grant execute on function public.subscription_payment_is_current(public.users) to service_role;
grant execute on function public.increment_subscription_usage(uuid) to service_role;
grant execute on function public.reserve_subscription_analysis(uuid) to service_role;
commit;
