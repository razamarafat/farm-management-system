// =====================================================================
// src/utils/postgrestEscape.ts — escape user search text before PostgREST
// or()/ilike interpolation.
//
// postgrest-js passes filter values as-is (see node_modules
// @supabase/postgrest-js 2.110.3 dist/index.mjs: or()/ilike append the
// value verbatim to the query string). Raw keystrokes therefore break
// or() parsing (`, . ( ) " :`) or act as LIKE wildcards (`% _`).
// Escape the RAW term first, THEN wrap it in `%...%`.
//
// The LIKE escape character is the backslash (Postgres default, used by
// PostgREST); escape backslash FIRST so later escapes are not
// double-escaped. escapePostgrestOrValue additionally escapes the
// or() syntax characters; escapePostgrestLike is for plain
// .ilike(column, value) calls where postgrest-js param-passes the value
// and only LIKE wildcards need escaping.
// =====================================================================

/** Escape a raw search term for use inside a PostgREST `.or(...)` list value. */
export function escapePostgrestOrValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/[%_]/g, (m) => `\\${m}`)
    .replace(/[,.()":]/g, (m) => `\\${m}`);
}

/** Escape a raw search term for use as a plain `.ilike(column, value)` pattern. */
export function escapePostgrestLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[%_]/g, (m) => `\\${m}`);
}
