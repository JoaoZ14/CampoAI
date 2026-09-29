begin;
create function public.rural_touch() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
do $$ declare t text; begin
 foreach t in array array['farms','fields','field_aliases','crop_seasons','field_cycles','assistant_memories','farm_operations','farm_expenses','farm_tasks',
 'field_occurrences','occurrence_followups','inventory_items','inventory_movements','alert_rules','assistant_alerts','message_attachments'] loop
 execute format('create trigger rural_touch before update on public.%I for each row execute function public.rural_touch()',t);
 end loop;
end $$;

create function public.rural_inventory_movement() returns trigger language plpgsql as $$
begin
 update public.inventory_items set current_quantity=current_quantity + case when new.type='entry' then new.quantity else -new.quantity end
 where id=new.inventory_item_id and farm_id=new.farm_id;
 return new;
end $$;
create trigger rural_inventory_movement after insert on public.inventory_movements for each row execute function public.rural_inventory_movement();

create function public.rural_task_job() returns trigger language plpgsql as $$
begin
 if new.remind and new.status='pending' then
  insert into public.scheduled_jobs(type,user_id,task_id,payload,run_at)
  values('reminder',new.created_by_user_id,new.id,jsonb_build_object('title',new.title,'farm_id',new.farm_id),new.due_at)
  on conflict(task_id) do update set run_at=excluded.run_at,payload=excluded.payload,status='pending',attempts=0,locked_at=null,lock_token=null
  where scheduled_jobs.status in ('pending','cancelled','failed','completed');
 else
  update public.scheduled_jobs set status='cancelled' where task_id=new.id and status in ('pending','locked');
 end if;
 return new;
end $$;
create trigger rural_task_job after insert or update on public.farm_tasks for each row execute function public.rural_task_job();

-- Atomic, replayable server-side action. Not exposed to browser roles.
create function public.apply_rural_action(p_user uuid,p_source text,p_key text,p_tool text,p_changes jsonb)
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
    'occurrence_followups','inventory_items','inventory_movements','assistant_memories','alert_rules') then raise exception 'Invalid entity'; end if;
  if v ?| array['id','created_at','updated_at','owner_user_id','organization_id','user_id','created_by_user_id','source_message_id','current_quantity'] then raise exception 'Protected field'; end if;
  if rid is not null then
   if t='inventory_movements' then raise exception 'Use inventory movements'; end if;
   execute format('select to_jsonb(x) from public.%I x where id=$1 for update',t) into before_row using rid;
   if before_row is null then raise exception 'Entity unavailable'; end if;
   fid=case when t='farms' then rid else (before_row->>'farm_id')::uuid end;
   if v ? 'farm_id' and (v->>'farm_id')::uuid<>fid then raise exception 'Cannot move entity'; end if;
  else fid=(v->>'farm_id')::uuid; end if;
  if not(t='farms' and rid is null) and not exists(select 1 from farms where id=fid and owner_user_id=p_user) then raise exception 'Farm unavailable'; end if;
  if t='farms' and rid is null then v=v||jsonb_build_object('owner_user_id',p_user); end if;
  if rid is null and t in ('farm_operations','farm_expenses','farm_tasks','inventory_movements') then v=v||jsonb_build_object('created_by_user_id',p_user); end if;
  if rid is null and t in ('assistant_memories','alert_rules') then v=v||jsonb_build_object('user_id',p_user); end if;
  if t in ('farm_operations','farm_expenses','farm_tasks','field_occurrences','occurrence_followups','inventory_movements','assistant_memories') then
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

create function public.claim_rural_jobs(p_limit integer default 10) returns setof public.scheduled_jobs language plpgsql as $$
begin
 -- A crash after dispatch has an unknown outcome: never automatically send twice.
 update public.scheduled_jobs set status='uncertain',last_error='Dispatch outcome unknown' where status='sending' and locked_at<now()-interval '10 minutes';
 return query with due as (
 select id from public.scheduled_jobs where (status='pending' and run_at<=now()) or (status='locked' and locked_at<now()-interval '10 minutes')
 order by run_at for update skip locked limit least(greatest(p_limit,1),50)
 ) update public.scheduled_jobs j set status='locked',locked_at=now(),lock_token=gen_random_uuid(),attempts=attempts+1 from due where j.id=due.id returning j.*;
end $$;
create function public.claim_rural_inbox() returns setof public.assistant_inbox language plpgsql as $$
begin
 update public.assistant_inbox set status='uncertain',last_error='Processing interrupted; review actions before replay' where status='processing' and locked_at<now()-interval '10 minutes';
 return query with due as (
 select i.id from public.assistant_inbox i where i.status='pending'
 and not exists(select 1 from public.assistant_inbox p where p.status='processing' and p.payload->>'phone'=i.payload->>'phone')
 and not exists(select 1 from public.assistant_inbox p where p.status='pending' and p.payload->>'phone'=i.payload->>'phone' and (p.created_at,p.id)<(i.created_at,i.id))
 order by i.created_at for update skip locked limit 1
 ) update public.assistant_inbox j set status='processing',locked_at=now(),lock_token=gen_random_uuid(),attempts=attempts+1 from due where j.id=due.id returning j.*;
end $$;
revoke all on function public.apply_rural_action(uuid,text,text,text,jsonb), public.claim_rural_jobs(integer), public.claim_rural_inbox() from public,anon,authenticated;
grant execute on function public.apply_rural_action(uuid,text,text,text,jsonb), public.claim_rural_jobs(integer), public.claim_rural_inbox() to service_role;
commit;
