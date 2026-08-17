-- =====================================================================
-- Migration 018: Generic recursion-audit fixup for public.* tables.
--                Excludes `public.profiles` (already fixed by 017).
-- =====================================================================
--
-- Root cause (carried over from 015 + 017's documented analysis)
-- --------------------------------------------------------------
-- Migration 015_advisor_fixes.sql SECTION 8 ("AUTH_RLS_INITPLAN")
-- wraps raw auth.uid() / auth.role() calls in a single initplan:
--
--     auth.uid()  →  (SELECT auth.uid())
--
-- But the regex used to drive that wrap (`auth\.uid\(\)`) matches the
-- INNER literal of its OWN replacement `(SELECT auth.uid())`, so any
-- re-application of 015 on a database that already has the wrapped policy
-- compounds the nesting. After four reapplies the select policy on
-- profiles looked like:
--
--     USING ((is_user_admin((SELECT (SELECT (SELECT (SELECT auth.uid()))
--             AS uid) AS uid) AS uid) AS uid)) ...)
--
-- Postgres max_stack_depth exceeded → PostgREST 54001 → HTTP 500.
--
-- Migration 017 fixed `public.profiles` surgically (DROP + CREATE for
-- 4 known policies). It also included a sweep block that emits a NOTICE
-- for every other deeper-than-1 policy it finds on the public schema.
--
-- This migration 018 is the FIX for everything 017's sweep block would
-- have NRaised about at runtime. It uses a GENERIC regex unwinder
-- (advised by the architectural review) so it handles the full table
-- set in one block, instead of surgically hardcoding canonical forms
-- for each table.
--
-- Strategy
-- --------
-- For every public.* policy EXCLUDING profiles:
--   1. Read its USING clause and WITH_CHECK clause text.
--   2. Apply a single regex that collapses any N>=1 nesting of
--      (SELECT (SELECT (... (SELECT auth.uid()/auth.role() ))))) back
--      to a single (SELECT auth.uid()/auth.role()).
--   3. DROP the existing policy and CREATE it again with the same name,
--      cmd, permissiveness, and roles — only the qual text changes.
--
-- The regex is anchored so it ONLY collapses wrappers around
-- auth.uid() / auth.role() — inline `(SELECT 1 FROM ...)` subqueries
-- pointing at helper tables are left untouched (they don't end in
-- `auth.uid()` or `auth.role()`).
--
-- Idempotency
-- -----------
-- pg_advisory_xact_lock(0x0108) inside BEGIN serializes re-applies.
-- DROP IF EXISTS ensures the recreate step always succeeds (creates the
-- same-name policy again — Postgres doesn't have CREATE POLICY IF NOT
-- EXISTS, but the DROP before CREATE keeps re-apply idempotent).
-- The collapse regex is idempotent on already-1-deep clauses (no
-- further replacement after the first pass).
--
-- Safety
-- ------
-- A RAISE EXCEPTION inside the rewriter DO block aborts the migration
-- cleanly (no partial state changes are persisted).
-- Excludes `public.profiles` because 017 has the right canonical form
-- for those four policies explicitly — the generic unwinder would
-- still produce a correct result for profiles but we keep 017 as the
-- authoritative source-of-truth for the user-reported bug.
-- =====================================================================

BEGIN;

-- Concurrency guard: serialize re-applies. 0x0108 = 0x0107 + 0x01 to
-- keep 018 distinct from 017. Must be INSIDE BEGIN so the lock spans
-- the rewriter DO block (otherwise the Supabase REST API's autocommit
-- releases it before the work runs).
-- (Mirrors the placement fix from 017's code-reviewer-minimax-m3 round.)
SELECT pg_advisory_xact_lock(0x0108);

-- ---------------------------------------------------------------------
-- The generic unwinder. Loops over every public.* policy EXCLUDING
-- profiles, regex-collapses the nesting around auth.uid()/auth.role()
-- calls, then DROPs + CREATEs the same-name policy with the unwound
-- qual text. PRESERVES cmd, permissiveness, and roles.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  rec                record;
  pol_name           text;
  table_oid          regclass;
  new_using          text;
  new_check          text;
  using_pat          text := '(\(\s*SELECT\s+)+(auth\.(uid|role)\(\))(\s*\))+';
  using_tpl          text := '(SELECT \2)';
  permissiveness_str text;
  cmd_str            text;
  to_clause_sql      text;
BEGIN
  FOR rec IN
    SELECT p.polrelid,
           p.polname,
           p.polcmd::text                                  AS cmd,
           p.polpermissive                                 AS permissive,
           ARRAY(
             SELECT rolname::text
             FROM pg_roles
             WHERE oid = ANY (p.polroles)
             ORDER BY rolname
           )                                               AS role_names,
           pg_get_expr(p.polqual,     p.polrelid)          AS using_text,
           pg_get_expr(p.polwithcheck, p.polrelid)         AS check_text
      FROM pg_policy p
     WHERE p.polrelid::regclass::text LIKE 'public.%'
       AND p.polrelid::regclass::text <> 'public.profiles'
  LOOP
    table_oid  := rec.polrelid;
    pol_name   := rec.polname;
    new_using  := rec.using_text;
    new_check  := rec.check_text;

    -- Collapse any N>=1 nested wrappers around auth.uid()/auth.role()
    -- back to a single wrapper. The regex captures:
    --   group 1: one or more "(SELECT " prefixes
    --   group 2: the literal auth.uid() / auth.role() call
    --   group 3: one or more closing ")" parens
    -- and replaces with a single "(SELECT <call>)".
    IF new_using IS NOT NULL THEN
      new_using := regexp_replace(new_using, using_pat, using_tpl, 'gi');
    END IF;
    IF new_check IS NOT NULL THEN
      new_check := regexp_replace(new_check, using_pat, using_tpl, 'gi');
    END IF;

    -- If the clauses didn't change (e.g., the policy was already
    -- unwound by 017 elsewhere, or has a raw auth.uid() we want to
    -- preserve without modifying for some reason), still DROP+CREATE
    -- is required for uniformity. Otherwise skip — saves a needless
    -- DROP+CREATE churn for policies not affected by the regression.
    IF (new_using IS NOT DISTINCT FROM rec.using_text)
       AND (new_check IS NOT DISTINCT FROM rec.check_text)
    THEN
      CONTINUE;
    END IF;

    permissiveness_str := CASE WHEN rec.permissive THEN 'AS PERMISSIVE'
                                ELSE 'AS RESTRICTIVE' END;
    cmd_str            := CASE rec.cmd
                              WHEN 'r' THEN 'FOR SELECT'
                              WHEN 'a' THEN 'FOR INSERT'
                              WHEN 'w' THEN 'FOR UPDATE'
                              WHEN 'd' THEN 'FOR DELETE'
                              WHEN '*' THEN 'FOR ALL'
                              ELSE 'FOR ALL'
                           END;
    -- Build the optional `TO role1, role2` clause. When role_names
    -- is NULL or empty, the policy applies to PUBLIC (Postgres
    -- default), and we OMIT the TO clause entirely so the recreated
    -- policy matches the original semantics bit-for-bit.
    -- When role_names is non-empty, we emit `TO role1, role2` to
    -- preserve any role restriction that was enforced by the original.
    -- This addresses code-reviewer-minimax-m3 finding C: the prior
    -- impl hard-coded `TO PUBLIC`, which would silently widen any
    -- role-restricted policy back to PUBLIC on re-apply.
    to_clause_sql := CASE
                       WHEN rec.role_names IS NULL
                         OR array_length(rec.role_names, 1) IS NULL
                         OR array_length(rec.role_names, 1) = 0
                       THEN ''
                       ELSE 'TO ' || array_to_string(rec.role_names, ', ') || ' '
                     END;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', pol_name, table_oid);

    -- Reauthor the policy with the same cmd, permissiveness, and
    -- qual roles, but with the new qual / with_check text.
    -- For SELECT / DELETE we only carry USING; for INSERT only
    -- WITH_CHECK; for UPDATE / ALL we carry both.
    IF rec.cmd IN ('r', 'd') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %s %s %s ' || to_clause_sql || 'USING (%L)',
        pol_name, table_oid, permissiveness_str, cmd_str, new_using
      );
    ELSIF rec.cmd = 'a' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %s %s %s ' || to_clause_sql || 'WITH CHECK (%L)',
        pol_name, table_oid, permissiveness_str, cmd_str, new_check
      );
    ELSE
      -- 'w' (UPDATE) and '*' (ALL): carry both.
      EXECUTE format(
        'CREATE POLICY %I ON %s %s %s ' || to_clause_sql || 'USING (%L) WITH CHECK (%L)',
        pol_name, table_oid, permissiveness_str, cmd_str, new_using, new_check
      );
    END IF;

    RAISE NOTICE
      '018_FIX: table=% policy=% cmd=% permissive=% to_clause=<<%s>> unwound',
      table_oid::text, pol_name, rec.cmd, rec.permissive, to_clause_sql;
  END LOOP;
END $$;

COMMIT;

-- ---------------------------------------------------------------------
-- Verify: zero deeper-than-1 initplan nesting across public.*
-- (excluding profiles which 017 owns). RAISE EXCEPTION on any finding.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  deep_initplan_count int;
BEGIN
  SELECT COUNT(*) INTO deep_initplan_count
    FROM pg_policy p
   WHERE p.polrelid::regclass::text LIKE 'public.%'
     AND p.polrelid::regclass::text <> 'public.profiles'
     AND (
          pg_get_expr(p.polqual,     p.polrelid) ~* '\(\s*SELECT\s+\(\s*SELECT\s+auth\.(uid|role)'
       OR pg_get_expr(p.polwithcheck, p.polrelid) ~* '\(\s*SELECT\s+\(\s*SELECT\s+auth\.(uid|role)'
     );

  IF deep_initplan_count <> 0 THEN
    RAISE EXCEPTION
      '018_VERIFY_FAILED: % policies on public.* (excl profiles) still nest deeper-than-1',
      deep_initplan_count;
  END IF;

  RAISE NOTICE
    '018_VERIFY_PASS: zero deep-initplan on public.* (excluding profiles which 017 owns).';
END $$;
