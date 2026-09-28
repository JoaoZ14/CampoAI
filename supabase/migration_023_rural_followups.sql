begin;
alter table public.assistant_context add column pending_action jsonb, add column pending_media jsonb;
alter table public.scheduled_jobs add column alert_id uuid unique references public.assistant_alerts on delete cascade;
-- Private operational media, max 10 MB, explicit retention implemented by the worker.
do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('farm-media','farm-media',false,10485760,array['image/jpeg','image/png','image/webp','audio/ogg','audio/mpeg','audio/mp4'])
  on conflict(id) do nothing;
 end if;
end $$;
create function public.rural_low_stock_alert() returns trigger language plpgsql as $$
declare owner_id uuid; alert_id_value uuid; previous_status text;
begin
 select owner_user_id into owner_id from public.farms where id=new.farm_id;
 if new.minimum_quantity is not null and new.current_quantity<new.minimum_quantity then
  select status into previous_status from public.assistant_alerts where dedupe_key='low_stock:'||new.id;
  insert into public.assistant_alerts(farm_id,user_id,type,title,message,related_entity_type,related_entity_id,dedupe_key)
  values(new.farm_id,owner_id,'low_stock','Estoque abaixo do mínimo',new.name||': '||new.current_quantity||' '||new.unit,'inventory_items',new.id,'low_stock:'||new.id)
  on conflict(dedupe_key) do update set status='pending',message=excluded.message returning id into alert_id_value;
  if exists(select 1 from public.alert_rules where farm_id=new.farm_id and user_id=owner_id and active and type='low_stock' and config_json->>'inventory_item_id'=new.id::text) then
   insert into public.scheduled_jobs(type,user_id,alert_id,payload,run_at)
   values('low_stock',owner_id,alert_id_value,jsonb_build_object('title','Estoque baixo: '||new.name||' ('||new.current_quantity||' '||new.unit||')'),now())
   on conflict(alert_id) do update set status='pending',run_at=now(),payload=excluded.payload,lock_token=null,attempts=0
   where previous_status='resolved' and scheduled_jobs.status in ('completed','cancelled','failed');
  end if;
 else
  update public.assistant_alerts set status='resolved' where dedupe_key='low_stock:'||new.id;
  update public.scheduled_jobs set status='cancelled' where alert_id in (select id from public.assistant_alerts where dedupe_key='low_stock:'||new.id) and status in ('pending','locked');
 end if;
 return new;
end $$;
create trigger rural_low_stock_alert after insert or update of current_quantity,minimum_quantity on public.inventory_items for each row execute function public.rural_low_stock_alert();
commit;
