-- Run after 57. Read-only account API; no POS contracts changed.
begin;
create or replace function public.oracy_customer_orders_v1(p_restaurant_id uuid, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_offset is null or p_offset < 0 or p_offset > 100000 then
    raise exception 'Invalid offset' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(x.value order by x.created_at desc, x.id desc),'[]'::jsonb) into result
  from (
    select o.id, o.created_at, jsonb_build_object(
      'id',o.id,'order_number',o.order_number,'status',o.status,
      'fulfillment_type',o.fulfillment_type,'created_at',o.created_at,'updated_at',o.updated_at,
      'total',o.total,'vat_amount',o.vat_amount,'discount',o.discount,'delivery_fee',o.delivery_fee,
      'items',o.payload->'items','rejection_reason',o.rejection_reason
    ) value
    from public.customer_orders o
    where o.restaurant_id = p_restaurant_id and o.customer_user_id = auth.uid()
    order by o.created_at desc,o.id desc limit 21 offset p_offset
  ) x;
  return result;
end;
$$;
revoke all on function public.oracy_customer_orders_v1(uuid,integer) from public,anon;
grant execute on function public.oracy_customer_orders_v1(uuid,integer) to authenticated;
create or replace function public.oracy_save_customer_profile_v1(
  p_restaurant_id uuid,
  p_full_name text,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  uid uuid := auth.uid();
  normalized_name text := btrim(coalesce(p_full_name, ''));
  normalized_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  verified_phone text;
  saved public.customer_profiles%rowtype;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.restaurants r where r.id = p_restaurant_id and r.is_active) then
    raise exception 'Restaurant is unavailable' using errcode = '22023';
  end if;
  if char_length(normalized_name) not between 2 and 100 then
    raise exception 'Enter your full name' using errcode = '22023';
  end if;
  if normalized_email is not null and (
    char_length(normalized_email) > 160 or
    normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ) then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;

  select case
    when u.phone ~ '^\+[0-9]{9,15}$' then u.phone
    when u.phone ~ '^[0-9]{9,15}$' then '+' || u.phone
    else null
  end into verified_phone
  from auth.users u
  where u.id = uid and u.phone_confirmed_at is not null;

  if verified_phone is null then
    raise exception 'A verified mobile number is required' using errcode = '42501';
  end if;

  insert into public.customer_profiles(restaurant_id, user_id, full_name, phone, email)
  values (p_restaurant_id, uid, normalized_name, verified_phone, normalized_email)
  on conflict (restaurant_id, user_id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    email = excluded.email,
    updated_at = clock_timestamp()
  returning * into saved;

  update public.customer_orders o
  set customer_user_id = uid
  where o.restaurant_id = p_restaurant_id
    and o.customer_user_id is null
    and case
      when regexp_replace(o.customer_phone, '[^0-9]', '', 'g') ~ '^05[0-9]{8}$'
        then '966' || substring(regexp_replace(o.customer_phone, '[^0-9]', '', 'g') from 2)
      when regexp_replace(o.customer_phone, '[^0-9]', '', 'g') ~ '^5[0-9]{8}$'
        then '966' || regexp_replace(o.customer_phone, '[^0-9]', '', 'g')
      when regexp_replace(o.customer_phone, '[^0-9]', '', 'g') ~ '^009665[0-9]{8}$'
        then substring(regexp_replace(o.customer_phone, '[^0-9]', '', 'g') from 3)
      else regexp_replace(o.customer_phone, '[^0-9]', '', 'g')
    end = regexp_replace(verified_phone, '[^0-9]', '', 'g');

  return jsonb_build_object(
    'id', saved.id,
    'restaurant_id', saved.restaurant_id,
    'user_id', saved.user_id,
    'full_name', saved.full_name,
    'phone', saved.phone,
    'email', saved.email,
    'created_at', saved.created_at,
    'updated_at', saved.updated_at
  );
end;
$fn$;

revoke all on function public.oracy_save_customer_profile_v1(uuid,text,text) from public, anon;
grant execute on function public.oracy_save_customer_profile_v1(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
