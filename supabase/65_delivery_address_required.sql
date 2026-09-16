-- Phase 6. Run after 60_customer_saved_addresses.sql.
-- Enforces the same minimum requirement on API inserts, including older clients.
begin;
create or replace function public.require_customer_delivery_address_v1()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.fulfillment_type = 'delivery' and (
    jsonb_typeof(new.payload->'address') is distinct from 'string'
    or length(btrim(coalesce(new.payload->>'address',''))) = 0
  ) then
    raise exception 'Delivery address is required' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists require_customer_delivery_address_v1 on public.customer_orders;
create trigger require_customer_delivery_address_v1 before insert on public.customer_orders
for each row execute function public.require_customer_delivery_address_v1();
revoke all on function public.require_customer_delivery_address_v1() from public, anon, authenticated;
commit;
