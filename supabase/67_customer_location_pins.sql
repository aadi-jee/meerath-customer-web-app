-- Location foundation after SQL 60/61. Earlier 62/63 are NOT prerequisites.
-- Delivery checkout stays disabled until zone quotes and POS fee integration are ready.
begin;
alter table public.customer_addresses
 add column if not exists latitude double precision,
 add column if not exists longitude double precision,
 add column if not exists label text not null default '',
 add column if not exists last_used_at timestamptz;
alter table public.customer_addresses alter column area drop not null, alter column street drop not null, alter column building drop not null;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.customer_addresses'::regclass and conname='customer_address_pin_pair') then
 alter table public.customer_addresses add constraint customer_address_pin_pair check (
  (latitude is null and longitude is null) or
  (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180));
 end if;
end $$;

create or replace function public.oracy_customer_addresses_v2(p_restaurant_id uuid) returns jsonb
language plpgsql security definer set search_path='' stable as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'address_type',a.address_type,
 'area',a.area,'street',a.street,'building',a.building,'unit',a.unit,'directions',a.directions,
 'latitude',a.latitude,'longitude',a.longitude,'label',a.label,'is_default',a.is_default,
 'updated_at',a.updated_at,'last_used_at',a.last_used_at) order by a.is_default desc,a.updated_at desc),'[]'::jsonb)
 into result from public.customer_addresses a where a.restaurant_id=p_restaurant_id and a.user_id=uid;
 return result;
end $$;

create or replace function public.oracy_save_customer_address_v2(
 p_restaurant_id uuid,p_address_id uuid,p_address_type text,p_latitude double precision,p_longitude double precision,
 p_label text default '',p_directions text default null,p_make_default boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); aid uuid:=coalesce(p_address_id,gen_random_uuid()); make_default boolean; saved public.customer_addresses%rowtype;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not exists(select 1 from public.restaurants r where r.id=p_restaurant_id and r.is_active) then raise exception 'Restaurant is unavailable'; end if;
 -- Serialize this address book for the maximum count and unique default constraints.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_restaurant_id::text||uid::text,0));
 if p_address_type is null or p_address_type not in('home','work','other') or
 p_latitude is null or not (p_latitude between -90 and 90) or
 p_longitude is null or not (p_longitude between -180 and 180) or
 char_length(coalesce(p_label,''))>180 or char_length(coalesce(p_directions,''))>300 then raise exception 'Invalid location'; end if;
 if p_address_id is null and (select count(*) from public.customer_addresses where restaurant_id=p_restaurant_id and user_id=uid)>=10 then raise exception 'Maximum 10 addresses allowed'; end if;
 if p_address_id is not null and not exists(select 1 from public.customer_addresses where id=p_address_id and restaurant_id=p_restaurant_id and user_id=uid) then raise exception 'Address not found' using errcode='P0002'; end if;
 make_default:=coalesce(p_make_default,false) or not exists(select 1 from public.customer_addresses where restaurant_id=p_restaurant_id and user_id=uid);
 if make_default then update public.customer_addresses set is_default=false where restaurant_id=p_restaurant_id and user_id=uid and is_default; end if;
 insert into public.customer_addresses(id,restaurant_id,user_id,address_type,latitude,longitude,label,directions,is_default)
 values(aid,p_restaurant_id,uid,p_address_type,p_latitude,p_longitude,btrim(coalesce(p_label,'')),nullif(btrim(coalesce(p_directions,'')),''),make_default)
 on conflict(id) do update set address_type=excluded.address_type,latitude=excluded.latitude,longitude=excluded.longitude,
 label=excluded.label,directions=excluded.directions,area=null,street=null,building=null,unit=null,
 last_used_at=case when public.customer_addresses.latitude is distinct from excluded.latitude or public.customer_addresses.longitude is distinct from excluded.longitude then null else public.customer_addresses.last_used_at end,
 is_default=case when make_default then true else public.customer_addresses.is_default end,updated_at=clock_timestamp()
 where public.customer_addresses.restaurant_id=p_restaurant_id and public.customer_addresses.user_id=uid returning * into saved;
 if saved.id is null then raise exception 'Address not found' using errcode='P0002'; end if;
 return jsonb_build_object('id',saved.id,'is_default',saved.is_default);
end $$;

-- No client may enable this gate. A subsequent reviewed migration supplies delivery
-- quote validation, POS totals, and enables it. This release only saves locations.
create table if not exists public.delivery_location_release (
 restaurant_id uuid primary key references public.restaurants(id),
 checkout_ready boolean not null default false
);
alter table public.delivery_location_release enable row level security;
revoke all on public.delivery_location_release from public,anon,authenticated;

create or replace function public.oracy_create_pin_delivery_order_v1(p_restaurant_id uuid,p_branch_id uuid,p_order jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); a public.customer_addresses%rowtype; result jsonb; existing public.customer_orders%rowtype; cid uuid;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_order->>'fulfillment_type' is distinct from 'delivery' then raise exception 'Delivery order required'; end if;
 cid:=(p_order->>'client_order_id')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(cid::text,0));
 select * into existing from public.customer_orders where client_order_id=cid;
 if found then
  if existing.customer_user_id is distinct from uid or existing.restaurant_id is distinct from p_restaurant_id or existing.branch_id is distinct from p_branch_id then raise exception 'Order not found' using errcode='42501'; end if;
  return jsonb_build_object('id',existing.id,'order_number',existing.order_number,'tracking_token',existing.tracking_token,'status',existing.status,'total',existing.total,'created_at',existing.created_at);
 end if;
 if not exists(select 1 from public.delivery_location_release where restaurant_id=p_restaurant_id and checkout_ready) then
 raise exception 'Delivery is being configured. Please call the restaurant.'; end if;
 select * into a from public.customer_addresses where id=(p_order->>'delivery_address_id')::uuid and user_id=uid and restaurant_id=p_restaurant_id for update;
 if not found or a.latitude is null or a.longitude is null then raise exception 'Confirm a saved map location'; end if;
 if a.updated_at is distinct from (p_order->>'delivery_address_version')::timestamptz then raise exception 'Location changed. Confirm it again.'; end if;
 result:=public.oracy_create_customer_order_v1(p_restaurant_id,p_branch_id,p_order||jsonb_build_object('address',concat_ws(' · ',coalesce(nullif(a.label,''),a.latitude::text||', '||a.longitude::text),a.directions)));
 update public.customer_orders set payload=payload||jsonb_build_object('destination',jsonb_build_object(
 'latitude',a.latitude,'longitude',a.longitude,'label',a.label,'rider_note',a.directions,'saved_address_id',a.id))
 where id=(result->>'id')::uuid and restaurant_id=p_restaurant_id and customer_user_id=uid;
 if not found then raise exception 'Order ownership mismatch'; end if;
 update public.customer_addresses set last_used_at=clock_timestamp() where id=a.id and restaurant_id=p_restaurant_id and user_id=uid;
 return result;
end $$;
revoke all on function public.oracy_customer_addresses_v2(uuid),public.oracy_save_customer_address_v2(uuid,uuid,text,double precision,double precision,text,text,boolean),public.oracy_create_pin_delivery_order_v1(uuid,uuid,jsonb) from public,anon;
grant execute on function public.oracy_customer_addresses_v2(uuid),public.oracy_save_customer_address_v2(uuid,uuid,text,double precision,double precision,text,text,boolean),public.oracy_create_pin_delivery_order_v1(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
