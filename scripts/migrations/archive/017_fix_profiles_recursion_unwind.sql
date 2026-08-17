-- =====================================================================
-- Migration 017: Unwind 4-deep (SELECT ...) auth.uid() nesting on profiles
--                + cross-table sweep for the same regression class
--                + idempotency lock for safe concurrent re-application.
-- =====================================================================
--
-- Root cause
-- ----------
-- Migration 015_advisor_fixes.sql SECTION 8 ("AUTH_RLS_INITPLAN") wraps
-- raw auth.uid() / auth.role() calls inside an initplan sub-select:
--
--     auth.uid()  →  (SELECT auth.uid())
--
-- That pattern is correct — but the migration's regex `auth\.uid\(\)`
-- matches the literal text `auth.uid()` *inside* its own replacement
-- `(SELECT auth.uid())`, so reapplying 015 on a database that already
-- has the wrapped policy compounds the nesting each time:
--
--     1st apply: auth.uid()              → (SELECT auth.uid())
--     2nd apply: (SELECT auth.uid())     → (SELECT (SELECT auth.uid()))
--     3rd apply: ...                     →  3-deep
--     4th apply: ...                     →  4-deep   <-- breaks login
--
-- After 4 reapplies the select policy read:
--
--     USING ((is_user_admin((SELECT (SELECT (SELECT (SELECT auth.uid()))
--             AS uid) AS uid) AS uid) AS uid))
--            OR ((SELECT (SELECT (SELECT (SELECT auth.uid()) AS uid) AS uid)
--                AS uid) = id)
--            OR ((SELECT (SELECT (SELECT (SELECT auth.uid()) AS uid) AS uid)
--                AS uid) = id)
--            OR ((id = (SELECT (SELECT (SELECT (SELECT auth.uid()) AS uid)
--                AS uid) AS uid)) OR is_current_user_admin())))
--
-- Postgres's stack-depth budget (max_stack_depth = 2048kB) is exhausted
-- by the nested sub-evaluations of is_user_admin (each a SECURITY DEFINER
-- call) → PostgREST returns 54001 → every /rest/v1/profiles request
-- logs HTTP 500 → login is therefore broken for every role.
--
-- Fix
-- ---
-- 1. Drop the four 4-deep compounded policies on public.profiles.
-- 2. Recreate them at single-initplan depth using DROP IF EXISTS +
--    CREATE so re-apply is safe (CREATE OR REPLACE POLICY is PG15-only
--    and this project currently runs PG14 per failed syntax test).
-- 3. Sweep the rest of the public schema for the same deeper-than-1
--    `(SELECT (SELECT... auth.uid()/auth.role())` pattern so any
--    affected tables surface for follow-up 018 in one NOTICE block.
--
-- Idempotency
-- -----------
-- pg_advisory_xact_lock blocks concurrent re-application from racing on
-- the DROP/CREATE phase (mirrors the lock pattern used by 016_recover_
-- unique_indexes.sql so the migration suite stays symmetric).
-- DROP IF EXISTS + CREATE keeps re-application safe without IF NOT
-- EXISTS (which CREATE POLICY does not support).
--
-- Scope
-- -----
-- This migration FIXES public.profiles (the live signal from the user)
-- and AUDITS the rest of the schema. A follow-up 018 is recommended
-- to sweep the audit NOTICE output and rewrite any other deeper-than-1
-- policies the same way.
-- =====================================================================

BEGIN;

-- Concurrency guard: serialize re-applies so DROP/CREATE + verify
-- block don't race. 0x0107 is an arbitrary marker for migration 017.
-- Must be INSIDE the BEGIN/COMMIT block so the lock spans the work
-- (pg_advisory_xact_lock is transaction-scoped and would auto-release
--  if acquired before BEGIN under the Supabase REST API's autocommit).
SELECT pg_advisory_xact_lock(0x0107);

-- ---------------------------------------------------------------------
-- 1. Drop the four 4-deep compounded policies (the broken ones).
--    DROP IF EXISTS so the migration is idempotent on re-apply.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "merged_profiles_select_initplan_initplan_initplan_initplan"
  ON public.profiles;
DROP POLICY IF EXISTS "merged_profiles_update_initplan_initplan_initplan_initplan"
  ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles_initplan_initplan_initplan_initplan"
  ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles_initplan_initplan_initplan_initplan"
  ON public.profiles;

-- Belt-and-suspenders coverage for any 2-/3-initplan variants we
-- may have missed — DROP IF EXISTS skips them silently.
DROP POLICY IF EXISTS "merged_profiles_select_initplan_initplan_initplan"      ON public.profiles;
DROP POLICY IF EXISTS "merged_profiles_select_initplan_initplan"              ON public.profiles;
DROP POLICY IF EXISTS "merged_profiles_select_initplan"                       ON public.profiles;
DROP POLICY IF EXISTS "merged_profiles_update_initplan_initplan_initplan"     ON public.profiles;
DROP POLICY IF EXISTS "merged_profiles_update_initplan_initplan"              ON public.profiles;
DROP POLICY IF EXISTS "merged_profiles_update_initplan"                       ON public.profiles;

-- ---------------------------------------------------------------------
-- 2. DROP the working-but-not-yet-recreated names so the upcoming
--    CREATE is idempotent on re-apply (CREATE POLICY has no IF NOT
--    EXISTS clause).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_self"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self"   ON public.profiles;
DROP POLICY IF EXISTS "admins_delete_profiles" ON public.profiles;
DROP POLICY IF EXISTS "admins_insert_profiles" ON public.profiles;

-- ---------------------------------------------------------------------
-- 3. Recreate the four working policies at single-initplan depth.
--    is_current_user_admin() is SECURITY DEFINER (defined in
--    005_helpers.sql and re-asserted in 012_fix_profiles_recursion.sql),
--    so its SELECT against profiles bypasses RLS — no recursion cycle.
--
--    (SELECT auth.uid()) is the canonical initplan wrapper recommended
--    by Supabase's Linter (auth_rls_initplan) and is exactly ONE level
--    deep — safe under max_stack_depth.
-- ---------------------------------------------------------------------
CREATE POLICY "profiles_select_self"
  ON public.profiles
  FOR SELECT
  USING (id = (SELECT auth.uid()) OR is_current_user_admin());

CREATE POLICY "profiles_update_self"
  ON public.profiles
  FOR UPDATE
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "admins_delete_profiles"
  ON public.profiles
  FOR DELETE
  USING (is_user_admin((SELECT auth.uid())));

CREATE POLICY "admins_insert_profiles"
  ON public.profiles
  FOR INSERT
  WITH CHECK (is_user_admin((SELECT auth.uid())));

COMMIT;

-- ---------------------------------------------------------------------
-- 4. Cross-schema sweep: surface ANY other deeper-than-1 initplan
--    policy on public.* tables. These are the candidates for
--    follow-up 018.
--
--    Detection rule: USING/WITH_CHECK clauses whose textual form
--    matches the regex `(SELECT (SELECT auth.(uid|role)()` — the
--    canonical 2-deep signal.
--
--    Output: one NOTICE line per finding, e.g.
--      017_SWEEP_FINDING: table=farms policy=…_initplan_initplan depth=2
--      017_SWEEP_FINDING: table=…   policy=…                  depth=3
--    Migration passes whether or not findings exist (this is an
--    AUDIT, not a hard failure).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  rec record;
  qual_text  text;
  check_text text;
  depth_using  int;
  depth_check  int;
  deepest      int;
BEGIN
  FOR rec IN
    SELECT n.nspname AS schema, c.relname AS tbl, p.polname AS policy,
           p.polqual, p.polrelid, p.polwithcheck
      FROM pg_policy p
      JOIN pg_class c  ON c.oid  = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND (
            pg_get_expr(p.polqual,     p.polrelid) ~* 'auth\.(uid|role)\(\)'
         OR pg_get_expr(p.polwithcheck, p.polrelid) ~* 'auth\.(uid|role)\(\)'
       )
  LOOP
    qual_text  := COALESCE(pg_get_expr(rec.polqual,     rec.polrelid), '');
    check_text := COALESCE(pg_get_expr(rec.polwithcheck, rec.polrelid), '');

    -- Count nesting depth: number of leading "(SELECT " tokens wrapped
    -- around one "auth.uid()" or "auth.role()" call. A healthy policy
    -- has depth 0 (raw literal) or depth 1 (single initplan wrap).
    -- Depth 2+ is the regression signal.
    depth_using  := (length(qual_text)  - length(regexp_replace(qual_text,
                          '\(\s*SELECT\s+', '', 'g'))) / length('(SELECT ');
    depth_check  := (length(check_text) - length(regexp_replace(check_text,
                          '\(\s*SELECT\s+', '', 'g'))) / length('(SELECT ');

    -- Use the deeper of the two for classification. Cap at > 0 = suspect.
    deepest := GREATEST(depth_using, depth_check);

    IF deepest >= 2 THEN
      RAISE NOTICE
        '017_SWEEP_FINDING: schema=% table=% policy=% using_depth=% check_depth=%',
        rec.schema, rec.tbl, rec.policy, depth_using, depth_check;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 5. Verify the profiles fix landed: 4 policies, zero deep-nesting on
--    public.profiles specifically. RAISE EXCEPTION on failure so the
--    migration aborts loudly.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  policy_count        int;
  deep_initplan_count int;
BEGIN
  SELECT COUNT(*) INTO policy_count
    FROM pg_policy
   WHERE polrelid = 'public.profiles'::regclass;

  SELECT COUNT(*) INTO deep_initplan_count
    FROM pg_policy p
   WHERE polrelid = 'public.profiles'::regclass
     AND (
       (pg_get_expr(p.polqual,     p.polrelid) ~* '\(\s*SELECT\s+\(\s*SELECT')
       OR
       (pg_get_expr(p.polwithcheck, p.polrelid) ~* '\(\s*SELECT\s+\(\s*SELECT')
     );

  IF policy_count <> 4 THEN
    RAISE EXCEPTION
      '017_VERIFY_FAILED: expected exactly 4 policies on public.profiles, got %',
      policy_count;
  END IF;

  IF deep_initplan_count <> 0 THEN
    RAISE EXCEPTION
      '017_VERIFY_FAILED: % policies on public.profiles still nest (SELECT...) >1',
      deep_initplan_count;
  END IF;

  RAISE NOTICE
    '017_VERIFY_PASS: profiles has % policies, zero deep-initplan nesting.',
    policy_count;
END $$;
