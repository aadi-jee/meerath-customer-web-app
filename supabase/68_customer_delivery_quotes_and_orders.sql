-- Customer delivery release: authoritative quote + final server-priced order.
-- Requires 24, 54, 60, 64 and 65.
begin;

-- Keep the existing item-pricing implementation private. Legacy callers may
-- still place pickup/dine-in orders, but delivery must use the checked API.
do $$ begin
 if to_regprocedure('public.oracy_create_customer_order_core_v1(uuid,uuid,jsonb)') is null then
  alter function public.oracy_create_customer_order_v1(uuid,uuid,jsonb) rename to oracy_create_customer_order_core_v1;
 end if;
end $$;
revoke all on function public.oracy_create_customer_order_core_v1(uuid,uuid,jsonb) from public,anon,authenticated;
create or replace function public.oracy_create_customer_order_v1(p_restaurant_id uuid,p_branch_id uuid,p_order jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_order->>'fulfillment_type'='delivery' then raise exception 'Please update the app and confirm your delivery location'; end if;
 return public.oracy_create_customer_order_core_v1(p_restaurant_id,p_branch_id,p_order);
end $$;
revoke all on function public.oracy_create_customer_order_v1(uuid,uuid,jsonb) from public;
grant execute on function public.oracy_create_customer_order_v1(uuid,uuid,jsonb) to anon,authenticated;

create or replace function public.oracy_delivery_quote_internal_v1(
  p_restaurant_id uuid, p_branch_id uuid, p_latitude float8,
  p_longitude float8, p_food_subtotal numeric
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c jsonb; ver integer; d float8; rule jsonb; rule_name text; rule_id text; fee numeric; h float8;
begin
 if p_food_subtotal is null or p_food_subtotal<0 or p_food_subtotal>1000000
    or p_latitude is null or not(p_latitude between -90 and 90)
    or p_longitude is null or not(p_longitude between -180 and 180) then
   raise exception 'Invalid delivery quote request';
 end if;
 if not exists(select 1 from public.branches b where b.id=p_branch_id and b.restaurant_id=p_restaurant_id and b.is_active) then
   raise exception 'Branch is unavailable';
 end if;
 select s.config,s.version into c,ver from public.branch_delivery_settings s
 where s.branch_id=p_branch_id and s.restaurant_id=p_restaurant_id;
 if c is null or not coalesce((c->>'enabled')::boolean,false) then
   return jsonb_build_object('eligible',false,'reason','Delivery is temporarily unavailable','version',coalesce(ver,0));
 end if;
 h:=power(sin(radians(p_latitude-(c->>'latitude')::float8)/2),2)
   +cos(radians(p_latitude))*cos(radians((c->>'latitude')::float8))
   *power(sin(radians(p_longitude-(c->>'longitude')::float8)/2),2);
 d:=6371.0088*2*asin(sqrt(least(1,greatest(0,h))));
 if d>(c->>'max_radius_km')::float8+0.000000001 then
   return jsonb_build_object('eligible',false,'reason','Outside delivery area — please call the restaurant','distance_km',round(d::numeric,3),'version',ver);
 end if;
 for rule in select value from jsonb_array_elements(c->'zones') loop
   if coalesce((rule->>'enabled')::boolean,false) then
     if point(p_longitude,p_latitude)<@public.oracy_delivery_polygon(rule->'vertices') then
       rule_name:=rule->>'name'; rule_id:=rule->>'id'; exit;
     end if;
   end if;
 end loop;
 if rule_name is null then
   rule:=null;
   select value into rule from jsonb_array_elements(c->'tiers')
   where d<=(value->>'max_km')::float8+0.000000001
   order by (value->>'max_km')::numeric limit 1;
   rule_name:=coalesce(rule->>'name','Distance tier');
   rule_id:=coalesce(rule->>'id','radius-'||(rule->>'max_km'));
 end if;
 if rule is null then raise exception 'Delivery distance tier is missing'; end if;
 fee:=case when p_food_subtotal>=(rule->>'free_at')::numeric then 0 else (rule->>'fee')::numeric end;
 return jsonb_build_object(
   'eligible',true,'rule_id',rule_id,'zone',rule_name,'fee',round(fee,2),
   'free_at',round((rule->>'free_at')::numeric,2),'food_subtotal',round(p_food_subtotal,2),
   'distance_km',round(d::numeric,3),'distance_metric','radius','version',ver
 );
end $$;

create or replace function public.oracy_customer_delivery_quote_v1(
 p_restaurant_id uuid,p_branch_id uuid,p_address_id uuid,p_address_version timestamptz,p_food_subtotal numeric
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); a public.customer_addresses%rowtype;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into a from public.customer_addresses where id=p_address_id and restaurant_id=p_restaurant_id and user_id=uid;
 if not found or a.latitude is null or a.longitude is null then raise exception 'Confirm a saved map location'; end if;
 if a.updated_at is distinct from p_address_version then raise exception 'Location changed. Confirm it again.'; end if;
 return public.oracy_delivery_quote_internal_v1(p_restaurant_id,p_branch_id,a.latitude,a.longitude,p_food_subtotal);
end $$;

create or replace function public.oracy_create_pin_delivery_order_v2(p_restaurant_id uuid,p_branch_id uuid,p_order jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); a public.customer_addresses%rowtype; result jsonb; existing public.customer_orders%rowtype;
 cid uuid; placed public.customer_orders%rowtype; quote jsonb; food numeric; fee numeric;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_order->>'fulfillment_type' is distinct from 'delivery' then raise exception 'Delivery order required'; end if;
 begin cid:=(p_order->>'client_order_id')::uuid; exception when others then raise exception 'Invalid order reference'; end;
 if cid is null then raise exception 'Invalid order reference'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(cid::text,0));
 select * into existing from public.customer_orders where client_order_id=cid;
 if found then
   if existing.customer_user_id is distinct from uid or existing.restaurant_id is distinct from p_restaurant_id or existing.branch_id is distinct from p_branch_id then
     raise exception 'Order not found' using errcode='42501';
   end if;
   return jsonb_build_object('id',existing.id,'order_number',existing.order_number,'tracking_token',existing.tracking_token,
     'status',existing.status,'total',existing.total,'delivery_fee',existing.delivery_fee,
     'delivery_quote',existing.payload->'delivery_quote','created_at',existing.created_at,'duplicate',true);
 end if;
 select * into a from public.customer_addresses
 where id=(p_order->>'delivery_address_id')::uuid and user_id=uid and restaurant_id=p_restaurant_id for update;
 if not found or a.latitude is null or a.longitude is null then raise exception 'Confirm a saved map location'; end if;
 if a.updated_at is distinct from (p_order->>'delivery_address_version')::timestamptz then raise exception 'Location changed. Confirm it again.'; end if;
 result:=public.oracy_create_customer_order_core_v1(p_restaurant_id,p_branch_id,p_order||jsonb_build_object(
   'address',concat_ws(' · ',coalesce(nullif(a.label,''),a.latitude::text||', '||a.longitude::text),a.directions)));
 select * into placed from public.customer_orders where id=(result->>'id')::uuid
   and restaurant_id=p_restaurant_id and customer_user_id=uid for update;
 if not found then raise exception 'Order ownership mismatch'; end if;
 food:=round(greatest(0,placed.items_total-placed.discount),2);
 quote:=public.oracy_delivery_quote_internal_v1(p_restaurant_id,p_branch_id,a.latitude,a.longitude,food);
 if not coalesce((quote->>'eligible')::boolean,false) then raise exception '%',coalesce(quote->>'reason','Delivery is unavailable'); end if;
 fee:=(quote->>'fee')::numeric;
 if (p_order->>'expected_delivery_fee')::numeric is distinct from fee then
   raise exception 'Delivery fee changed. Review the updated fee and place your order again.';
 end if;
 update public.customer_orders set delivery_fee=fee,total=round(food+fee,2),vat_amount=round((food+fee)*15/115,2),
   payload=payload||jsonb_build_object(
     'destination',jsonb_build_object('latitude',a.latitude,'longitude',a.longitude,'label',a.label,
       'rider_note',a.directions,'saved_address_id',a.id),
     'delivery_quote',quote)
 where id=placed.id returning * into placed;
 update public.customer_addresses set last_used_at=clock_timestamp() where id=a.id and restaurant_id=p_restaurant_id and user_id=uid;
 return jsonb_build_object('id',placed.id,'order_number',placed.order_number,'tracking_token',placed.tracking_token,
   'status',placed.status,'total',placed.total,'delivery_fee',placed.delivery_fee,'delivery_quote',quote,
   'created_at',placed.created_at,'duplicate',false);
end $$;

revoke all on function public.oracy_delivery_quote_internal_v1(uuid,uuid,float8,float8,numeric) from public,anon,authenticated;
revoke all on function public.oracy_customer_delivery_quote_v1(uuid,uuid,uuid,timestamptz,numeric),public.oracy_create_pin_delivery_order_v2(uuid,uuid,jsonb) from public,anon;
grant execute on function public.oracy_customer_delivery_quote_v1(uuid,uuid,uuid,timestamptz,numeric),public.oracy_create_pin_delivery_order_v2(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
