-- Morvarid-Farm migration 012 — Advisor Pass-5: re-lock SECURITY DEFINER RPCs
-- recreated by 008/011 (idempotent)
--
-- The offline-sync deploy (008_offline_sync + 011_offline_cache_tables)
-- re-CREATEd seven definer RPCs under NEW signatures. In Postgres, a freshly
-- created function carries the default ACL (EXECUTE to PUBLIC), silently
-- re-exposing them to anon — exactly what advisor passes 3/4 had locked down
-- before (59 security WARNs). This pass re-applies the same policy to the new
-- objects:
--   * REVOKE EXECUTE ... FROM PUBLIC, anon  (fail-closed for anonymous callers;
--     every one of these RPCs is session-gated by design — the SPA always calls
--     them with a logged-in user token, never anon)
--   * GRANT EXECUTE ... TO authenticated, service_role
--   * SET search_path on touch_offline_modified (created bare by 008 §1;
--     closes the last function_search_path_mutable WARN)
--
-- Targets (resolved by name loop over pg_proc, so re-runs are no-ops):
--   rpc_get_or_create_draft_voucher, rpc_upsert_voucher_line, save_daily_sheet,
--   submit_daily_voucher, rpc_create_inventory_txn,
--   rpc_admin_delete_inventory_txn, rpc_admin_update_inventory_txn

BEGIN;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'rpc_get_or_create_draft_voucher',
         'rpc_upsert_voucher_line',
         'save_daily_sheet',
         'submit_daily_voucher',
         'rpc_create_inventory_txn',
         'rpc_admin_delete_inventory_txn',
         'rpc_admin_update_inventory_txn',
         'revert_daily_voucher'
       )
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || rec.sig || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || rec.sig || ' TO authenticated, service_role';
  END LOOP;
END $$;

ALTER FUNCTION public.touch_offline_modified() SET search_path = public;

COMMIT;
