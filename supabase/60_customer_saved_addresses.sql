-- Authenticated, tenant-scoped saved addresses. Run after 59.
begin;
create table if not exists public.customer_addresses(
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 address_type text not null check(address_type in('home','work','other')),
 area text not null check(char_length(area) between 2 and 100), street text not null check(char_length(street) between 2 and 160),
 building text not null check(char_length(building) between 1 and 60), unit text check(unit is null or char_length(unit)<=60),
 directions text check(directions is null or char_length(directions)<=300), is_default boolean not null default false,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create index if not exists customer_addresses_owner_idx on public.customer_addresses(restaurant_id,user_id,updated_at desc);
create unique index if not exists customer_addresses_one_default_idx on public.customer_addresses(restaurant_id,user_id) where is_default;
alter table public.customer_addresses enable row level security;
revoke all on public.customer_addresses from public,anon,authenticated;

create or replace function public.oracy_customer_addresses_v1(p_restaurant_id uuid) returns jsonb
language plpgsql security definer set search_path='' stable as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'address_type',a.address_type,'area',a.area,'street',a.street,
  'building',a.building,'unit',a.unit,'directions',a.directions,'is_default',a.is_default) order by a.is_default desc,a.updated_at desc),'[]'::jsonb)
 into result from public.customer_addresses a where a.restaurant_id=p_restaurant_id and a.user_id=uid;
 return result;
end $$;

create or replace function public.oracy_save_customer_address_v1(p_restaurant_id uuid,p_address_id uuid,p_address_type text,p_area text,p_street text,p_building text,p_unit text default null,p_directions text default null,p_make_default boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); aid uuid:=coalesce(p_address_id,gen_random_uuid()); make_default boolean; saved public.customer_addresses%rowtype;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not exists(select 1 from public.restaurants r where r.id=p_restaurant_id and r.is_active) then raise exception 'Restaurant is unavailable'; end if;
 if p_address_type not in('home','work','other') or char_length(btrim(coalesce(p_area,''))) not between 2 and 100
  or char_length(btrim(coalesce(p_street,''))) not between 2 and 160 or char_length(btrim(coalesce(p_building,''))) not between 1 and 60
  or char_length(btrim(coalesce(p_unit,'')))>60 or char_length(btrim(coalesce(p_directions,'')))>300 then raise exception 'Invalid address'; end if;
 if p_address_id is null and (select count(*) from public.customer_addresses where restaurant_id=p_restaurant_id and user_id=uid)>=10 then raise exception 'Maximum 10 addresses allowed'; end if;
 if p_address_id is not null and not exists(select 1 from public.customer_addresses where id=p_address_id and restaurant_id=p_restaurant_id and user_id=uid) then raise exception 'Address not found' using errcode='P0002'; end if;
 make_default:=coalesce(p_make_default,false) or not exists(select 1 from public.customer_addresses where restaurant_id=p_restaurant_id and user_id=uid);
 if make_default then update public.customer_addresses set is_default=false,updated_at=clock_timestamp() where restaurant_id=p_restaurant_id and user_id=uid and is_default; end if;
 insert into public.customer_addresses(id,restaurant_id,user_id,address_type,area,street,building,unit,directions,is_default)
 values(aid,p_restaurant_id,uid,p_address_type,btrim(p_area),btrim(p_street),btrim(p_building),nullif(btrim(coalesce(p_unit,'')),''),nullif(btrim(coalesce(p_directions,'')),''),make_default)
 on conflict(id) do update set address_type=excluded.address_type,area=excluded.area,street=excluded.street,building=excluded.building,
  unit=excluded.unit,directions=excluded.directions,is_default=case when make_default then true else public.customer_addresses.is_default end,updated_at=clock_timestamp()
 where public.customer_addresses.restaurant_id=p_restaurant_id and public.customer_addresses.user_id=uid returning * into saved;
 if saved.id is null then raise exception 'Address not found' using errcode='P0002'; end if;
 return jsonb_build_object('id',saved.id,'is_default',saved.is_default);
end $$;

create or replace function public.oracy_set_default_customer_address_v1(p_restaurant_id uuid,p_address_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); begin if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not exists(select 1 from public.customer_addresses where id=p_address_id and restaurant_id=p_restaurant_id and user_id=uid) then raise exception 'Address not found'; end if;
 update public.customer_addresses set is_default=false where restaurant_id=p_restaurant_id and user_id=uid and is_default;
 update public.customer_addresses set is_default=true,updated_at=clock_timestamp() where id=p_address_id and restaurant_id=p_restaurant_id and user_id=uid; end $$;
create or replace function public.oracy_delete_customer_address_v1(p_restaurant_id uuid,p_address_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); was_default boolean; begin if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 delete from public.customer_addresses where id=p_address_id and restaurant_id=p_restaurant_id and user_id=uid returning is_default into was_default;
 if was_default is null then raise exception 'Address not found'; end if;
 if was_default then update public.customer_addresses set is_default=true,updated_at=clock_timestamp() where id=(select id from public.customer_addresses where restaurant_id=p_restaurant_id and user_id=uid order by updated_at desc limit 1); end if; end $$;

revoke all on function public.oracy_customer_addresses_v1(uuid) from public,anon;
revoke all on function public.oracy_save_customer_address_v1(uuid,uuid,text,text,text,text,text,text,boolean) from public,anon;
revoke all on function public.oracy_set_default_customer_address_v1(uuid,uuid) from public,anon;
revoke all on function public.oracy_delete_customer_address_v1(uuid,uuid) from public,anon;
grant execute on function public.oracy_customer_addresses_v1(uuid),public.oracy_save_customer_address_v1(uuid,uuid,text,text,text,text,text,text,boolean),public.oracy_set_default_customer_address_v1(uuid,uuid),public.oracy_delete_customer_address_v1(uuid,uuid) to authenticated;
notify pgrst,'reload schema'; commit;
