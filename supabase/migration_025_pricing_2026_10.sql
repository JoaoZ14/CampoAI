-- Apply once, before deploying the new checkout. Safe to re-run.
-- Does not change subscriptions or charges already created in Asaas.
begin;

alter table public.product_plans add column if not exists pricing_version text not null default 'legacy';
alter table public.users add column if not exists subscription_terms jsonb;
comment on column public.users.subscription_terms is 'Offer accepted at checkout; preserves existing subscription entitlements independently of the public catalog';

-- Capture existing conditions BEFORE updating the public offers. NULL cap means unlimited.
update public.users u set subscription_terms = jsonb_build_object(
  'version', 'legacy', 'code', u.subscription_plan_code,
  'customerSegment', case when u.billing_kind = 'team' then 'company' else 'personal' end,
  'name', coalesce(p.name, 'Assinatura existente'), 'priceBrl', p.price_brl,
  'maxAnalysesPerMonth', p.max_analyses_per_month, 'seats', coalesce(p.max_whatsapp_seats, 1)
)
from public.product_plans p
where u.is_paid and u.subscription_terms is null
  and p.code = u.subscription_plan_code
  and p.customer_segment = case when u.billing_kind = 'team' then 'company' else 'personal' end;

-- Preserve manually enabled legacy accounts as well.
update public.users set subscription_terms = jsonb_build_object(
  'version', 'legacy', 'code', subscription_plan_code, 'name', 'Assinatura existente',
  'customerSegment', case when billing_kind = 'team' then 'company' else 'personal' end,
  'priceBrl', null, 'maxAnalysesPerMonth', null, 'seats', 1
) where is_paid and subscription_terms is null;

insert into public.product_plans (code, customer_segment, name, price_brl, summary, max_whatsapp_seats, max_analyses_per_month, pricing_version, highlight, sort_order, active)
values
  ('lite','personal','Essencial',39,'Para começar: 40 análises de IA por mês e um número de WhatsApp.',1,40,'2026-10',false,1,true),
  ('basic','personal','Starter',79,'Para a rotina: 100 análises de IA por mês e um número de WhatsApp.',1,100,'2026-10',true,2,true),
  ('premium','personal','Team',179,'Até três números de WhatsApp com 250 análises de IA por mês compartilhadas pela assinatura.',3,250,'2026-10',false,3,true),
  ('premium','company','Business',299,'Para empresas: até cinco números de WhatsApp com 400 análises de IA por mês compartilhadas pela assinatura.',5,400,'2026-10',true,4,true)
on conflict (code, customer_segment) do update set name=excluded.name, price_brl=excluded.price_brl,
  summary=excluded.summary, max_whatsapp_seats=excluded.max_whatsapp_seats,
  max_analyses_per_month=excluded.max_analyses_per_month, pricing_version=excluded.pricing_version,
  highlight=excluded.highlight, sort_order=excluded.sort_order, active=true, updated_at=now();

update public.product_plans set active=false, highlight=false, updated_at=now()
where code='pro' or (customer_segment='company' and code <> 'premium');

insert into public.plan_catalog (id,version,plans,notes)
select 'default','2026-10', jsonb_agg(jsonb_build_object(
  'code',code,'customerSegment',customer_segment,'name',name,'priceBrl',price_brl,'period','mês',
  'summary',summary,'seats',max_whatsapp_seats,'maxAnalysesPerMonth',max_analyses_per_month,'highlight',highlight,
  'bullets',jsonb_build_array(
    'Até ' || max_analyses_per_month || ' análises de IA por mês' || case when max_whatsapp_seats>1 then ', compartilhadas entre os números' else '' end,
    case when max_whatsapp_seats=1 then 'Um número de WhatsApp' else 'Até ' || max_whatsapp_seats || ' números de WhatsApp no mesmo plano' end,
    'Registrar, editar e consultar pelo app sem consumir análises de IA'
  )) order by sort_order),
  '["Franquias mensais, inclusive no anual; renovam no primeiro dia do mês em horário de Brasília, sem acumular.","Uma análise é um pedido processado com sucesso pela IA, em texto, foto ou áudio. Esclarecimentos processados pela IA também contam; falhas e comandos sem IA não contam.","Team e Business dividem a franquia entre os números. Não há cobrança automática de excedente. O uso manual do app continua durante a assinatura ativa."]'::jsonb
from public.product_plans where active
on conflict (id) do update set version=excluded.version, plans=excluded.plans, notes=excluded.notes, updated_at=now();

-- Serialize increments on the subscription owner's row to avoid lost updates between seats.
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
      if not exists (select 1 from public.organization_seats where organization_id=org.id and phone=actor.phone and active)
        then raise exception 'SEAT_INACTIVE'; end if;
      owner_id := org.owner_user_id;
    end if;
  end if;
  select * into holder from public.users where id=owner_id for update;
  if not holder.is_paid then raise exception 'SUBSCRIPTION_INACTIVE'; end if;
  if holder.subscription_terms is not null then
    cap := (holder.subscription_terms->>'maxAnalysesPerMonth')::integer;
  else
    select max_analyses_per_month into cap from public.product_plans where code=holder.subscription_plan_code
      and customer_segment=case when holder.billing_kind='team' then 'company' else 'personal' end;
  end if;
  if cap is null then
    update public.users set usage_count=usage_count+1 where id=owner_id;
  else
    ym := to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM');
    update public.users set billing_usage_count=case when billing_usage_ym=ym then billing_usage_count+1 else 1 end,
      billing_usage_ym=ym where id=owner_id;
  end if;
end;
$$;
-- Reserve before AI work so concurrent seats cannot overspend the same allowance.
create table if not exists public.subscription_analysis_leases (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  actor_user_id uuid not null references public.users(id) on delete cascade,
  usage_ym text not null,
  created_at timestamptz not null default now()
);
create index if not exists subscription_analysis_leases_owner_idx on public.subscription_analysis_leases(owner_user_id);
alter table public.subscription_analysis_leases enable row level security;

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
      if not exists (select 1 from public.organization_seats where organization_id=org.id and phone=actor.phone and active)
        then raise exception 'SEAT_INACTIVE'; end if;
      owner_id := org.owner_user_id;
    end if;
  end if;
  select * into holder from public.users where id=owner_id for update;
  if not holder.is_paid then raise exception 'SUBSCRIPTION_INACTIVE'; end if;
  if holder.subscription_terms is not null then
    cap := (holder.subscription_terms->>'maxAnalysesPerMonth')::integer;
  else
    select max_analyses_per_month into cap from public.product_plans where code=holder.subscription_plan_code
      and customer_segment=case when holder.billing_kind='team' then 'company' else 'personal' end;
  end if;
  if cap is null then return query select null::uuid; return; end if;
  ym := to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM');
  with removed as (delete from public.subscription_analysis_leases where owner_user_id=owner_id and created_at<now()-interval '30 minutes' returning usage_ym)
    select count(*)::integer into expired from removed where usage_ym=ym;
  used := case when holder.billing_usage_ym=ym then greatest(0,holder.billing_usage_count-expired) else 0 end;
  if used>=cap then raise exception 'QUOTA_EXHAUSTED'; end if;
  update public.users set billing_usage_ym=ym,billing_usage_count=used+1 where id=owner_id;
  insert into public.subscription_analysis_leases(owner_user_id,actor_user_id,usage_ym) values(owner_id,actor.id,ym) returning id into new_id;
  return query select new_id;
end;
$$;

create or replace function public.settle_subscription_analysis(p_lease_id uuid, p_charged boolean)
returns void language plpgsql security definer set search_path=public as $$
declare reservation public.subscription_analysis_leases; owner_id uuid;
begin
  -- Same lock order as reserve: holder first, then reservation.
  select owner_user_id into owner_id from public.subscription_analysis_leases where id=p_lease_id;
  if owner_id is null then return; end if;
  perform 1 from public.users where id=owner_id for update;
  delete from public.subscription_analysis_leases where id=p_lease_id returning * into reservation;
  if reservation.id is null then return; end if;
  if not p_charged then update public.users set billing_usage_count=greatest(0,billing_usage_count-1)
    where id=owner_id and billing_usage_ym=reservation.usage_ym; end if;
end;
$$;
revoke all on function public.reserve_subscription_analysis(uuid) from public, anon, authenticated;
revoke all on function public.settle_subscription_analysis(uuid,boolean) from public, anon, authenticated;
grant execute on function public.reserve_subscription_analysis(uuid) to service_role;
grant execute on function public.settle_subscription_analysis(uuid,boolean) to service_role;
revoke all on function public.increment_subscription_usage(uuid) from public, anon, authenticated;
grant execute on function public.increment_subscription_usage(uuid) to service_role;

commit;
