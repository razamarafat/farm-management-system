// =====================================================================
// services/export-api/perf-budget.mjs
//
// Env-gated per-RPC performance budget test. Measures wall-clock
// response time for every reporting_* RPC under a representative
// empty/minimal filter set and asserts the p95 latency stays under
// the budget declared in each report's `perfBudget.p95Ms`.
//
// Skip-gate: identical to reconciliation-test.mjs — exits 0 with a
// "skipped" banner when SUPABASE_TEST_URL + SUPABASE_TEST_JWT are
// not both set.
//
// Methodology:
//   - 1 warm-up call (data path not benchmarked; populates SQL plan cache).
//   - N=COUNTS timed calls, wall-clock measured.
//   - p50, p95, p99 reported; p95 is the primary budget assertion.
//
// Exit codes:
//   0 — all budgets held (or skip-gate honored)
//   1 — at least one budget breached (with which RPC + p95 actual)
//   3 — env was set but RPC unreachable for a required RPC
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { reportRegistry } from './registry.mjs';

const SUPABASE_URL = process.env.SUPABASE_TEST_URL || process.env.SUPABASE_URL;
const SUPABASE_JWT = process.env.SUPABASE_TEST_JWT || process.env.TEST_JWT;
const SUPABASE_KEY =
  process.env.SUPABASE_TEST_ANON_KEY
  || process.env.SUPABASE_ANON_KEY
  || SUPABASE_JWT;

if (!SUPABASE_URL || !SUPABASE_JWT || !SUPABASE_KEY) {
  console.log('===========================================');
  console.log('[perf-budget] skipped.');
  console.log('SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, and SUPABASE_TEST_JWT are not all set.');
  process.exit(0);
}

// Hard-coded sane budgets in milliseconds. Reports opt-in via
// perfBudget.p95Ms in registry.mjs; when missing, this fallback
// runs the benchmark but does not assert.
const FALLBACK_BUDGETS = {
  RPT_INVENTORY_VALUATION_SUMMARY: { p95Ms: 2000 },
  RPT_INVENTORY_LEDGER:            { p95Ms: 8000 },
  RPT_CONSUMPTION_ANALYTICS:       { p95Ms: 3000 },
  RPT_INVENTORY_AGING:             { p95Ms: 2000 },
  RPT_PARETO_CLASSIFICATION:       { p95Ms: 2000 },
  RPT_SUPPLIERS:                   { p95Ms: 1500 },
};

// Read the budget for a given reportId from the registry when present;
// otherwise consult FALLBACK_BUDGETS as a defensive default. Both
// paths are evaluated against the same perfBudget surface — the
// registry is the source of truth, FALLBACK_BUDGETS is the safety net
// for new reports that haven't been registered with a budget yet.
function budgetFor(reportId) {
  const fromRegistry = reportRegistry[reportId]?.perfBudget?.p95Ms;
  if (Number.isFinite(fromRegistry) && fromRegistry > 0) return fromRegistry;
  return FALLBACK_BUDGETS[reportId]?.p95Ms;
}

// Per-report minimal filter payloads. Small enough to return under
// 200 rows = the "representative dataset" referenced in the spec.
const FILTER_ARGS = {
  RPT_INVENTORY_VALUATION_SUMMARY: { p_as_of: new Date().toISOString().slice(0, 10) },
  RPT_INVENTORY_LEDGER:            { p_date_from: daysAgo(60), p_date_to: daysAgo(0),
                                     p_limit: 500 },
  RPT_CONSUMPTION_ANALYTICS:       { p_date_from: daysAgo(28), p_date_to: daysAgo(0),
                                     p_group_by: 'item' },
  RPT_INVENTORY_AGING:             { p_as_of: new Date().toISOString().slice(0, 10) },
  RPT_PARETO_CLASSIFICATION:       { p_date_from: daysAgo(28), p_date_to: daysAgo(0),
                                     p_basis: 'value' },
  RPT_SUPPLIERS:                   {},
};

function daysAgo(d) {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() - d);
  return t.toISOString().slice(0, 10);
}

// Per-report RPC name. Kept here (not registry.mjs) so this script
// remains runnable even if registry is empty.
const RPC = {
  RPT_INVENTORY_VALUATION_SUMMARY: 'reporting_inventory_balance_as_of',
  RPT_INVENTORY_LEDGER:            'reporting_inventory_ledger',
  RPT_CONSUMPTION_ANALYTICS:       'reporting_consumption_summary',
  RPT_INVENTORY_AGING:             'reporting_inventory_aging',
  RPT_PARETO_CLASSIFICATION:       'reporting_pareto_classification',
  RPT_SUPPLIERS:                   'reporting_suppliers_list',
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: { headers: { Authorization: `Bearer ${SUPABASE_JWT}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, label) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(label);
    console.error(`  ✖ ${label}`);
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

async function timeCall(rpcName, args) {
  const start = process.hrtime.bigint();
  const { error } = await supabase.rpc(rpcName, args);
  const end = process.hrtime.bigint();
  if (error) {
    throw new Error(`RPC ${rpcName} failed: ${error.message}`);
  }
  return Number(end - start) / 1_000_000; // ms
}

async function benchmarkReport(reportId, count = 5) {
  const rpcName = RPC[reportId];
  if (!rpcName) {
    assert(false, `known RPC for ${reportId}`);
    return;
  }
  const args = FILTER_ARGS[reportId] || {};
  console.log(`\n— ${reportId} (${rpcName}, N=${count}) —`);
  // Warm-up — discarded.
  try {
    await timeCall(rpcName, args);
  } catch (err) {
    assert(false, `${reportId} warm-up callable: ${err.message}`);
    return;
  }
  const samples = [];
  for (let i = 0; i < count; i += 1) {
    try {
      const ms = await timeCall(rpcName, args);
      samples.push(ms);
    } catch (err) {
      assert(false, `${reportId} timed call #${i + 1}: ${err.message}`);
      return;
    }
  }
  samples.sort((a, b) => a - b);
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const p99 = percentile(samples, 99);
  console.log(
    `  samples=${samples.map((s) => s.toFixed(0)).join(', ')} ms | `
    + `p50=${p50.toFixed(0)}ms p95=${p95.toFixed(0)}ms p99=${p99.toFixed(0)}ms`,
  );
  const budget = budgetFor(reportId);
  if (Number.isFinite(budget)) {
    assert(p95 <= budget,
      `${reportId} p95 ≤ ${budget}ms (got ${p95.toFixed(0)}ms)`);
  } else {
    console.log(`  ℹ no budget declared for ${reportId}; reporting only.`);
    passed += 1;
  }
}

(async () => {
  console.log('Performance budget test (perf-budget.mjs)');
  console.log('==========================================');
  // Walk the REGISTRY (not FALLBACK_BUDGETS) so any future report
  // automatically picks up its declared perfBudget. The fallback loop
  // still runs if a newer report has no registry entry yet.
  const allIds = new Set([
    ...Object.keys(reportRegistry),
    ...Object.keys(FALLBACK_BUDGETS),
  ]);
  for (const reportId of Array.from(allIds).sort()) {
    await benchmarkReport(reportId, 5);
  }
  console.log('\n==========================================');
  console.log(`PASS: ${passed}  FAIL: ${failed}`);
  if (failed > 0) {
    console.error('Failed budget assertions:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log('All performance budgets held.');
})().catch((err) => {
  console.error('Perf-budget test crashed:', err);
  process.exit(3);
});
