-- Run after 62. Both results should be true. Does not create orders.
select
 to_regprocedure('public.require_customer_delivery_address_v1()') is not null as delivery_guard_exists,
 exists(select 1 from pg_trigger where tgrelid='public.customer_orders'::regclass
 and tgname='require_customer_delivery_address_v1' and tgenabled='O' and not tgisinternal) as delivery_guard_enabled;
