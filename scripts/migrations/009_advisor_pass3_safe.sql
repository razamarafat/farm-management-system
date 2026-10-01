-- Morvarid-Farm migration 009 — Advisor Pass-3 safe hardening (idempotent)
--
-- Hadaf: kam kardan WARN haye Supabase Advisor bedone hich risk baraye RLS ya app.
-- Natijeye audit-e 2026-09-14: 0 ERROR, 92 WARN security + 48 perf (32 INFO).
-- In migration 3 moshkel-e 100% safe ro fix mikone:
--   1. function_search_path_mutable (2x): reporting_consumption_report_v3,
--      reporting_sales_transfers_v3 — SET search_path = public (mesle 015 §6a).
--   2. anon_security_definer_function_executable baraye revert_daily_voucher:
--      REVOKE az anon/PUBLIC, negah dashtan authenticated (frontend az
--      useDailySheet.ts ba session-e login seda mizane; logic-e dakhel-e
--      function ham anon ro rad mikone, pas REVOKE hich flow-e salemi ro
--      nemishkane, vali attack surface ro kam mikone).
--   3. Trigger-only function ha (enforce_packaging_integer_txn,
--      enforce_packaging_integer_voucher_line, enforce_unit_type_consistency):
--      ina faghat az trigger seda mishan (003_triggers.sql), hich RPC-e
--      mostaghim dar src/ nadaran. REVOKE az anon/authenticated/PUBLIC,
--      GRANT faghat be service_role (trigger firing be EXECUTE-e caller
--      niaz nadare — standard Supabase hardening).
--
-- Amdan dast nakhord:
--   - RLS helper ha (is_admin, get_user_role, has_farm_access, ...): baraye
--     arzyabi-e policy be EXECUTE niaz daran; Advisor WARN ghabul shode.
--   - pg_graphql_* (24x): COMMENT '@graphql({"omit": true})' az ghabl hast;
--     Advisor false-positive mide chon GRANT-e PostgREST lazeme. Dast nakhord.
--   - multiple_permissive_policies (16x): 4 table (ALL + SELECT) amdan جدا hastن
--     (operator manage vs broad select); hazf risk-e lockout dare. Dast nakhord.
--   - unused_index (32x INFO): idx_scan=0 (stat reset / low traffic); hazf
--     dobare unindexed-FK miare. Dast nakhord.
--   - auth_leaked_password_protection + bucket listing: toggle-e Studio (dasti).
--
-- Idempotency: hame loop ha rooye pg_proc + REVOKE/GRANT (khodesh idempotent)
--   + ALTER ... SET (khodesh idempotent). Re-apply = no-op.

BEGIN;

-- === 1. search_path hardening baraye 2 reporting function (tamaam overload ha) ===
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('reporting_consumption_report_v3', 'reporting_sales_transfers_v3')
       AND (p.proconfig IS NULL
            OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  LOOP
    EXECUTE 'ALTER FUNCTION ' || rec.sig || ' SET search_path = public';
  END LOOP;
END $$;

-- === 2. revert_daily_voucher: REVOKE az anon/PUBLIC, keep authenticated ===
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'revert_daily_voucher'
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || rec.sig || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || rec.sig || ' TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || rec.sig || ' TO service_role';
  END LOOP;
END $$;

-- === 3. Trigger-only funcs: REVOKE az hame, GRANT faghat service_role ===
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
         'enforce_packaging_integer_txn',
         'enforce_packaging_integer_voucher_line',
         'enforce_unit_type_consistency'
       )
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || rec.sig || ' FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || rec.sig || ' TO service_role';
  END LOOP;
END $$;

COMMIT;
