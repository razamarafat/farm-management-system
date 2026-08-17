-- =====================================================================
-- migration: 005_helpers.sql
-- Purpose  : Helper functions used by 004_rls_policies, plus RPCs that
--            return the caller's own farm row for SPA pickers (so
--            non-admin pages do not need a direct SELECT on
--            public.farms).
--
-- Order: 003 → 005 → 004.
--
-- MORVARID-FARM-SPECIFIC NOTES:
-- The target DB already has these functions living in public:
--   * has_farm_access(uuid)         — STABLE SECURITY DEFINER. Body
--                                     uses is_admin() (a pre-existing
--                                     helper) and profiles.farm_id.
--   * get_user_farm_id()            — STABLE SECURITY DEFINER.
--   * get_user_role()               — overloaded (zero-arg + uuid-arg).
-- We DO NOT overwrite them here. Two helpers below are NEW:
--   * has_farm_access_v2(uuid)      — same shape, but uses
--                                     profiles.role='admin' + profiles
--                                     .farm_id directly (no is_admin()
--                                     helper coupling, no farm_staff
--                                     dependency).
--   * rpc_get_user_farm()           — new entrypoint used by 004 and
--                                     by SPA hooks to fetch the
--                                     caller's assigned farm row.
-- 004_rls_policies.sql references has_farm_access_v2, NOT
-- has_farm_access — so any drift between the two helpers stays
-- isolated. Operators do not see cross-farm metadata even if the DB
-- has farm_staff.
--
-- Targets that 005 is tolerant of:
--   * public.farm_staff missing    — CREATE INDEX on farm_staff is
--                                    wrapped in a to_regclass guard.
-- =====================================================================

-- ---------------------------------------------------------------------
-- has_farm_access_v2(check_farm_id uuid) — NEW helper.
--   Returns true if the caller is either:
--     - an active admin profile (role='admin', is_active=true), OR
--     - an active operator / supervisor whose profile.farm_id matches
--       the check_farm_id argument.
--   Used by every "_select_farm_access" policy in 004.
--   Profiles-only by design — no farm_staff dependency.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_farm_access_v2(check_farm_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND (
        role = 'admin'
        OR (farm_id IS NOT NULL AND farm_id = check_farm_id)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_farm_access_v2(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- get_user_farm_id() — NOT touched here. The target DB already has a
-- working version. If your DB is fresh and you DO want this function
-- installed, uncomment the block below.
-- ---------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.get_user_farm_id()
-- RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
--   SELECT farm_id FROM public.profiles WHERE id = auth.uid() AND is_active = true;
-- $$;
-- GRANT EXECUTE ON FUNCTION public.get_user_farm_id() TO anon, authenticated;

-- ---------------------------------------------------------------------
-- rpc_get_user_farm() — returns the caller's assigned farm row, if any.
--   Replaces the direct supabase.from('farms').select('*') SPA call that
--   the read-side RLS policy in 004 returns to non-admins as
--   auth.role()='authenticated' filtered.
--   Calls public.get_user_farm_id() (pre-existing helper).
--   Admins: returns NULL (admins do not have an "assigned" farm).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_get_user_farm()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE fid uuid;
BEGIN
  fid := public.get_user_farm_id();
  IF fid IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT to_jsonb(f.*) FROM public.farms f WHERE id = fid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_user_farm() TO anon, authenticated;

-- ---------------------------------------------------------------------
-- Indexes. The farm_staff partial index is gated on the table's
-- presence (it was absent in the live Morvarid-FARM probe). The
-- profiles index is unconditional because profiles is required by
-- the helpers above.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.farm_staff') IS NULL THEN
    RAISE NOTICE 'public.farm_staff not present; skipping farm_staff index creation';
  ELSE
    EXECUTE 'CREATE INDEX IF NOT EXISTS farm_staff_user_farm_active_idx
             ON public.farm_staff (user_id, farm_id) WHERE is_active = true';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profiles_farm_id_active_idx
  ON public.profiles (farm_id)
  WHERE is_active = true AND farm_id IS NOT NULL;

-- =====================================================================
-- Permissions recap
-- =====================================================================
-- public.has_farm_access_v2(uuid) and public.rpc_get_user_farm() are
-- SECURITY DEFINER so they can read public.profiles (which is
-- protected) on behalf of the caller. They are GRANT'd to anon +
-- authenticated so the SPA can invoke them under the JWT context.
