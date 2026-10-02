-- Requires migrations 021, 022 and 023. Keep AGRO_MODULES_ENABLED=false until this transaction commits.
begin;

create table public.farm_activities (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade,
 name text not null, module_key text not null check(module_key in ('horticulture','crops','orchards','equines','beef_cattle','dairy_cattle','poultry','pigs','sheep_goats','aquaculture','beekeeping','forestry','other')),
 status text not null default 'active' check(status in ('active','inactive')), notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,farm_id)
);
create unique index farm_activities_name_idx on public.farm_activities(farm_id,lower(name));
create table public.production_units (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade, activity_id uuid not null,
 name text not null, unit_type text not null check(unit_type in ('crop_area','orchard','animal','herd','flock','pond','hive','apiary','forestry_block','facility')),
 species text, identifier text, sex text check(sex in ('female','male','unknown')), birth_date date, owner_name text, location text, notes text,
 opening_count integer not null default 0 check(opening_count between 0 and 10000000), current_count integer not null default 0 check(current_count between 0 and 10000000),
 status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,farm_id), unique(id,activity_id,farm_id), foreign key(activity_id,farm_id) references public.farm_activities(id,farm_id)
);
create unique index production_units_identifier_idx on public.production_units(farm_id,lower(identifier)) where identifier is not null;
create index production_units_activity_idx on public.production_units(farm_id,activity_id,created_at,id);
create table public.production_events (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade, activity_id uuid not null, production_unit_id uuid not null,
 event_type text not null check(event_type in ('planting','harvest','production','milk','weighing','feeding','training','competition','care','reproduction','inspection','movement','stock_entry','stock_exit','mortality')),
 event_date date not null, description text not null, quantity numeric check(quantity>0 and quantity<=1e9), unit text,
 duration_minutes numeric check(duration_minutes>0 and duration_minutes<=1e9), time_seconds numeric check(time_seconds>0 and time_seconds<=1e9), penalty_seconds numeric check(penalty_seconds>=0 and penalty_seconds<=1e9),
 operator text, period text check(period in ('morning','afternoon','evening','day')), destination text, inventory_item_id uuid,
 status text not null default 'active' check(status in ('active','voided')), source_message_id text, created_by_user_id uuid not null references public.users,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,farm_id), foreign key(production_unit_id,activity_id,farm_id) references public.production_units(id,activity_id,farm_id),
 foreign key(inventory_item_id,farm_id) references public.inventory_items(id,farm_id),
 check(inventory_item_id is null or (event_type='feeding' and unit='kg')),
 check((quantity is null)=(unit is null)),
 check(event_type<>'weighing' or (quantity is not null and unit='kg')),
 check(event_type<>'milk' or (quantity is not null and unit='L' and period is not null)),
 check(event_type<>'training' or duration_minutes is not null),
 check(event_type<>'competition' or time_seconds is not null),
 check(event_type not in ('stock_entry','stock_exit','mortality','production') or (quantity is not null and quantity=trunc(quantity) and unit='un')),
 check(event_type<>'movement' or destination is not null)
);
create index production_events_scope_idx on public.production_events(farm_id,activity_id,production_unit_id,event_date desc,id);
create unique index production_weighing_day_idx on public.production_events(production_unit_id,event_date) where event_type='weighing' and status='active';
create unique index production_milk_period_idx on public.production_events(production_unit_id,event_date,period) where event_type='milk' and status='active';
create table public.farm_sales (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade, activity_id uuid not null, production_unit_id uuid,
 description text not null, customer text not null, amount numeric(14,2) not null check(amount>0), quantity numeric check(quantity>0), unit text,
 sale_date date not null, due_date date not null check(due_date>=sale_date), status text not null default 'active' check(status in ('active','cancelled')),
 source_message_id text, created_by_user_id uuid not null references public.users,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,farm_id),
 foreign key(activity_id,farm_id) references public.farm_activities(id,farm_id),
 foreign key(production_unit_id,activity_id,farm_id) references public.production_units(id,activity_id,farm_id), check((quantity is null)=(unit is null))
);
create index farm_sales_scope_idx on public.farm_sales(farm_id,activity_id,sale_date desc,id);
create table public.sale_payments (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade, sale_id uuid not null,
 amount numeric(14,2) not null check(amount>0), payment_date date not null, method text not null check(method in ('pix','cash','transfer','card','other')),
 status text not null default 'active' check(status in ('active','voided')), notes text, source_message_id text, created_by_user_id uuid not null references public.users,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(sale_id,farm_id) references public.farm_sales(id,farm_id)
);
create index sale_payments_scope_idx on public.sale_payments(farm_id,sale_id,payment_date,id);
alter table public.inventory_movements add column production_event_id uuid;
alter table public.inventory_movements add foreign key(production_event_id,farm_id) references public.production_events(id,farm_id);
create function public.agro_feed_inventory() returns trigger language plpgsql as $$
declare old_quantity numeric=0; new_quantity numeric=0; delta numeric;
begin
 if tg_op='UPDATE' then
  if new.inventory_item_id is distinct from old.inventory_item_id then raise exception 'Immutable inventory link'; end if;
  if old.status='active' then old_quantity=old.quantity; end if;
 end if;
 if new.inventory_item_id is null then return new; end if;
 if not exists(select 1 from public.inventory_items where id=new.inventory_item_id and farm_id=new.farm_id and unit='kg') then raise exception 'Feed unit must be kg'; end if;
 if new.status='active' then new_quantity=new.quantity; end if;
 delta=new_quantity-old_quantity;
 if delta<>0 then
  insert into public.inventory_movements(farm_id,inventory_item_id,type,quantity,production_event_id,source_message_id,created_by_user_id)
  values(new.farm_id,new.inventory_item_id,case when delta>0 then 'usage' else 'entry' end,abs(delta),new.id,new.source_message_id,new.created_by_user_id);
 end if;
 return new;
end $$;
create trigger agro_feed_inventory after insert or update on public.production_events for each row execute function public.agro_feed_inventory();

alter table public.farm_expenses add column activity_id uuid, add column production_unit_id uuid;
alter table public.farm_tasks add column activity_id uuid, add column production_unit_id uuid;
alter table public.farm_expenses add foreign key(activity_id,farm_id) references public.farm_activities(id,farm_id),
 add foreign key(production_unit_id,activity_id,farm_id) references public.production_units(id,activity_id,farm_id),
 add check(production_unit_id is null or activity_id is not null);
alter table public.farm_tasks add foreign key(activity_id,farm_id) references public.farm_activities(id,farm_id),
 add foreign key(production_unit_id,activity_id,farm_id) references public.production_units(id,activity_id,farm_id),
 add check(production_unit_id is null or activity_id is not null);

-- Derived group counts cannot be set by callers. Counts are recomputed on every correction.
create function public.agro_unit_guard() returns trigger language plpgsql as $$
begin
 if tg_op='INSERT' then new.current_count=new.opening_count;
 elsif (new.activity_id,new.unit_type,new.species,new.opening_count) is distinct from (old.activity_id,old.unit_type,old.species,old.opening_count) then
  raise exception 'Immutable unit identity';
 end if;
 return new;
end $$;
create trigger agro_unit_guard before insert or update on public.production_units for each row execute function public.agro_unit_guard();
create function public.agro_event_guard() returns trigger language plpgsql as $$
declare u public.production_units; running_min numeric; balance numeric;
begin
 if tg_op='UPDATE' and (new.activity_id,new.production_unit_id,new.event_type) is distinct from (old.activity_id,old.production_unit_id,old.event_type) then raise exception 'Immutable event identity'; end if;
 select * into u from public.production_units where id=new.production_unit_id for no key update;
 if new.event_type in ('stock_entry','stock_exit','mortality') and u.unit_type not in ('herd','flock','pond','apiary') then raise exception 'Group required'; end if;
 if new.event_type='milk' and new.status='active' and exists (
  select 1 from public.production_events where production_unit_id=new.production_unit_id and event_type='milk' and status='active'
  and event_date=new.event_date and id<>new.id and (period='day' or new.period='day' or period=new.period)
 ) then raise exception 'Overlapping milk period'; end if;
 if new.event_type in ('stock_entry','stock_exit','mortality') then
  select coalesce(min(q),0),coalesce(sum(delta),0) into running_min,balance from (
   select delta,sum(delta) over(order by event_date,created_at,id) q from (
    select event_date,created_at,id,case when event_type='stock_entry' then quantity else -quantity end delta
    from public.production_events where production_unit_id=new.production_unit_id and status='active' and event_type in ('stock_entry','stock_exit','mortality')
   ) events
  ) balances;
  if u.opening_count+running_min<0 or u.opening_count+balance>10000000 then raise exception 'Invalid group balance'; end if;
  update public.production_units set current_count=u.opening_count+balance,updated_at=now() where id=u.id;
 end if;
 return new;
end $$;
create trigger agro_event_guard after insert or update on public.production_events for each row execute function public.agro_event_guard();

-- Lock the sale so concurrent partial payments cannot overpay it.
create function public.agro_payment_guard() returns trigger language plpgsql as $$
declare s public.farm_sales; paid numeric;
begin
 if tg_op='UPDATE' and new.sale_id<>old.sale_id then raise exception 'Immutable payment identity'; end if;
 select * into s from public.farm_sales where id=new.sale_id for no key update;
 select coalesce(sum(amount),0) into paid from public.sale_payments where sale_id=s.id and status='active';
 if paid>s.amount or (paid>0 and s.status<>'active') then raise exception 'Invalid payment balance'; end if;
 return new;
end $$;
create trigger agro_payment_guard after insert or update on public.sale_payments for each row execute function public.agro_payment_guard();
create function public.agro_sale_guard() returns trigger language plpgsql as $$
declare paid numeric;
begin
 if (new.activity_id,new.production_unit_id) is distinct from (old.activity_id,old.production_unit_id) then raise exception 'Immutable sale identity'; end if;
 select coalesce(sum(amount),0) into paid from public.sale_payments where sale_id=new.id and status='active';
 if paid>new.amount or (paid>0 and new.status='cancelled') then raise exception 'Payments must be corrected first'; end if;
 return new;
end $$;
create trigger agro_sale_guard before update on public.farm_sales for each row execute function public.agro_sale_guard();

do $$ declare t text; begin
 foreach t in array array['farm_activities','production_units','production_events','farm_sales','sale_payments'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create trigger rural_touch before update on public.%I for each row execute function public.rural_touch()',t);
 end loop;
end $$;

-- The existing audited RPC is replaced below, preserving idempotency and the legacy entities.

create or replace function public.apply_rural_action(p_user uuid,p_source text,p_key text,p_tool text,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare c jsonb; t text; v jsonb; fid uuid; rid uuid; cols text; vals text; sets text; row_json jsonb; results jsonb='[]'; previous jsonb; before_row jsonb; snapshots jsonb='[]';
begin
 if jsonb_array_length(p_changes)<1 or jsonb_array_length(p_changes)>8 then raise exception 'Invalid batch'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||p_source,0));
 select output_json into previous from assistant_actions where user_id=p_user and source_message_id=p_source and idempotency_key=p_key;
 if found then return previous; end if;
 for c in select * from jsonb_array_elements(p_changes) loop
  t=c->>'table'; v=c->'values'; rid=(c->>'id')::uuid; before_row=null;
  if t not in ('farms','fields','field_aliases','crop_seasons','field_cycles','farm_operations','farm_expenses','farm_tasks','field_occurrences',
    'occurrence_followups','inventory_items','inventory_movements','assistant_memories','alert_rules','farm_activities','production_units','production_events','farm_sales','sale_payments') then raise exception 'Invalid entity'; end if;
  if v ?| array['id','created_at','updated_at','owner_user_id','organization_id','user_id','created_by_user_id','source_message_id','current_quantity','current_count'] then raise exception 'Protected field'; end if;
  if rid is not null then
   if t='inventory_movements' then raise exception 'Use inventory movements'; end if;
   execute format('select to_jsonb(x) from public.%I x where id=$1 for update',t) into before_row using rid;
   if before_row is null then raise exception 'Entity unavailable'; end if;
   fid=case when t='farms' then rid else (before_row->>'farm_id')::uuid end;
   if v ? 'farm_id' and (v->>'farm_id')::uuid<>fid then raise exception 'Cannot move entity'; end if;
  else fid=(v->>'farm_id')::uuid; end if;
  if not(t='farms' and rid is null) and not exists(select 1 from farms where id=fid and owner_user_id=p_user) then raise exception 'Farm unavailable'; end if;
  if t='farms' and rid is null then v=v||jsonb_build_object('owner_user_id',p_user); end if;
  if rid is null and t in ('farm_operations','farm_expenses','farm_tasks','inventory_movements','production_events','farm_sales','sale_payments') then v=v||jsonb_build_object('created_by_user_id',p_user); end if;
  if rid is null and t in ('assistant_memories','alert_rules') then v=v||jsonb_build_object('user_id',p_user); end if;
  if t in ('farm_operations','farm_expenses','farm_tasks','field_occurrences','occurrence_followups','inventory_movements','assistant_memories','production_events','farm_sales','sale_payments') then
   v=v||jsonb_build_object('source_message_id',p_source);
   if t='alert_rules' then v=v-'source_message_id'; end if;
  end if;
  if t='farm_operations' and c->>'link_previous_cycle'='true' then
   if jsonb_array_length(results)=0 then raise exception 'Missing planting cycle'; end if;
   v=v||jsonb_build_object('field_cycle_id',results->(jsonb_array_length(results)-1)->>'id');
  end if;
  select string_agg(format('%I',key),','),string_agg(format('x.%I',key),','),string_agg(format('%I=x.%I',key,key),',')
   into cols,vals,sets from jsonb_object_keys(v) as k(key);
  if rid is null then
   execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) x returning to_jsonb(%I.*)',t,cols,vals,t,t) into row_json using v;
  else
   execute format('update public.%I target set %s from jsonb_populate_record(null::public.%I,$1) x where target.id=$2 returning to_jsonb(target.*)',t,sets,t) into row_json using v,rid;
  end if;
  results=results||jsonb_build_array(row_json);
  snapshots=snapshots||jsonb_build_array(jsonb_build_object('table',t,'before',before_row,'after',row_json));
 end loop;
 insert into assistant_actions(user_id,farm_id,action_type,tool_name,input_json,output_json,status,source_message_id,idempotency_key)
 values(p_user,case when t='farms' then (row_json->>'id')::uuid else fid end,'WRITE',p_tool,jsonb_build_object('changes',snapshots),results,'success',p_source,p_key);
 return results;
end $$;


commit;
