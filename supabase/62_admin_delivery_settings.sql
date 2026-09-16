-- Admin configuration only. Does NOT enable customer delivery checkout.
-- Requires existing branches/staff_memberships (existing Admin schema).
begin;
create table if not exists public.branch_delivery_settings (
 branch_id uuid primary key references public.branches(id),
 restaurant_id uuid not null references public.restaurants(id),
 version integer not null default 1,
 config jsonb not null,
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.branch_delivery_settings_audit (
 id bigint generated always as identity primary key,
 branch_id uuid not null references public.branches(id),
 version integer not null, config jsonb not null,
 actor_user_id uuid not null, created_at timestamptz not null default clock_timestamp()
);
alter table public.branch_delivery_settings enable row level security;
alter table public.branch_delivery_settings_audit enable row level security;
revoke all on public.branch_delivery_settings,public.branch_delivery_settings_audit from public,anon,authenticated;
revoke all on sequence public.branch_delivery_settings_audit_id_seq from public,anon,authenticated;

create or replace function public.oracy_delivery_admin_branch(p_branch_id uuid) returns uuid
language plpgsql security definer set search_path='' stable as $$
declare rid uuid;
begin
 select b.restaurant_id into rid from public.branches b where b.id=p_branch_id and exists (
  select 1 from public.staff_memberships sm where sm.user_id=auth.uid() and sm.restaurant_id=b.restaurant_id
  and sm.is_active and sm.role in ('owner','admin','manager') and (sm.branch_id is null or sm.branch_id=b.id));
 if rid is null then raise exception 'Manager access required' using errcode='42501'; end if;
 return rid;
end $$;

-- A simple non-crossing polygon in local latitude/longitude coordinates.
-- Bounds are limited to the operating region to exclude antimeridian ambiguity.
create or replace function public.oracy_delivery_polygon(p_vertices jsonb) returns polygon
language plpgsql immutable set search_path='' as $$
declare n integer; i integer; j integer; pts point[]:='{}'; v jsonb; x float8; y float8; shape polygon; twice_area float8:=0;
begin
 if jsonb_typeof(p_vertices) is distinct from 'array' then raise exception 'Boundary must be a list of points'; end if;
 n:=jsonb_array_length(p_vertices);
 if n<3 or n>60 then raise exception 'Draw 3 to 60 boundary points'; end if;
 for v in select value from jsonb_array_elements(p_vertices) loop
  if jsonb_typeof(v->'lat') is distinct from 'number' or jsonb_typeof(v->'lng') is distinct from 'number' then raise exception 'Invalid map coordinates'; end if;
  x:=(v->>'lng')::float8; y:=(v->>'lat')::float8;
  if not (x between 34 and 56 and y between 16 and 33) then raise exception 'Boundary must be within the supported Saudi region'; end if;
  if point(x,y) ~= any(pts) then raise exception 'Duplicate boundary point'; end if;
  pts:=array_append(pts,point(x,y));
 end loop;
 for i in 1..n loop
  for j in i+1..n loop
   if j=i+1 or (i=1 and j=n) then continue; end if;
   if lseg(pts[i],pts[(i % n)+1]) ?# lseg(pts[j],pts[(j % n)+1]) then raise exception 'Boundary crosses itself; move or remove a point'; end if;
  end loop;
 end loop;
 select ('('||string_agg(p::text,',')||')')::polygon into shape from unnest(pts) p;
 for i in 1..n loop
  j:=(i % n)+1;
  twice_area:=twice_area+(pts[i])[0]*(pts[j])[1]-(pts[j])[0]*(pts[i])[1];
 end loop;
 if abs(twice_area)/2<0.000000001 then raise exception 'Boundary area is too small'; end if;
 return shape;
end $$;

create or replace function public.oracy_validate_delivery_config(c jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare z jsonb; t jsonb; radius numeric; last_max numeric:=0; ids text[]:='{}'; f text;
begin
 if jsonb_typeof(c) is distinct from 'object' or pg_column_size(c)>100000 then raise exception 'Invalid delivery settings'; end if;
 if jsonb_typeof(c->'enabled') is distinct from 'boolean' or c->>'distance_metric' is distinct from 'radius' then raise exception 'Delivery enabled and radius metric are required'; end if;
 if jsonb_typeof(c->'latitude') is distinct from 'number' or jsonb_typeof(c->'longitude') is distinct from 'number'
 or not ((c->>'latitude')::numeric between 16 and 33) or not ((c->>'longitude')::numeric between 34 and 56) then raise exception 'Invalid restaurant pin'; end if;
 if jsonb_typeof(c->'max_radius_km') is distinct from 'number' then raise exception 'Radius required'; end if;
 radius:=(c->>'max_radius_km')::numeric;
 if not(radius>0 and radius<=30) then raise exception 'Radius must be above 0 and at most 30 km'; end if;
 if jsonb_typeof(c->'zones') is distinct from 'array' or jsonb_array_length(c->'zones')>20 then raise exception 'Maximum 20 zones'; end if;
 for z in select value from jsonb_array_elements(c->'zones') loop
  if coalesce(z->>'id','') !~ '^[a-zA-Z0-9_-]{1,50}$' or z->>'id'=any(ids) then raise exception 'Zone IDs must be unique'; end if;
  ids:=array_append(ids,z->>'id');
  if char_length(btrim(coalesce(z->>'name',''))) not between 1 and 80 or jsonb_typeof(z->'enabled') is distinct from 'boolean'
   or coalesce(z->>'color','') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid zone name, color or enabled value'; end if;
  if jsonb_typeof(z->'vertices') is distinct from 'array' then raise exception 'Invalid boundary'; end if;
  if (z->>'enabled')::boolean or jsonb_array_length(z->'vertices')>0 then perform public.oracy_delivery_polygon(z->'vertices'); end if;
  foreach f in array array['fee','free_at'] loop
   if jsonb_typeof(z->f) is distinct from 'number' or not ((z->>f)::numeric between 0 and 10000)
    or round((z->>f)::numeric,2)<>(z->>f)::numeric then raise exception 'Fees and thresholds must be valid SAR amounts (2 decimal places)'; end if;
  end loop;
 end loop;
 if jsonb_typeof(c->'tiers') is distinct from 'array' or jsonb_array_length(c->'tiers') not between 1 and 10 then raise exception 'Add 1 to 10 distance tiers'; end if;
 for t in select value from jsonb_array_elements(c->'tiers') loop
  if jsonb_typeof(t->'max_km') is distinct from 'number' or (t->>'max_km')::numeric<=last_max or (t->>'max_km')::numeric>radius then raise exception 'Distance tiers must increase and fit the radius'; end if;
  last_max:=(t->>'max_km')::numeric;
  foreach f in array array['fee','free_at'] loop
   if jsonb_typeof(t->f) is distinct from 'number' or not ((t->>f)::numeric between 0 and 10000)
    or round((t->>f)::numeric,2)<>(t->>f)::numeric then raise exception 'Invalid tier fee or free threshold'; end if;
  end loop;
 end loop;
 if last_max<>radius then raise exception 'Last tier must cover the full radius'; end if;
 if c->>'outside_action' is distinct from 'inquiry' then raise exception 'Outside coverage must use manual inquiry'; end if;
end $$;

create or replace function public.oracy_admin_delivery_settings_v1(p_branch_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.oracy_delivery_admin_branch(p_branch_id);
 select jsonb_build_object('version',version,'config',config,'updated_at',updated_at) into result
 from public.branch_delivery_settings where branch_id=p_branch_id;
 return coalesce(result,jsonb_build_object('version',0,'config',null));
end $$;

create or replace function public.oracy_save_admin_delivery_settings_v1(p_branch_id uuid,p_expected_version integer,p_config jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rid uuid; current_version integer; saved public.branch_delivery_settings%rowtype;
begin
 rid:=public.oracy_delivery_admin_branch(p_branch_id);
 perform pg_advisory_xact_lock(hashtextextended('delivery-settings:'||p_branch_id::text,0));
 select version into current_version from public.branch_delivery_settings where branch_id=p_branch_id for update;
 if p_expected_version is distinct from coalesce(current_version,0) then raise exception 'Settings changed in another session. Reload before saving.' using errcode='40001'; end if;
 perform public.oracy_validate_delivery_config(p_config);
 insert into public.branch_delivery_settings(branch_id,restaurant_id,version,config,updated_by)
 values(p_branch_id,rid,1,p_config,auth.uid())
 on conflict(branch_id) do update set config=excluded.config,version=public.branch_delivery_settings.version+1,updated_by=auth.uid(),updated_at=clock_timestamp()
 returning * into saved;
 insert into public.branch_delivery_settings_audit(branch_id,version,config,actor_user_id) values(p_branch_id,saved.version,saved.config,auth.uid());
 return jsonb_build_object('version',saved.version,'config',saved.config,'updated_at',saved.updated_at);
end $$;

create or replace function public.oracy_admin_preview_delivery_v1(p_branch_id uuid,p_latitude float8,p_longitude float8,p_food_subtotal numeric) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c jsonb; ver integer; d float8; rule jsonb; zone_name text; fee numeric; h float8;
begin
 perform public.oracy_delivery_admin_branch(p_branch_id);
 if p_latitude is null or p_longitude is null or not(p_latitude between -90 and 90) or not(p_longitude between -180 and 180)
 or p_food_subtotal is null or not(p_food_subtotal between 0 and 1000000) then raise exception 'Invalid test location or subtotal'; end if;
 select config,version into c,ver from public.branch_delivery_settings where branch_id=p_branch_id;
 if c is null then raise exception 'Save settings first'; end if;
 if not (c->>'enabled')::boolean then return jsonb_build_object('eligible',false,'reason','Delivery is switched off','version',ver); end if;
 h:=power(sin(radians(p_latitude-(c->>'latitude')::float8)/2),2)+cos(radians(p_latitude))*cos(radians((c->>'latitude')::float8))*power(sin(radians(p_longitude-(c->>'longitude')::float8)/2),2);
 d:=6371.0088*2*asin(sqrt(least(1,greatest(0,h))));
 -- Priority: coverage radius, then first enabled polygon, then distance tiers.
 if d>(c->>'max_radius_km')::float8+0.000000001 then return jsonb_build_object('eligible',false,'reason','Outside coverage — call restaurant','distance_km',d,'version',ver); end if;
 for rule in select value from jsonb_array_elements(c->'zones') loop
  if (rule->>'enabled')::boolean then
   if point(p_longitude,p_latitude)<@public.oracy_delivery_polygon(rule->'vertices') then zone_name:=rule->>'name'; exit; end if;
  end if;
 end loop;
 if zone_name is null then
  rule:=null;
  select value into rule from jsonb_array_elements(c->'tiers') where d<=(value->>'max_km')::float8+0.000000001 order by (value->>'max_km')::numeric limit 1;
  zone_name:='Distance tier';
 end if;
 if rule is null then raise exception 'Distance tier missing'; end if;
 fee:=case when p_food_subtotal>=(rule->>'free_at')::numeric then 0 else (rule->>'fee')::numeric end;
 return jsonb_build_object('eligible',true,'zone',zone_name,'fee',fee,'free_at',(rule->>'free_at')::numeric,'distance_km',d,'distance_metric','radius','version',ver,'preview_only',true);
end $$;

revoke all on function public.oracy_delivery_admin_branch(uuid),public.oracy_delivery_polygon(jsonb),public.oracy_validate_delivery_config(jsonb) from public,anon,authenticated;
revoke all on function public.oracy_admin_delivery_settings_v1(uuid),public.oracy_save_admin_delivery_settings_v1(uuid,integer,jsonb),public.oracy_admin_preview_delivery_v1(uuid,float8,float8,numeric) from public,anon;
grant execute on function public.oracy_admin_delivery_settings_v1(uuid),public.oracy_save_admin_delivery_settings_v1(uuid,integer,jsonb),public.oracy_admin_preview_delivery_v1(uuid,float8,float8,numeric) to authenticated;
notify pgrst,'reload schema';
commit;
