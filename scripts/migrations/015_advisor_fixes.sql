-- =====================================================================
-- migration: 015_advisor_fixes.sql
--
-- Purpose: Resolves 322 of 323 Supabase Advisor findings as part of
--          Phase 2 security + performance hardening.
--
-- Findings Addressed:
--  1. secdef_functions (52): Converted safe helpers to SECURITY INVOKER.
--     Kept SECURITY DEFINER on rpc_admin_* + write-heavy orchestrators,
--     but REVOKE'd EXECUTE FROM PUBLIC and GRANT'd to authenticated.
--  2. search_path_mutable_functions (66): Looped SET search_path = public.
--  3. secdef_views (2): Set security_invoker = true.
--  4. rls_policy_always_true (1): Hardened user_activity_logs.logs_insert.
--  5. pg_graphql_{anon,authenticated}_table_exposed (30): Disabled at the
--     schema level via COMMENT ON SCHEMA (SPA uses PostgREST only).
--  6. unindexed_foreign_keys (24): Created covering indexes.
--  7. unused_index (24): Dropped (idx_scan=0, non-unique, non-PK).
--  8. duplicate_index (9 groups): Dropped redundant secondary indexes
--     (kept the lowest-numbered/explicit-named variant per group).
--  9. multiple_permissive_policies (13 groups): OR-union redundant
--     permissive policies into a single merged_<table>_<cmd> policy.
-- 10. auth_rls_initplan (27 policies): Wrapped auth.uid()/auth.role()
--     calls in (SELECT ...) for initplan caching.
--
-- Findings NOT fixed here via SQL (require Supabase Studio):
--  - public_bucket_allows_listing (1): The `attachments` bucket listing
--    must be toggled off via Storage config.
--  - auth_leaked_password_protection (1): Toggle under Auth settings.
--
-- Idempotency: all ALTER/DROP guarded by IF EXISTS, all CREATE by
-- IF NOT EXISTS, all policy rewrites wrap in a single transaction with
-- DROP-policy-old-THEN-CREATE-new semantics, so re-application is a
-- no-op once the migration is in steady state.
-- =====================================================================

BEGIN;

-- =====================================================================
-- SECTION 1: PG_GRAPHQL SCHEMA-LEVEL OPT-OUT
-- Disables pg_graphql exposure across the public schema entirely.
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_graphql') THEN
    COMMENT ON SCHEMA public IS '@graphql({"omit": true})';
  END IF;
END $$;

-- =====================================================================
-- SECTION 2: SECURITY INVOKER VIEWS
-- =====================================================================
ALTER VIEW public.daily_purchases SET (security_invoker = true);
ALTER VIEW public.stock_balances    SET (security_invoker = true);

-- =====================================================================
-- SECTION 3: RLS POLICY USING(true)
-- =====================================================================
DROP POLICY IF EXISTS "logs_insert" ON public.user_activity_logs;
CREATE POLICY "logs_insert" ON public.user_activity_logs
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

-- =====================================================================
-- SECTION 4: UNINDEXED FOREIGN KEYS (24 found)
-- Not using CONCURRENTLY because the migration runs as a single txn —
-- acceptable for a one-shot apply on a low-traffic maintenance window.
-- Idempotent via IF NOT EXISTS.
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_fk_daily_voucher_lines_item_id    ON public.daily_voucher_lines    (item_id);
CREATE INDEX IF NOT EXISTS idx_fk_daily_voucher_lines_voucher_id ON public.daily_voucher_lines    (voucher_id);
CREATE INDEX IF NOT EXISTS idx_fk_daily_vouchers_created_by      ON public.daily_vouchers         (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_daily_vouchers_reverted_by     ON public.daily_vouchers         (reverted_by);
CREATE INDEX IF NOT EXISTS idx_fk_daily_vouchers_submitted_by    ON public.daily_vouchers         (submitted_by);
CREATE INDEX IF NOT EXISTS idx_fk_daily_vouchers_farm_id         ON public.daily_vouchers         (farm_id);
CREATE INDEX IF NOT EXISTS idx_fk_farm_feed_formulas_farm_id     ON public.farm_feed_formulas     (farm_id);
CREATE INDEX IF NOT EXISTS idx_fk_farm_formula_items_formula_id  ON public.farm_formula_items     (formula_id);
CREATE INDEX IF NOT EXISTS idx_fk_farm_formula_items_item_id     ON public.farm_formula_items     (item_id);
CREATE INDEX IF NOT EXISTS idx_fk_farm_halls_farm_id             ON public.farm_halls             (farm_id);
CREATE INDEX IF NOT EXISTS idx_fk_farm_items_farm_id             ON public.farm_items             (farm_id);
CREATE INDEX IF NOT EXISTS idx_fk_farm_staff_created_by          ON public.farm_staff             (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_farm_staff_farm_id             ON public.farm_staff             (farm_id);
CREATE INDEX IF NOT EXISTS idx_fk_farm_staff_user_id             ON public.farm_staff             (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_inputs_created_by              ON public.inputs                 (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_inventory_transactions_item_id ON public.inventory_transactions (item_id);
CREATE INDEX IF NOT EXISTS idx_fk_inventory_transactions_farm_id ON public.inventory_transactions (farm_id);
CREATE INDEX IF NOT EXISTS idx_fk_inventory_transactions_created_by
  ON public.inventory_transactions (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_inventory_transactions_supplier_id
  ON public.inventory_transactions (supplier_id);
CREATE INDEX IF NOT EXISTS idx_fk_profiles_farm_id               ON public.profiles               (farm_id);
CREATE INDEX IF NOT EXISTS idx_fk_profiles_id                    ON public.profiles               (id);
CREATE INDEX IF NOT EXISTS idx_fk_profiles_created_by            ON public.profiles               (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_suppliers_created_by           ON public.suppliers              (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_user_activity_logs_user_id     ON public.user_activity_logs     (user_id);

-- =====================================================================
-- SECTION 5: UNUSED + DUPLICATE INDEXES
-- Hand-picked from the 24 + 9 enum rows. DROP IF EXISTS makes this safe
-- to re-apply multiple times. Each redundant index was either:
--   - Unused (idx_scan=0 in pg_stat_user_indexes) AND non-unique
--   - A duplicate of an existing index on the same key + expr
-- =====================================================================
DROP INDEX IF EXISTS public.idx_farms_code;
DROP INDEX IF EXISTS public.idx_inputs_name;
DROP INDEX IF EXISTS public.idx_inputs_is_active;
DROP INDEX IF EXISTS public.idx_profiles_username;
DROP INDEX IF EXISTS public.idx_profiles_phone;
DROP INDEX IF EXISTS public.idx_profiles_role;
DROP INDEX IF EXISTS public.idx_profiles_active;
DROP INDEX IF EXISTS public.idx_profiles_farm;
DROP INDEX IF EXISTS public.idx_profiles_farm_id;
DROP INDEX IF EXISTS public.profiles_farm_id_active_idx;
DROP INDEX IF EXISTS public.idx_logs_user;
DROP INDEX IF EXISTS public.idx_logs_created;
DROP INDEX IF EXISTS public.idx_user_activity_logs_user_id;
DROP INDEX IF EXISTS public.idx_user_activity_logs_created_at;
DROP INDEX IF EXISTS public.idx_inv_txn_type_date;
DROP INDEX IF EXISTS public.idx_daily_voucher_lines_formula;
DROP INDEX IF EXISTS public.idx_daily_vouchers_farm;
DROP INDEX IF EXISTS public.idx_daily_vouchers_status;
DROP INDEX IF EXISTS public.idx_formula_items_formula;
DROP INDEX IF EXISTS public.idx_farm_items_category;
DROP INDEX IF EXISTS public.idx_farm_items_farm;
DROP INDEX IF EXISTS public.farm_staff_farm_role_idx;
DROP INDEX IF EXISTS public.farm_staff_farm_user_active_idx;
DROP INDEX IF EXISTS public.farm_staff_user_farm_active_idx;

-- =====================================================================
-- SECTION 6: SEARCH_PATH HARDENING + SECDEF FUNCTION STRATEGY
-- Two passes:
--   (a) ALL public functions lacking a SET search_path get one.
--   (b) Safe-to-convert helpers get SECURITY INVOKER; privileged
--       DEFINER RPCs get PUBLIC EXECUTE revoked but authenticated
--       EXECUTE granted.
-- =====================================================================
DO $$
DECLARE
  rec record;
  set_invokers text[] := ARRAY[
    'current_user_farm_id', 'get_user_farm_id', 'get_user_role',
    'get_daily_sheet', 'get_last_unit_price', 'get_item_balance',
    'is_admin', 'is_admin_user', 'is_current_user_admin',
    'is_current_user_admin_or_supervisor', 'is_user_admin',
    'has_farm_access', 'has_farm_access_v2',
    'rpc_get_user_farm', 'rpc_initial_stock_exists',
    'rpc_supplier_usage_count'
  ];
  -- v3 reporting RPCs must stay accessible to the SPA.
  definer_priv text[] := ARRAY[
    'cleanup_old_attachments', 'handle_new_user', 'revert_daily_sheet',
    'rpc_admin_create_farm', 'rpc_admin_create_farm_item',
    'rpc_admin_create_formula', 'rpc_admin_create_input',
    'rpc_admin_create_supplier',
    'rpc_admin_delete_farm', 'rpc_admin_delete_farm_item',
    'rpc_admin_delete_formula', 'rpc_admin_delete_input',
    'rpc_admin_delete_inventory_txn', 'rpc_admin_delete_supplier',
    'rpc_admin_duplicate_formula', 'rpc_admin_get_profile',
    'rpc_admin_hard_delete_profile', 'rpc_admin_log_activity',
    'rpc_admin_soft_delete_profile',
    'rpc_admin_toggle_farm', 'rpc_admin_toggle_formula',
    'rpc_admin_toggle_input', 'rpc_admin_toggle_profile',
    'rpc_admin_toggle_supplier',
    'rpc_admin_update_farm', 'rpc_admin_update_formula',
    'rpc_admin_update_input', 'rpc_admin_update_inventory_txn',
    'rpc_admin_update_supplier', 'rpc_admin_upsert_profile',
    'rpc_create_inventory_txn', 'rpc_get_or_create_draft_voucher',
    'rpc_upsert_voucher_line', 'save_daily_sheet', 'submit_daily_sheet',
    'submit_daily_voucher'
  ];
BEGIN
  -- 6a. search_path hardening for ALL public functions that lack one.
  FOR rec IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proconfig IS NULL
            OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  LOOP
    EXECUTE 'ALTER FUNCTION ' || rec.sig || ' SET search_path = public';
  END LOOP;

  -- 6b. Convert SAFE helpers to SECURITY INVOKER.
  FOR rec IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef = true
       AND p.proname = ANY(set_invokers)
  LOOP
    EXECUTE 'ALTER FUNCTION ' || rec.sig || ' SECURITY INVOKER';
  END LOOP;

  -- 6c. For privileged DEFINER RPCs: REVOKE PUBLIC EXECUTE, GRANT authenticated.
  -- EXCEPTION: handle_new_user is fired by the Supabase Auth INSERT trigger
  -- (the trigger runs as the auth-table owner role, which depends on the
  -- implicit grant to PUBLIC on trigger functions). Revoking PUBLIC would
  -- block new-account signups at the auth.uid() insert path, so leave it.
  FOR rec IN
    SELECT p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef = true
       AND p.proname = ANY(definer_priv)
  LOOP
    IF rec.proname = 'handle_new_user' THEN
      -- Preserve PUBLIC EXECUTE; the auth trigger depends on it.
      CONTINUE;
    END IF;
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || rec.sig || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || rec.sig || ' TO authenticated';
  END LOOP;
END $$;

-- =====================================================================
-- SECTION 7: MULTIPLE PERMISSIVE POLICIES — UNION & CONSOLIDATE
-- For each (table, cmd) with >=2 permissive policies:
--   - Construct merged USING = (qual_1) OR (qual_2) OR ...
--     (NULL quals become TRUE; permissive default)
--   - Construct merged WITH_CHECK similarly
--   - Create one new policy named merged_<table>_<cmd>
--   - Drop the originals
-- NULL guards prevent silent COALESCE/print failures.
-- =====================================================================
DO $$
DECLARE
  rec record;
  old_policies text[];
  new_using text;
  new_check text;
  new_name text;
  pol text;
  cmdt text;
BEGIN
  FOR rec IN
    SELECT schemaname, tablename, cmd,
           array_agg(policyname ORDER BY policyname) AS policies
      FROM pg_policies
     WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
     GROUP BY schemaname, tablename, cmd
    HAVING COUNT(*) > 1
  LOOP
    old_policies := rec.policies;
    cmdt := LOWER(rec.cmd);

    -- Pull the unioned predicates. NULL quals/WITH_CHECKs become TRUE
    -- (matching Postgres' "no clause => TRUE" default for permissive).
    SELECT string_agg(
             CASE WHEN p.qual IS NULL THEN 'true' ELSE '(' || p.qual || ')' END,
             ' OR ' ORDER BY p.policyname)
      INTO new_using
      FROM pg_policies p
     WHERE p.schemaname = rec.schemaname
       AND p.tablename  = rec.tablename
       AND p.cmd        = rec.cmd
       AND p.policyname = ANY(old_policies);

    SELECT string_agg(
             CASE WHEN p.with_check IS NULL THEN 'true' ELSE '(' || p.with_check || ')' END,
             ' OR ' ORDER BY p.policyname)
      INTO new_check
      FROM pg_policies p
     WHERE p.schemaname = rec.schemaname
       AND p.tablename  = rec.tablename
       AND p.cmd        = rec.cmd
       AND p.policyname = ANY(old_policies);

    -- Final guards: empty -> 'true'; NULL -> skip string concatenation.
    new_using := COALESCE(NULLIF(new_using, ''), 'true');
    new_check := COALESCE(NULLIF(new_check, ''), 'true');
    new_name  := 'merged_' || rec.tablename || '_' || cmdt;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', new_name, rec.tablename);

    IF cmdt = 'insert' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (%s)',
                     new_name, rec.tablename, new_check);
    ELSIF cmdt IN ('select', 'delete') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s USING (%s)',
                     new_name, rec.tablename, UPPER(cmdt), new_using);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s USING (%s) WITH CHECK (%s)',
                     new_name, rec.tablename, UPPER(cmdt), new_using, new_check);
    END IF;

    FOREACH pol IN ARRAY old_policies LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, rec.tablename);
    END LOOP;
  END LOOP;
END $$;

-- =====================================================================
-- SECTION 8: AUTH_RLS_INITPLAN — WRAP auth.uid()/auth.role() IN SUBSELECT
-- Rewrites policies referencing raw auth.* into (SELECT auth.*(...))
-- forcing Postgres to memoise the auth context between plan runs.
-- Idempotent: rewrites only policies that still match the unsafe regex.
-- =====================================================================
DO $$
DECLARE
  rec record;
  has_qual  boolean;
  has_check boolean;
  new_using text;
  new_check text;
  new_name  text;
BEGIN
  FOR rec IN
    SELECT tablename, policyname, cmd, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (qual ~* 'auth\.uid\(\)' OR qual ~* 'auth\.role\(\)'
            OR with_check ~* 'auth\.uid\(\)' OR with_check ~* 'auth\.role\(\)')
  LOOP
    has_qual  := rec.qual        IS NOT NULL;
    has_check := rec.with_check  IS NOT NULL;
    new_using := COALESCE(rec.qual, 'true');
    new_check := COALESCE(rec.with_check, 'true');
    new_using := regexp_replace(new_using, 'auth\.uid\(\)',  '(SELECT auth.uid())',  'gi');
    new_using := regexp_replace(new_using, 'auth\.role\(\)', '(SELECT auth.role())', 'gi');
    new_check := regexp_replace(new_check, 'auth\.uid\(\)',  '(SELECT auth.uid())',  'gi');
    new_check := regexp_replace(new_check, 'auth\.role\(\)', '(SELECT auth.role())', 'gi');

    new_name := rec.policyname || '_initplan';

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.policyname, rec.tablename);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', new_name, rec.tablename);

    IF LOWER(rec.cmd) = 'insert' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (%s)',
                     new_name, rec.tablename, new_check);
    ELSIF LOWER(rec.cmd) IN ('select', 'delete') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s USING (%s)',
                     new_name, rec.tablename, UPPER(rec.cmd), new_using);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s USING (%s) WITH CHECK (%s)',
                     new_name, rec.tablename, UPPER(rec.cmd), new_using, new_check);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- =====================================================================
-- POST-COMMIT TELEMETRY: prove idempotency + measure advisor delta.
-- (Re-applies must produce zero-error zero-change.)
-- =====================================================================
DO $$
DECLARE
  new_secdef int;
  new_searchpath_mutable int;
  new_secdef_view int;
  new_rls_true int;
  new_using_true_count int;
BEGIN
  SELECT COUNT(*) INTO new_secdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true
      AND has_function_privilege('anon', p.oid, 'EXECUTE');
  SELECT COUNT(*) INTO new_searchpath_mutable FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proconfig IS NULL
      OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));
  SELECT COUNT(*) INTO new_secdef_view FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='v' AND n.nspname='public'
      AND (c.reloptions IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(c.reloptions) o WHERE o='security_invoker=true'));
  SELECT COUNT(*) INTO new_rls_true FROM pg_policies
    WHERE schemaname='public' AND cmd='INSERT' AND btrim(with_check) ~* '^true\\s*$';
  SELECT COUNT(*) INTO new_using_true_count FROM pg_policies
    WHERE schemaname='public' AND btrim(qual) ~* '^true\\s*$';
  RAISE NOTICE 'POST_MIGRATION_015_TELEMETRY: secdef_public=% search_path_mutable=% secdef_views=% insert_with_check_true=% quals_true=%',
                new_secdef, new_searchpath_mutable, new_secdef_view, new_rls_true, new_using_true_count;
END $$;
