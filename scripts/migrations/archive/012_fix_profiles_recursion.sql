-- =====================================================================
-- migration: 012_fix_profiles_recursion.sql
--
-- ROOT CAUSE
--   12 RLS policies on tables other than `profiles` themselves contain
--   direct EXISTS (... profiles ...) or
--   (farm_id IN (SELECT profiles.farm_id FROM profiles WHERE ...))
--   subqueries. When the SPA calls any reporting_* RPC, the inner query
--   evaluates e.g. inventory_transactions RLS, which calls the profiles
--   policy, which itself reads profiles — Postgres detects the cycle and
--   aborts with error 42P17 "infinite recursion detected in policy for
--   relation profiles". Two prior fix-attempt migrations
--   (fix_rls_recursion + fix_rls_recursion_v2) + a third
--   enable_rls_and_create_policies_fixed re-apply did not eliminate the
--   recursion: the cross-table subqueries were rewritten in helpers
--   (is_user_admin, has_farm_access_v2, get_user_farm_id, get_user_role)
--   but several cross-table policies were left intact, so any query
--   that joins inventory_transactions while reading profiles rows
--   still recurses.
--
-- FIX SHAPE
--   1. Add three SECURITY DEFINER helpers that read profiles by
--      auth.uid() with their OWNER privileges (postgres), bypassing
--      the caller's profiles RLS — which breaks the recursion cycle.
--         * is_current_user_admin()            -> boolean
--         * is_current_user_admin_or_supervisor() -> boolean
--         * current_user_farm_id()             -> uuid or NULL
--   2. DROP IF EXISTS + CREATE each of the 12 affected policies, with
--      USING / WITH_CHECK rewritten to call those helpers instead of
--      `EXISTS (... profiles ...)` or `SELECT profiles.farm_id`.
--
-- SAFETY
--   * CREATE OR REPLACE for helpers (no breakage if already present).
--   * SET search_path = public on every helper (no SearchPath
--     hijacking possible if a future CALL chain adds mutable schemas).
--   * DROP IF EXISTS + CREATE POLICY (idempotent; safe to re-apply).
--   * No DML on user data. Function bodies + policy clauses only.
--   * Formatting in CREATE POLICY matches the original PERMISSIVE/cmd
--     and role target exactly so semantic intent is preserved.
--
-- APPLY AFTER
--   All earlier migrations (003-011) — this file is a pure RLS patch
--   on the schema those produced.
--
-- Idempotent. Re-apply is safe.
-- =====================================================================


-- =====================================================================
-- 1. SECURITY DEFINER helpers
-- =====================================================================
-- Each reads profiles WHERE id = auth.uid() AND ...
-- SECURITY DEFINER ⇒ executes as the function owner (superuser),
-- which bypasses the caller's profiles RLS — RECURSION IS BROKEN.
-- STABLE so the planner can cache the result within a query.
-- SET search_path = public to harden against search_path hijack patterns.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles
     WHERE id = auth.uid()
       AND role = 'admin'::public.user_role_enum
       AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin_or_supervisor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles
     WHERE id = auth.uid()
       AND role = ANY (ARRAY['admin'::public.user_role_enum, 'supervisor'::public.user_role_enum])
       AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_farm_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT farm_id
    FROM public.profiles
   WHERE id = auth.uid()
     AND is_active = true
   LIMIT 1;
$$;


-- =====================================================================
-- 2. Rewrite the affected policies
-- =====================================================================
-- DROP IF EXISTS + CREATE POLICY. PERMISSIVE policy semantics (default)
-- preserved exactly. The new USING / WITH_CHECK expressions have the
-- same row-visibility semantics as the originals; only the evaluation
-- path is changed so it can't recurse.
-- =====================================================================

-- 2.1 profiles.profiles_select_self  (self-table recursion; profiles
--     was the FIRST table in the recursion cycle when an authenticated
--     row needs to be evaluated).
DROP POLICY IF EXISTS profiles_select_self ON public.profiles;
CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT
  TO PUBLIC
  USING (id = auth.uid() OR is_current_user_admin());


-- 2.2 farms.farms_user_read
DROP POLICY IF EXISTS farms_user_read ON public.farms;
CREATE POLICY farms_user_read ON public.farms
  FOR SELECT
  TO PUBLIC
  USING (id = current_user_farm_id());


-- 2.3 farms."Supervisors and operators can read their farm"
--     Original role target was {authenticated}; cmd was r.
DROP POLICY IF EXISTS "Supervisors and operators can read their farm" ON public.farms;
CREATE POLICY "Supervisors and operators can read their farm" ON public.farms
  FOR SELECT
  TO authenticated
  USING (current_user_farm_id() = id);


-- 2.4 farms."Admins can manage farms"
--     Original was FOR SELECT (cmd='r') to PUBLIC.
DROP POLICY IF EXISTS "Admins can manage farms" ON public.farms;
CREATE POLICY "Admins can manage farms" ON public.farms
  FOR SELECT
  TO PUBLIC
  USING (is_current_user_admin());


-- 2.5 farm_items.farm_items_select_farm_access
DROP POLICY IF EXISTS farm_items_select_farm_access ON public.farm_items;
CREATE POLICY farm_items_select_farm_access ON public.farm_items
  FOR SELECT
  TO PUBLIC
  USING (has_farm_access_v2(farm_id) OR is_current_user_admin());


-- 2.6 farm_feed_formulas.farm_feed_formulas_select_farm_access
DROP POLICY IF EXISTS farm_feed_formulas_select_farm_access ON public.farm_feed_formulas;
CREATE POLICY farm_feed_formulas_select_farm_access ON public.farm_feed_formulas
  FOR SELECT
  TO PUBLIC
  USING (has_farm_access_v2(farm_id) OR is_current_user_admin());


-- 2.7 farm_feed_formulas.farm_isolation_formulas  (FOR ALL)
DROP POLICY IF EXISTS farm_isolation_formulas ON public.farm_feed_formulas;
CREATE POLICY farm_isolation_formulas ON public.farm_feed_formulas
  FOR ALL
  TO PUBLIC
  USING (farm_id = current_user_farm_id() OR is_current_user_admin())
  WITH CHECK (farm_id = current_user_farm_id() OR is_current_user_admin());


-- 2.8 farm_feed_formulas.formulas_read
DROP POLICY IF EXISTS formulas_read ON public.farm_feed_formulas;
CREATE POLICY formulas_read ON public.farm_feed_formulas
  FOR SELECT
  TO PUBLIC
  USING (farm_id = current_user_farm_id());


-- 2.9 inventory_transactions.inventory_txn_select_farm_access
DROP POLICY IF EXISTS inventory_txn_select_farm_access ON public.inventory_transactions;
CREATE POLICY inventory_txn_select_farm_access ON public.inventory_transactions
  FOR SELECT
  TO PUBLIC
  USING (has_farm_access_v2(farm_id) OR is_current_user_admin());


-- 2.10 inventory_transactions.farm_isolation_inventory  (FOR ALL)
DROP POLICY IF EXISTS farm_isolation_inventory ON public.inventory_transactions;
CREATE POLICY farm_isolation_inventory ON public.inventory_transactions
  FOR ALL
  TO PUBLIC
  USING (farm_id = current_user_farm_id() OR is_current_user_admin())
  WITH CHECK (farm_id = current_user_farm_id() OR is_current_user_admin());


-- 2.11 inventory_transactions.operator_readonly_financial
--       Original WITH_CHECK allowed admin OR supervisor; we replicate.
DROP POLICY IF EXISTS operator_readonly_financial ON public.inventory_transactions;
CREATE POLICY operator_readonly_financial ON public.inventory_transactions
  FOR INSERT
  TO PUBLIC
  WITH CHECK (is_current_user_admin_or_supervisor());


-- 2.12 daily_voucher_lines.daily_voucher_lines_select_farm_access
--       Inner join daily_vouchers now uses the helper.
DROP POLICY IF EXISTS daily_voucher_lines_select_farm_access ON public.daily_voucher_lines;
CREATE POLICY daily_voucher_lines_select_farm_access ON public.daily_voucher_lines
  FOR SELECT
  TO PUBLIC
  USING (
    EXISTS (
      SELECT 1
        FROM public.daily_vouchers v
       WHERE v.id = daily_voucher_lines.voucher_id
         AND (has_farm_access_v2(v.farm_id) OR is_current_user_admin())
    )
  );


-- =====================================================================
-- 3. PERMISSIONS  (lock down the helpers, same pattern as 008-011)
-- =====================================================================
-- Without this, the helpers inherit Postgres' default PUBLIC EXECUTE on
-- new functions — an anon probe could leak `is_admin` / `farm_id` truth
-- via any client. 008/009/010/011 all REVOKE PUBLIC + GRANT anon,auth.
-- We mirror that.
-- =====================================================================
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'is_current_user_admin',
    'is_current_user_admin_or_supervisor',
    'current_user_farm_id'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO anon, authenticated', fn);
  END LOOP;
END $$;

-- =====================================================================
-- 4. Post-apply sanity (comment-only)
-- =====================================================================
-- After this file applies successfully, expect:
--
--   SELECT current_user_farm_id();      -- NULL or uuid, no recursion
--   SELECT is_current_user_admin();     -- false (no JWT) or true/false per role
--
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT count(*) AS visible_profiles FROM public.profiles;  -- must NOT throw 42P17
--   ROLLBACK;
--
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT count(*) AS visible_balances
--     FROM public.reporting_inventory_balance_as_of(p_as_of := CURRENT_DATE);
--   ROLLBACK;
--
-- Both queries above MUST succeed (no infinite recursion). The rows
-- returned will be 0 unless the caller is bound to a real farm; this
-- matches the SECURITY INVOKER + RLS contract documented in
-- docs/reports/db-contract.md §4.
--
--   SELECT proname, prosecdef FROM pg_proc p
--    WHERE proname IN (
--      'is_current_user_admin',
--      'is_current_user_admin_or_supervisor',
--      'current_user_farm_id');
-- All three prosecdef = true.
-- =====================================================================
