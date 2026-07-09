#!/usr/bin/env node
/**
 * check-supabase-advisor.mjs
 * --------------------------------------------------------------
 * Pure read-only Supabase Advisor audit.
 *
 * Reads every lint from BOTH /advisors/security and /advisors/performance
 * for the configured project and emits a sorted, severity-grouped triage.
 *
 * Usage:
 *   PAT=<pat>          ./scripts/check-supabase-advisor.mjs bjrzrmbqwalzqolvzioq
 *   PAT=<pat> PROJECT_REF=<ref> ./scripts/check-supabase-advisor.mjs
 *
 * Non-zero exit (1) when any ERROR-level lint is found.
 * Zero exit when all findings are WARN or INFO only.
 * --------------------------------------------------------------
 */

const PAT = process.env.PAT;
const PROJECT_REF = process.argv[2] || process.env.PROJECT_REF;

if (!PAT) {
  console.error('FATAL: PAT env var is required');
  process.exit(2);
}
if (!PROJECT_REF) {
  console.error('FATAL: pass project ref as argv[2] or set PROJECT_REF');
  process.exit(2);
}

const MGMT = `https://api.supabase.com/v1/projects/${PROJECT_REF}`;
const DB   = `${MGMT}/database/query`;

const LEVEL_SEVERITY = { ERROR: 3, WARN: 2, INFO: 1 };

async function fetchAdvisor(category) {
  const url = `${MGMT}/advisors/${category}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    console.error(`FATAL: ${category} advisor GET ${url} -> ${res.status}`);
    process.exit(2);
  }
  const body = await res.json();
  return body.lints || [];
}

async function dbQuery(sql) {
  const res = await fetch(DB, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    console.error(`FATAL: db query ${res.status} -> ${await res.text()}`);
    return [];
  }
  return await res.json();
}

function summarizeBy(arr, keyFn) {
  const out = {};
  for (const x of arr) {
    const k = keyFn(x);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function printReport(label, lints) {
  console.log(`\n=== ${label} (${lints.length} lints) ===`);
  const byLevel = summarizeBy(lints, (l) => l.level);
  console.log('  by level:  ' + JSON.stringify(byLevel));
  const byName = summarizeBy(lints, (l) => l.name);
  const sortedNames = Object.entries(byName).sort((a, b) => b[1] - a[1]);
  console.log('  by name (sorted desc):');
  for (const [name, count] of sortedNames) {
    const levels = lints.filter((l) => l.name === name).map((l) => l.level);
    console.log(`    ${count.toString().padStart(4)}x  ${name.padEnd(34)}  levels=${levels.join(',')}`);
  }
  console.log(`\n  -- full finding list (sorted by severity then name) --`);
  const sorted = [...lints].sort((a, b) => {
    const sev = (LEVEL_SEVERITY[b.level] || 0) - (LEVEL_SEVERITY[a.level] || 0);
    return sev !== 0 ? sev : a.name.localeCompare(b.name);
  });
  for (const l of sorted) {
    const obj = l.metadata?.obj || '(no metadata.obj)';
    console.log(`  [${l.level.padEnd(5)}] ${l.name.padEnd(30)} ${obj}`);
    const desc = (l.description || '').split('\n')[0].slice(0, 120);
    if (desc) console.log(`           ${desc}`);
  }
}

(async () => {
  const [sec, perf, ext, fkeys, indexes] = await Promise.all([
    fetchAdvisor('security'),
    fetchAdvisor('performance'),
    dbQuery(
      `SELECT extname, nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE extname NOT IN ('plpgsql') ORDER BY extname`
    ),
    dbQuery(
      `SELECT c.conrelid::regclass::text AS table_name, c.conname AS fk_name, c.confrelid::regclass::text AS ref_table,
              (SELECT string_agg(a.attname, ',' ORDER BY k.i)
                 FROM unnest(c.conkey) WITH ORDINALITY k(i,a)
                 JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.a) AS fk_cols
         FROM pg_constraint c
        WHERE c.contype='f' AND c.connamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')`
    ),
    dbQuery(
      `SELECT s.schemaname, c.relname AS tablename, s.indexrelname AS indexname, s.idx_scan
         FROM pg_stat_user_indexes s
         JOIN pg_index i ON i.indexrelid = s.indexrelid
         JOIN pg_class c ON c.oid = s.relid
        WHERE s.schemaname='public'
        ORDER BY s.idx_scan ASC, s.indexrelname`
    ),
  ]);

  printReport('SECURITY', sec);
  printReport('PERFORMANCE', perf);

  console.log('\n=== DB STRUCTURE HELPERS ===');
  console.log(`  extensions installed (non-plpgsql): ${ext.length}`);
  ext.forEach((r) => console.log(`    ${r.extname} @ ${r.schema}`));

  console.log(`  foreign keys in public: ${fkeys.length}`);
  fkeys.forEach((r) => console.log(`    ${r.table_name}.${(r.fk_cols || '?')} -> ${r.ref_table}`));

  console.log(`  indexes in public: ${indexes.length}`);
  indexes.slice(0, 20).forEach((r) => console.log(`    idx_scan=${String(r.idx_scan).padStart(6)}  ${r.indexname} on ${r.schemaname}.${r.tablename}`));

  const errors = [...sec, ...perf].filter((l) => l.level === 'ERROR');
  console.log(`\n=== SUMMARY ===`);
  console.log(`  security total=${sec.length}  performance total=${perf.length}  errors across both=${errors.length}`);
  process.exit(errors.length > 0 ? 1 : 0);
})();
