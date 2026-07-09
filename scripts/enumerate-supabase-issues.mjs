#!/usr/bin/env node
/**
 * enumerate-supabase-issues.mjs
 * --------------------------------------------------------------
 * Read-only Supabase catalog enumeration.
 *
 * Cross-references every concrete DB object (function, view, RLS policy, index,
 * FK, storage bucket) against the categories the Supabase Advisor checks for.
 *
 * Emits services/export-api/_supabase-issues.json with one entry per advisor
 * name → array of {schema,name[,kind][,...]} objects.
 *
 * Usage:
 *   PAT=<pat> ./scripts/enumerate-supabase-issues.mjs bjrzrmbqwalzqolvzioq
 * --------------------------------------------------------------
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PAT = process.env.PAT;
const PROJECT_REF = process.argv[2] || process.env.PROJECT_REF;
if (!PAT || !PROJECT_REF) {
  console.error('FATAL: PAT and project ref are required');
  process.exit(2);
}

const MGMT = `https://api.supabase.com/v1/projects/${PROJECT_REF}`;
const DB = `${MGMT}/database/query`;
const OUT = join('services/export-api', '_supabase-issues.json');
mkdirSync(dirname(OUT), { recursive: true });

async function dbQuery(sql) {
  const res = await fetch(DB, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`db query ${res.status}: ${txt}`);
  }
  return await res.json();
}

const queries = {
  // --- SECURITY ---
  secdef_functions: `
    SELECT n.nspname AS schema,
           p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args,
           'function' AS kind,
           CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'EXEC_BY_ANON' ELSE '' END AS anon_exec,
           CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'EXEC_BY_AUTH' ELSE '' END AS auth_exec
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prosecdef = true
       AND n.nspname = 'public'
     ORDER BY p.proname`,

  search_path_mutable_functions: `
    SELECT n.nspname AS schema,
           p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args,
           'function' AS kind,
           p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND (p.proconfig IS NULL
            OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
     ORDER BY p.proname`,

  secdef_views: `
    SELECT n.nspname AS schema,
           c.relname AS name,
           'view' AS kind,
           c.reloptions
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'v'
       AND n.nspname = 'public'
       AND (c.reloptions IS NULL
            OR NOT EXISTS (SELECT 1 FROM unnest(c.reloptions) o WHERE o = 'security_invoker=true'))
     ORDER BY c.relname`,

  rls_policy_always_true: `
    SELECT schemaname AS schema,
           tablename AS table_name,
           policyname AS policy,
           cmd,
           qual AS using_expr,
           with_check AS with_check_expr,
           'policy' AS kind
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (qual IS NOT NULL AND btrim(qual) ~* '^true\\s*$' AND cmd IN ('ALL','SELECT','UPDATE','DELETE','INSERT')
            OR with_check IS NOT NULL AND btrim(with_check) ~* '^true\\s*$' AND cmd IN ('ALL','UPDATE','INSERT'))
     ORDER BY tablename, policyname`,

  public_buckets: `
    SELECT id AS name,
           'bucket' AS kind,
           public
      FROM storage.buckets
     WHERE public = true
     ORDER BY id`,

  storage_policies_select_true: `
    SELECT policyname AS policy,
           'storage_policy' AS kind,
           cmd,
           qual
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND cmd = 'SELECT'
       AND qual IS NOT NULL AND btrim(qual) ~* '^true\\s*$'
     ORDER BY policyname`,

  graphql_exposed_tables: `
    -- pg_graphql exposes anything in the public schema by default. We check
    -- whether each public table is opted OUT via a permission row.
    SELECT n.nspname AS schema,
           c.relname AS name,
           'table' AS kind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND n.nspname = 'public'
       AND NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_event_trigger ev
          WHERE ev.evtenabled = 'A'
            AND ev.evtname    = 'supabase_pg_graphql_block'
       )
     ORDER BY c.relname`,

  // --- PERFORMANCE ---
  fk_without_index: `
    SELECT c.conrelid::regclass::text AS table_name,
           c.conname AS fk_name,
           (SELECT string_agg(a.attname, ',' ORDER BY k.i)
              FROM unnest(c.conkey) WITH ORDINALITY k(i,a)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.a) AS fk_cols,
           c.confrelid::regclass::text AS ref_table,
           'fk' AS kind,
           NOT EXISTS (
             SELECT 1 FROM pg_index i
              WHERE i.indrelid = c.conrelid
                AND i.indkey::int2[] = c.conkey::int2[]
                AND i.indexprs IS NULL
                AND i.indisunique = false
           ) AS missing_index
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
     ORDER BY table_name`,

  unused_indexes: `
    SELECT s.schemaname AS schema,
           s.relname AS table_name,
           s.indexrelname AS indexname,
           'index' AS kind,
           pg_get_indexdef(s.indexrelid) AS definition,
           s.idx_scan
      FROM pg_stat_user_indexes s
      JOIN pg_index i ON i.indexrelid = s.indexrelid
     WHERE s.schemaname = 'public'
       AND s.idx_scan = 0
       AND NOT i.indisprimary
       AND NOT i.indisexclusion
       AND NOT i.indisunique  -- keep unique constraints even if unused
     ORDER BY s.relname, s.indexrelname`,

  duplicate_indexes: `
    WITH idx AS (
      SELECT i.indrelid::regclass::text AS table_name,
             i.indexrelid::regclass::text AS indexname,
             (i.indkey::text || COALESCE('|' || i.indexprs::text, '|noexpr') || COALESCE('|' || i.indpred::text, '|nopred')) AS sig
        FROM pg_index i
       WHERE NOT i.indisprimary AND NOT i.indisexclusion
    )
    SELECT table_name,
           array_agg(indexname ORDER BY indexname) AS indexnames,
           'dup' AS kind,
           MIN(sig) AS signature,
           COUNT(*) AS dup_count
      FROM idx
     GROUP BY table_name, sig
    HAVING COUNT(*) > 1
     ORDER BY table_name`,

  multiple_permissive_policies: `
    SELECT schemaname AS schema,
           tablename AS table_name,
           cmd,
           array_agg(policyname ORDER BY policyname) AS policies,
           'policies' AS kind,
           COUNT(*) AS count
      FROM pg_policies
     WHERE schemaname = 'public' AND cmd IS NOT NULL
     GROUP BY schemaname, tablename, cmd
    HAVING COUNT(*) > 1
     ORDER BY tablename, cmd`,

  auth_rls_initplan_candidates: `
    SELECT schemaname AS schema,
           tablename AS table_name,
           policyname AS policy,
           cmd,
           qual AS using_expr,
           with_check AS with_check_expr,
           'policy' AS kind,
           CASE
             WHEN qual ~* 'auth\\.uid\\s*\\(\\)'    THEN 'qual_has_auth_uid'
             WHEN qual ~* 'auth\\.role\\s*\\(\\)'  THEN 'qual_has_auth_role'
             WHEN qual ~* 'auth\\.jwt\\s*\\('       THEN 'qual_has_auth_jwt'
             ELSE 'qual_other'
           END AS qual_flag,
           CASE
             WHEN with_check ~* 'auth\\.uid\\s*\\(\\)'    THEN 'with_check_has_auth_uid'
             WHEN with_check ~* 'auth\\.role\\s*\\(\\)'  THEN 'with_check_has_auth_role'
             WHEN with_check ~* 'auth\\.jwt\\s*\\('       THEN 'with_check_has_auth_jwt'
             ELSE 'with_check_other'
           END AS with_check_flag
      FROM pg_policies
     WHERE schemaname = 'public'
       AND ((qual IS NOT NULL AND (qual ~* 'auth\\.uid\\s*\\(\\)' OR qual ~* 'auth\\.role\\s*\\(\\)' OR qual ~* 'auth\\.jwt\\s*\\('))
            OR (with_check IS NOT NULL AND (with_check ~* 'auth\\.uid\\s*\\(\\)' OR with_check ~* 'auth\\.role\\s*\\(\\)' OR with_check ~* 'auth\\.jwt\\s*\\(')))
     ORDER BY tablename, policyname`,
};

(async () => {
  const result = {};
  for (const [key, sql] of Object.entries(queries)) {
    try {
      const rows = await dbQuery(sql);
      result[key] = { count: rows.length, rows };
      console.log(`  ${key.padEnd(40)} count=${rows.length}`);
    } catch (e) {
      result[key] = { error: String(e.message || e) };
      console.log(`  ${key.padEnd(40)} ERROR`);
    }
  }
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`\nWrote ${OUT}`);
})();
