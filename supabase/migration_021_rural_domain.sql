begin;
create table public.farms (
 id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.users on delete cascade,
 organization_id uuid references public.organizations on delete set null,
 name text not null default 'Minha propriedade', nickname text, city text, state text, country text not null default 'BR',
 latitude numeric check(latitude between -90 and 90), longitude numeric check(longitude between -180 and 180),
 total_area_ha numeric check(total_area_ha > 0), timezone text not null default 'America/Sao_Paulo', main_activity text, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((latitude is null) = (longitude is null))
);
create index farms_owner_idx on public.farms(owner_user_id);
create table public.farm_members (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade,
 user_id uuid not null references public.users on delete cascade,
 role text not null check(role in ('owner','manager','worker','advisor','viewer')), created_at timestamptz not null default now(), unique(farm_id,user_id)
);
create table public.fields (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade,
 name text not null, area_ha numeric check(area_ha > 0), description text, latitude numeric, longitude numeric, boundary_geojson jsonb,
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,farm_id)
);
create unique index fields_name_idx on public.fields(farm_id,lower(name));
create table public.field_aliases (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade,
 field_id uuid not null, alias text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(field_id,farm_id) references public.fields(id,farm_id) on delete cascade, unique(farm_id,alias)
);
create table public.crop_seasons (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade,
 name text not null, start_date date, end_date date, status text not null default 'active' check(status in ('planned','active','completed')),
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,farm_id),
 check(end_date is null or start_date is null or end_date >= start_date)
);
create table public.field_cycles (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade, field_id uuid not null,
 crop_season_id uuid, crop_name text not null, cultivar text, planting_date date, expected_harvest_date date,
 area_ha numeric check(area_ha > 0), status text not null default 'active', notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,farm_id),
 foreign key(field_id,farm_id) references public.fields(id,farm_id), foreign key(crop_season_id,farm_id) references public.crop_seasons(id,farm_id)
);
create table public.assistant_context (
 user_id uuid primary key references public.users on delete cascade, farm_id uuid references public.farms on delete cascade,
 field_id uuid, field_cycle_id uuid, expires_at timestamptz not null, updated_at timestamptz not null default now(),
 foreign key(field_id,farm_id) references public.fields(id,farm_id), foreign key(field_cycle_id,farm_id) references public.field_cycles(id,farm_id)
);
create table public.assistant_memories (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade,
 user_id uuid not null references public.users on delete cascade, field_id uuid, type text not null, key text not null,
 value_json jsonb not null, source_message_id text, confidence numeric not null default 1 check(confidence between 0 and 1),
 confirmed boolean not null default false, expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(field_id,farm_id) references public.fields(id,farm_id), unique(user_id,farm_id,key)
);
create table public.farm_operations (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade, field_id uuid, field_cycle_id uuid,
 operation_type text not null, operation_date date not null, area_ha numeric check(area_ha > 0), description text not null,
 quantity numeric check(quantity > 0), unit text, cost numeric(14,2) check(cost >= 0), metadata jsonb not null default '{}',
 source text not null default 'whatsapp', source_message_id text, created_by_user_id uuid not null references public.users,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,farm_id),
 foreign key(field_id,farm_id) references public.fields(id,farm_id), foreign key(field_cycle_id,farm_id) references public.field_cycles(id,farm_id),
 check((quantity is null) = (unit is null))
);
create table public.farm_expenses (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade, field_id uuid, field_cycle_id uuid, crop_season_id uuid,
 category text not null, description text not null, amount numeric(14,2) not null check(amount > 0), quantity numeric check(quantity > 0), unit text,
 expense_date date not null, supplier text, source_message_id text, created_by_user_id uuid not null references public.users,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(field_id,farm_id) references public.fields(id,farm_id), foreign key(field_cycle_id,farm_id) references public.field_cycles(id,farm_id),
 foreign key(crop_season_id,farm_id) references public.crop_seasons(id,farm_id)
);
create table public.farm_tasks (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade, field_id uuid, field_cycle_id uuid,
 title text not null, description text, due_at timestamptz not null, status text not null default 'pending' check(status in ('pending','completed','cancelled')),
 priority text not null default 'normal', remind boolean not null default false,
 created_by_user_id uuid not null references public.users, source_message_id text, completed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,farm_id),
 foreign key(field_id,farm_id) references public.fields(id,farm_id), foreign key(field_cycle_id,farm_id) references public.field_cycles(id,farm_id)
);
create table public.field_occurrences (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade, field_id uuid not null, field_cycle_id uuid,
 type text not null, title text not null, description text not null, detected_at timestamptz not null, status text not null default 'open', severity text,
 ai_analysis jsonb, source_message_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,farm_id),
 foreign key(field_id,farm_id) references public.fields(id,farm_id), foreign key(field_cycle_id,farm_id) references public.field_cycles(id,farm_id)
);
create table public.occurrence_followups (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade, occurrence_id uuid not null,
 description text not null, source_message_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(occurrence_id,farm_id) references public.field_occurrences(id,farm_id)
);
create table public.inventory_items (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade, name text not null, category text not null,
 unit text not null, current_quantity numeric not null default 0 check(current_quantity >= 0), minimum_quantity numeric check(minimum_quantity >= 0), notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,farm_id), unique(farm_id,name,unit)
);
create table public.inventory_movements (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade, inventory_item_id uuid not null,
 type text not null check(type in ('entry','usage')), quantity numeric not null check(quantity > 0), operation_id uuid,
 source_message_id text, created_by_user_id uuid not null references public.users, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(inventory_item_id,farm_id) references public.inventory_items(id,farm_id), foreign key(operation_id,farm_id) references public.farm_operations(id,farm_id)
);
create table public.alert_rules (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade, user_id uuid not null references public.users,
 type text not null, config_json jsonb not null default '{}', active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.assistant_alerts (
 id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms on delete cascade, user_id uuid not null references public.users,
 type text not null, severity text not null default 'info', title text not null, message text not null,
 related_entity_type text, related_entity_id uuid, status text not null default 'pending', scheduled_for timestamptz, sent_at timestamptz,
 dedupe_key text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.message_attachments (
 id uuid primary key default gen_random_uuid(), message_id text not null, user_id uuid not null references public.users on delete cascade,
 farm_id uuid not null references public.farms on delete cascade, field_id uuid, occurrence_id uuid,
 type text not null check(type in ('image','audio')), storage_path text not null unique, mime_type text not null, metadata jsonb not null default '{}',
 expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(field_id,farm_id) references public.fields(id,farm_id), foreign key(occurrence_id,farm_id) references public.field_occurrences(id,farm_id)
);
create table public.assistant_actions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users on delete cascade, farm_id uuid references public.farms on delete cascade,
 action_type text not null, tool_name text not null, input_json jsonb not null default '{}', output_json jsonb,
 status text not null, source_message_id text not null, idempotency_key text not null, created_at timestamptz not null default now(),
 unique(user_id,source_message_id,idempotency_key)
);
create table public.scheduled_jobs (
 id uuid primary key default gen_random_uuid(), type text not null, user_id uuid not null references public.users on delete cascade,
 task_id uuid unique references public.farm_tasks on delete cascade, payload jsonb not null default '{}', run_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','locked','sending','completed','cancelled','uncertain','failed')),
 attempts integer not null default 0, last_error text, locked_at timestamptz, lock_token uuid, completed_at timestamptz, provider_sid text,
 created_at timestamptz not null default now()
);
create index scheduled_jobs_due_idx on public.scheduled_jobs(run_at) where status='pending';
create table public.assistant_inbox (
 id text primary key, payload jsonb not null, status text not null default 'pending', attempts integer not null default 0,
 locked_at timestamptz, lock_token uuid, last_error text, created_at timestamptz not null default now(), completed_at timestamptz
);
create index assistant_inbox_pending_idx on public.assistant_inbox(created_at) where status='pending';
create table public.weather_cache (
 key text primary key, value_json jsonb not null, expires_at timestamptz not null
);

-- Server-only domain: no direct anon/authenticated grants. JWT is resolved to public.users in Express.
do $$ declare t text; begin
 foreach t in array array['farms','farm_members','fields','field_aliases','crop_seasons','field_cycles','assistant_context','assistant_memories',
 'farm_operations','farm_expenses','farm_tasks','field_occurrences','occurrence_followups','inventory_items','inventory_movements',
 'alert_rules','assistant_alerts','message_attachments','assistant_actions','scheduled_jobs','assistant_inbox','weather_cache'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['fields','crop_seasons','field_cycles','assistant_memories','farm_operations','farm_expenses','farm_tasks','field_occurrences',
 'occurrence_followups','inventory_items','inventory_movements','assistant_alerts','message_attachments'] loop
 execute format('create index %I on public.%I(farm_id,created_at desc)',t||'_farm_created_idx',t);
 end loop;
end $$;
create index farm_expenses_date_idx on public.farm_expenses(farm_id,expense_date,crop_season_id);
create index farm_operations_date_idx on public.farm_operations(farm_id,operation_date);
create index farm_tasks_due_idx on public.farm_tasks(farm_id,status,due_at);
create index assistant_actions_user_idx on public.assistant_actions(user_id,created_at desc);
commit;
