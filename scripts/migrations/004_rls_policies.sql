-- =====================================================================
-- migration: 004_rls_policies.sql
-- Purpose  : Read-side RLS so the SPA's anon client can SELECT through
--            the existing PostgREST API. Writes are intentionally
--            blocked at RLS — they must go through the SECURITY DEFINER
--            rpc_admin_* functions shipped in 003_admin_rpcs.sql.
--
-- Order: 003 → 005 → 004 (helpers in 005 must exist before 004's
--                        USING clauses reference them).
--
-- This revision is tolerant to two real-world scenarios that surfaced
-- during a live DB probe on Morvarid-FARM:
--   1. `public.farm_staff` does not exist in the target DB. The
--      farms_select policy uses has_farm_access_v2 (a profiles-only
--      helper in 005) instead of a direct farm_staff join, so apply
--      succeeds even when farm_staff is absent.
--   2. `public.inputs` does not exist in the target DB. The inputs
--      section is wrapped in `IF to_regclass('public.inputs') IS NOT
--      NULL` so apply tolerates the missing table. When inputs is
--      added by a later migration, re-run 004 in full to capture the
--      inputs policy (or run only the inputs section).
--
-- Assumed schema:
--   public.profiles(id uuid pk, role text, farm_id uuid, is_active bool)
--   public.farms(id uuid pk, name text, code text, address text,
--                phone text, is_active bool, created_at timestamptz)
-- If any of these are missing or columns differ, apply will error with
-- a column/relation does not exist message.
--
-- COEXISTENCE NOTE: existing policies such as `farms_admin_all`,
-- `farm_items_admin_all`, `daily_vouchers_admin_all`, `inv_txn_admin_all`,
-- `profiles_admin_all`, `logs_admin_read`, `formulas_admin`,
-- `formula_items_admin`, `halls_admin` already sit on most of these
-- tables (read from earlier probes). Postgres OR's policies for the
-- same (cmd, role) tuple, so creating new `*_select_*` policies
-- alongside existing ones does NOT revoke access — it ADDS access.
-- Removal of the old `*_admin_all` policies is a separate cleanup
-- tracked outside this migration.
--
-- FUTURE-DIRECTION: once every SPA hook has migrated off the
-- `supabase.from('farms').select(...)` direct path onto
-- rpc_get_user_farm() / rpc_list_user_farms(), the
-- farms_select_admin_or_staff policy should be removed and the table
-- split into farms_public (name only) + farms_private (full row,
-- admin-only).
-- =====================================================================

-- ---------- farms (TIGHTENED — admin OR farm_staff OR profile) --------
-- Selector is has_farm_access_v2(uuid): admin OR profile.farm_id match.
-- No direct reference to public.farm_staff so the policy applies on
-- DBs that don't yet have that table.
ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "farms_select_admin"           ON public.farms;
DROP POLICY IF EXISTS "farms_select_admin_or_staff"  ON public.farms;
CREATE POLICY "farms_select_admin_or_staff" ON public.farms
  FOR SELECT USING (
    public.has_farm_access_v2(id)
  );

-- ---------- inputs (TIGHTENED — admin-only writes; reads open) -------
-- The whole section is gated on the table's presence so this file can
-- apply on a DB that doesn't yet have `public.inputs`.
DO $$
BEGIN
  IF to_regclass('public.inputs') IS NULL THEN
    RAISE NOTICE 'public.inputs not present; skipping inputs RLS scaffolding (apply once the table exists)';
  ELSE
    EXECUTE 'ALTER TABLE public.inputs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "inputs_select_authenticated" ON public.inputs';
    EXECUTE $e$ CREATE POLICY "inputs_select_authenticated" ON public.inputs
                 FOR SELECT USING (auth.role() = 'authenticated') $e$;
  END IF;
END $$;

-- ---------- suppliers ------------------------------------------------
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers_select_authenticated" ON public.suppliers;
CREATE POLICY "suppliers_select_authenticated" ON public.suppliers
  FOR SELECT USING (auth.role() = 'authenticated');

-- ---------- farm_items (TIGHTENED — has_farm_access_v2 OR admin) ------
ALTER TABLE public.farm_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "farm_items_select_authenticated" ON public.farm_items;
DROP POLICY IF EXISTS "farm_items_select_farm_access"   ON public.farm_items;
CREATE POLICY "farm_items_select_farm_access" ON public.farm_items
  FOR SELECT USING (
    public.has_farm_access_v2(farm_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin' AND is_active = true
    )
  );

-- ---------- farm_halls (TIGHTENED) -----------------------------------
ALTER TABLE public.farm_halls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "farm_halls_select_authenticated" ON public.farm_halls;
DROP POLICY IF EXISTS "farm_halls_select_farm_access"   ON public.farm_halls;
CREATE POLICY "farm_halls_select_farm_access" ON public.farm_halls
  FOR SELECT USING (
    public.has_farm_access_v2(farm_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin' AND is_active = true
    )
  );

-- ---------- farm_feed_formulas (TIGHTENED) ---------------------------
ALTER TABLE public.farm_feed_formulas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "farm_feed_formulas_select_authenticated" ON public.farm_feed_formulas;
DROP POLICY IF EXISTS "farm_feed_formulas_select_farm_access"   ON public.farm_feed_formulas;
CREATE POLICY "farm_feed_formulas_select_farm_access" ON public.farm_feed_formulas
  FOR SELECT USING (
    public.has_farm_access_v2(farm_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin' AND is_active = true
    )
  );

ALTER TABLE public.farm_formula_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "farm_formula_items_select_authenticated" ON public.farm_formula_items;
DROP POLICY IF EXISTS "farm_formula_items_select_farm_access"   ON public.farm_formula_items;
-- farm_formula_items doesn't carry farm_id directly; gate via parent
-- formula's farm_id (subquery through farm_feed_formulas).
CREATE POLICY "farm_formula_items_select_farm_access" ON public.farm_formula_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.farm_feed_formulas f
      WHERE f.id = farm_formula_items.formula_id
        AND (
          public.has_farm_access_v2(f.farm_id)
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin' AND is_active = true
          )
        )
    )
  );

-- ---------- daily_vouchers (TIGHTENED) ------------------------------
ALTER TABLE public.daily_vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_vouchers_select_authenticated" ON public.daily_vouchers;
DROP POLICY IF EXISTS "daily_vouchers_select_farm_access"   ON public.daily_vouchers;
CREATE POLICY "daily_vouchers_select_farm_access" ON public.daily_vouchers
  FOR SELECT USING (
    public.has_farm_access_v2(farm_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin' AND is_active = true
    )
  );

ALTER TABLE public.daily_voucher_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_voucher_lines_select_authenticated" ON public.daily_voucher_lines;
DROP POLICY IF EXISTS "daily_voucher_lines_select_farm_access"   ON public.daily_voucher_lines;
-- daily_voucher_lines inherits farm_id via the parent voucher.
CREATE POLICY "daily_voucher_lines_select_farm_access" ON public.daily_voucher_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.daily_vouchers v
      WHERE v.id = daily_voucher_lines.voucher_id
        AND (
          public.has_farm_access_v2(v.farm_id)
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin' AND is_active = true
          )
        )
    )
  );

-- ---------- inventory_transactions (TIGHTENED) ----------------------
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_txn_select_authenticated" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_txn_select_farm_access"   ON public.inventory_transactions;
CREATE POLICY "inventory_txn_select_farm_access" ON public.inventory_transactions
  FOR SELECT USING (
    public.has_farm_access_v2(farm_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin' AND is_active = true
    )
  );

-- ---------- profiles (admin list requires explicit read) -------------
-- Use RPC for cross-user listing (rpc_admin_get_profile). Tighten RLS
-- so a non-admin user can only see their own row.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
CREATE POLICY "profiles_select_self" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true)
  );

-- ---------- user_activity_logs (admin-only) --------------------------
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_activity_logs_select_admin" ON public.user_activity_logs;
CREATE POLICY "user_activity_logs_select_admin" ON public.user_activity_logs
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true
  ));

-- =====================================================================
-- Notes on what is INTENTIONALLY not added
-- =====================================================================
-- * INSERT/UPDATE/DELETE policies on every table above — by design.
--   All privileged writes go through rpc_admin_* SECURITY DEFINER RPCs
--   (003_admin_rpcs.sql) which execute as the function owner, bypassing
--   RLS. The anon client therefore cannot perform destructive writes
--   directly even if the user is somehow authenticated-with-admin-JWT.
-- * Storage RLS for the `attachments` bucket — see
--   docs/security/incident-response.md §Step 3 for adding bucket
--   policies once FileUpload is migrated.
