-- Read-only checks. All should be true.
select
 to_regprocedure('public.oracy_customer_orders_v1(uuid,integer)') is not null as account_orders_api,
 not has_function_privilege('anon','public.oracy_customer_orders_v1(uuid,integer)','EXECUTE') as anon_blocked,
 has_function_privilege('authenticated','public.oracy_customer_orders_v1(uuid,integer)','EXECUTE') as account_access,
 (select relrowsecurity from pg_class where oid='public.customer_orders'::regclass) as orders_rls_enabled,
 not has_table_privilege('anon','public.customer_orders','SELECT') as anon_table_blocked;
