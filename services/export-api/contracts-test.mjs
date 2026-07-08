// =====================================================================
// services/export-api/contracts-test.mjs
//
// Pure-Node registry contract validator. Runs in CI WITHOUT any
// Supabase credentials — asserts that every entry in `reportRegistry`
// satisfies the static invariants the SPA + export-API depend on:
//
//   • unique + non-empty column keys and headers
//   • column.type (if set) is one of NUMERIC_FORMATS keys
//   • allowedRoles ⊆ {admin, supervisor, operator}, non-empty
//   • rpcName starts with "reporting_" (DB convention)
//   • mapFilters is callable and returns an object
//   • opt-in fields (totalsColumns, lowStockColumn, reconcileColumn,
//     topN.columns, rawSheetName, analysisSheetName) reference real
//     column keys when applicable
//
// Run:
//   node contracts-test.mjs
// Hard exit 1 on any violation. CI fails with readable message.
// =====================================================================

import { reportRegistry } from './registry.mjs';
import { NUMERIC_FORMATS, COLUMN_TYPES } from './xlsx-template.mjs';

const VALID_ROLES = new Set(['admin', 'supervisor', 'operator']);
const VALID_TYPES = new Set(Object.keys(NUMERIC_FORMATS));

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

// Run contract tests for every registered report.
function runContract(reportId, def) {
  console.log(`\n— ${reportId} —`);

  // (1) rpcName convention.
  assert(typeof def.rpcName === 'string' && def.rpcName.startsWith('reporting_'),
    `rpcName starts with "reporting_" (got "${def.rpcName}")`);

  // (2) sheetName non-empty.
  assert(typeof def.sheetName === 'string' && def.sheetName.length > 0,
    `sheetName non-empty (got "${def.sheetName}")`);

  // (3) title non-empty.
  assert(typeof def.title === 'string' && def.title.length > 0,
    `title non-empty (got "${def.title}")`);

  // (4) allowedRoles ⊆ VALID_ROLES, non-empty.
  assert(Array.isArray(def.allowedRoles)
      && def.allowedRoles.length > 0
      && def.allowedRoles.every((r) => VALID_ROLES.has(r)),
    `allowedRoles ⊆ admin|supervisor|operator, non-empty (got ${JSON.stringify(def.allowedRoles)})`);

  // (5) columns non-empty array of {key,header} objects.
  assert(Array.isArray(def.columns) && def.columns.length > 0,
    `columns is non-empty array (got ${typeof def.columns})`);

  // (6) column keys: non-empty + unique.
  const keys = def.columns.map((c) => c.key);
  const uniqueKeys = new Set(keys);
  assert(keys.every((k) => typeof k === 'string' && k.length > 0),
    `column keys are non-empty strings`);
  assert(uniqueKeys.size === keys.length,
    `column keys are unique (duplicates: ${
      keys.filter((k, i) => keys.indexOf(k) !== i).join(', ') || 'none'
    })`);

  // (7) column headers: non-empty + unique.
  const headers = def.columns.map((c) => c.header);
  const uniqueHeaders = new Set(headers);
  assert(headers.every((h) => typeof h === 'string' && h.length > 0),
    `column headers are non-empty strings`);
  assert(uniqueHeaders.size === headers.length,
    `column headers are unique (duplicates: ${
      headers.filter((h, i) => headers.indexOf(h) !== i).join(', ') || 'none'
    })`);

  // (8) column.type (if present) is valid.
  def.columns.forEach((c, i) => {
    if (c.type === undefined) return;
    assert(VALID_TYPES.has(c.type),
      `column[${i}] (key="${c.key}") type ⊆ NUMERIC_FORMATS keys (got "${c.type}")`);
  });

  // (9) mapFilters is callable.
  assert(typeof def.mapFilters === 'function',
    `mapFilters is a function (got ${typeof def.mapFilters})`);

  if (typeof def.mapFilters === 'function') {
    let result;
    try {
      result = def.mapFilters({});
    } catch (err) {
      assert(false, `mapFilters({}) does not throw (got: ${err.message})`);
      result = null;
    }
    if (result !== null) {
      assert(result && typeof result === 'object' && !Array.isArray(result),
        `mapFilters({}) returns a plain object (got ${typeof result})`);
    }
  }

  // (10) totalsColumns (if present) is a subset of column keys.
  if (def.totalsColumns !== undefined) {
    assert(Array.isArray(def.totalsColumns),
      `totalsColumns is an array (got ${typeof def.totalsColumns})`);
    if (Array.isArray(def.totalsColumns)) {
      const unknownTotals = def.totalsColumns.filter((k) => !uniqueKeys.has(k));
      assert(unknownTotals.length === 0,
        `totalsColumns keys ⊆ columns.keys (unknown: ${
          unknownTotals.join(', ') || 'none'
        })`);
    }
  }

  // (11) reconcileColumn.column (if present) is a real column key.
  if (def.reconcileColumn !== undefined) {
    assert(def.reconcileColumn && typeof def.reconcileColumn === 'object',
      `reconcileColumn is an object`);
    if (def.reconcileColumn) {
      assert(uniqueKeys.has(def.reconcileColumn.column),
        `reconcileColumn.column ⊆ columns.keys (got "${def.reconcileColumn.column}")`);
    }
  }

  // (12) lowStockColumn + lowBalanceColumn (if present) are real keys.
  ['lowStockColumn', 'lowBalanceColumn'].forEach((field) => {
    if (def[field] === undefined) return;
    assert(typeof def[field] === 'string' && uniqueKeys.has(def[field]),
      `${field} ⊆ columns.keys (got "${def[field]}")`);
  });

  // (13) lowStockThreshold (if lowStockColumn set) is a non-negative number.
  if (def.lowStockColumn !== undefined) {
    assert(Number.isFinite(def.lowStockThreshold)
        && def.lowStockThreshold >= 0,
      `lowStockThreshold is a non-negative number when lowStockColumn is set (got ${
        JSON.stringify(def.lowStockThreshold)
      })`);
  }

  // (14) topN (if present) is well-formed.
  if (def.topN !== undefined) {
    assert(def.topN && typeof def.topN === 'object',
      `topN is an object`);
    if (def.topN) {
      assert(typeof def.topN.column === 'string' && uniqueKeys.has(def.topN.column),
        `topN.column ⊆ columns.keys (got "${def.topN.column}")`);
      assert(Number.isFinite(def.topN.n) && def.topN.n > 0,
        `topN.n is a positive number (got ${def.topN.n})`);
      assert(Array.isArray(def.topN.columns)
          && def.topN.columns.every((k) => uniqueKeys.has(k)),
        `topN.columns every entry ⊆ columns.keys (got ${JSON.stringify(def.topN.columns)})`);
    }
  }

  // (15) parametersOrder (if present) is non-empty array of strings.
  if (def.parametersOrder !== undefined) {
    assert(Array.isArray(def.parametersOrder)
        && def.parametersOrder.length > 0
        && def.parametersOrder.every((v) => typeof v === 'string'),
      `parametersOrder is non-empty string array (got ${JSON.stringify(def.parametersOrder)})`);
  }

  // (16) streamingThreshold / maxRows (if present) are positive integers.
  ['streamingThreshold', 'maxRows'].forEach((field) => {
    if (def[field] === undefined) return;
    assert(Number.isInteger(def[field]) && def[field] > 0,
      `${field} is a positive integer (got ${def[field]})`);
  });

  // (17) multi-sheet kind checks.
  if (def.kind === 'multi-sheet') {
    assert(typeof def.rawSheetName === 'string' && def.rawSheetName.length > 0,
      `kind:multi-sheet rawSheetName non-empty (got "${def.rawSheetName}")`);
    assert(typeof def.analysisSheetName === 'string' && def.analysisSheetName.length > 0,
      `kind:multi-sheet analysisSheetName non-empty (got "${def.analysisSheetName}")`);
    assert(Array.isArray(def.analysisColumns) && def.analysisColumns.length > 0,
      `kind:multi-sheet analysisColumns is non-empty array`);
    if (Array.isArray(def.analysisColumns)) {
      const analysisKeys = def.analysisColumns.map((c) => c.key);
      const aUnique = new Set(analysisKeys);
      assert(aUnique.size === analysisKeys.length,
        `analysisColumns keys are unique (got ${analysisKeys.join(', ')})`);
      def.analysisColumns.forEach((c) => {
        if (c.type === undefined) return;
        assert(VALID_TYPES.has(c.type),
          `analysisColumn key="${c.key}" type ⊆ NUMERIC_FORMATS keys (got "${c.type}")`);
      });
    }
    assert(Number.isFinite(def.varianceThreshold)
        && def.varianceThreshold >= 0
        && def.varianceThreshold <= 1,
      `varianceThreshold ∈ [0,1] when multi-sheet (got ${def.varianceThreshold})`);
  } else if (def.kind !== undefined) {
    assert(false, `kind is "multi-sheet" or undefined (got "${def.kind}")`);
  }

  // (18) perfBudget (if present) has positive p95Ms.
  if (def.perfBudget !== undefined) {
    assert(def.perfBudget && Number.isFinite(def.perfBudget.p95Ms)
        && def.perfBudget.p95Ms > 0,
      `perfBudget.p95Ms is a positive number (got ${JSON.stringify(def.perfBudget)})`);
  }
}

console.log('Registry contract test (contracts-test.mjs)');
console.log('===========================================');
const reportIds = Object.keys(reportRegistry);
if (reportIds.length === 0) {
  console.error('  ✖ reportRegistry is empty');
  failed += 1;
  failures.push('reportRegistry is empty');
} else {
  console.log(`Checking ${reportIds.length} reports…`);
  for (const id of reportIds) {
    runContract(id, reportRegistry[id]);
  }
  // Cross-cutting: every role that exists has at least one report allowing it.
  // (Not strictly required, but a UX hint worth surfacing.)
  const usedRoles = new Set();
  Object.values(reportRegistry).forEach((def) => {
    def.allowedRoles.forEach((r) => usedRoles.add(r));
  });
  console.log(`Roles currently used: ${Array.from(usedRoles).join(', ')}`);
}

console.log('\n===========================================');
console.log(`PASS: ${passed}  FAIL: ${failed}`);
if (failed > 0) {
  console.error('Failed contract assertions:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log('All report contracts hold.');
