-- Run after 66. One row with all TRUE is PASS.
select
 to_regprocedure('public.oracy_customer_delivery_quote_v1(uuid,uuid,uuid,timestamp with time zone,numeric)') is not null as quote_api_ready,
 to_regprocedure('public.oracy_create_pin_delivery_order_v2(uuid,uuid,jsonb)') is not null as order_api_ready,
 has_function_privilege('authenticated','public.oracy_customer_delivery_quote_v1(uuid,uuid,uuid,timestamp with time zone,numeric)','EXECUTE') as authenticated_quote_allowed,
 not has_function_privilege('anon','public.oracy_customer_delivery_quote_v1(uuid,uuid,uuid,timestamp with time zone,numeric)','EXECUTE') as anon_quote_blocked,
 has_function_privilege('authenticated','public.oracy_create_pin_delivery_order_v2(uuid,uuid,jsonb)','EXECUTE') as authenticated_order_allowed,
 not has_function_privilege('anon','public.oracy_create_pin_delivery_order_v2(uuid,uuid,jsonb)','EXECUTE') as anon_order_blocked,
 not has_table_privilege('authenticated','public.branch_delivery_settings','SELECT') as settings_table_private;
