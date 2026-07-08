// =====================================================================
// services/export-api/template-test.mjs
//
// Self-test for the Excel Design System (xlsx-template.mjs).
//
// Scope: validate that EVERY .xlsx we ship is *correctly formed* —
// not that ExcelJS's read-back API matches every internal detail.
// The cases that matter for the operator in Excel:
//
//   - Workbook re-parses without throwing (no XML repair warnings).
//   - Workbook metadata (creator / company / title) is set.
//   - Sheet count matches expectation (1 default, 2 with dashboard).
//   - Sheet names are stable (Persian prefix on data, 'داشبورد' on dashboard).
//   - Header row carries the Persian column names from the registry.
//   - Body rows render with the expected row count.
//   - Frozen pane + rightToLeft view is set.
//   - SUM totals row exists on declared totalsColumns.
//   - Reconciliation row exists on declared reconcileColumn.
//   - Conditional formatting rules exist for ABC class column.
//   - Conditional formatting dataBar exists for aging column.
//
// ExcelJS's read-back path normalizes some properties (numFmt, autoFilter
// range, alignment readingOrder) inconsistently between in-memory and
// post-load states. We deliberately do NOT couple to those surface
// details — the workbook is correct if ExcelJS can WRITE it AND Excel
// can OPEN it. The first half is asserted below via reparse; the
// second is owned by Excel/LibreOffice downstream.
//
// Pure Node. No Supabase. No network:
//   node template-test.mjs
//   OUTPUT=/tmp/xlsx-blobs node template-test.mjs   # also writes blobs
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

import { reportRegistry } from './registry.mjs';
import { buildReportWorkbook, buildMultiReportWorkbook } from './xlsx-template.mjs';

const OUTPUT_DIR = process.env.OUTPUT || '';
const KEEP_BLOBS = OUTPUT_DIR !== '';

// ---------------------------------------------------------------------
// Fixtures — small mock reports (no DB) so we can exercise every
// totalsColumn / conditional-formatting / dashboard branch.
// ---------------------------------------------------------------------
const FIXTURE_REPORTS = {
  RPT_INVENTORY_VALUATION_SUMMARY: [
    { farm_name: 'فارم ۱', item_name: 'ذرت', item_category: 'feed',
      item_unit: 'kg', on_hand_qty: 1200, unit_cost: 28000,
      value_rial: 33600000, priced_on: '2026-06-01' },
    { farm_name: 'فارم ۱', item_name: 'سویا', item_category: 'feed',
      item_unit: 'kg', on_hand_qty: 800, unit_cost: 42000,
      value_rial: 33600000, priced_on: '2026-06-01' },
    { farm_name: 'فارم ۲', item_name: 'کنجاله', item_category: 'feed',
      item_unit: 'kg', on_hand_qty: 450, unit_cost: 18500,
      value_rial: 8325000, priced_on: '2026-05-28' },
  ],

  // 12 rows so the top-10 block can be exercised; values sorted by a
  // server-side sort by value_rial DESC. on_hand_qty column has a mix
  // of under-threshold (≤ 10) and over-threshold rows so the
  // lowStock cellIs rule gets rows in either bucket.
  RPT_INVENTORY_VALUATION_SUMMARY_BIG: [
    { farm_name: 'فارم ۱', item_name: 'کالا۱', item_category: 'feed',
      item_unit: 'kg', on_hand_qty: 1500, unit_cost: 30000,
      value_rial: 45000000, priced_on: '2026-06-01' },
    { farm_name: 'فارم ۱', item_name: 'کالا۲', item_category: 'feed',
      item_unit: 'kg', on_hand_qty: 8, unit_cost: 40000,
      value_rial: 40000000, priced_on: '2026-06-01' },
    { farm_name: 'فارم ۲', item_name: 'کالا۳', item_category: 'feed',
      item_unit: 'kg', on_hand_qty: 1000, unit_cost: 35000,
      value_rial: 35000000, priced_on: '2026-05-28' },
    { farm_name: 'فارم ۱', item_name: 'کالا۴', item_category: 'bedding',
      item_unit: 'kg', on_hand_qty: 600, unit_cost: 50000,
      value_rial: 30000000, priced_on: '2026-05-30' },
    { farm_name: 'فارم ۲', item_name: 'کالا۵', item_category: 'feed',
      item_unit: 'kg', on_hand_qty: 9, unit_cost: 22000,
      value_rial: 27500000, priced_on: '2026-06-02' },
    { farm_name: 'فارم ۱', item_name: 'کالا۶', item_category: 'medicine',
      item_unit: 'l', on_hand_qty: 250, unit_cost: 100000,
      value_rial: 25000000, priced_on: '2026-05-25' },
    { farm_name: 'فارم ۲', item_name: 'کالا۷', item_category: 'feed',
      item_unit: 'kg', on_hand_qty: 7, unit_cost: 30000,
      value_rial: 21000000, priced_on: '2026-06-01' },
    { farm_name: 'فارم ۱', item_name: 'کالا۸', item_category: 'medicine',
      item_unit: 'l', on_hand_qty: 100, unit_cost: 180000,
      value_rial: 18000000, priced_on: '2026-05-29' },
    { farm_name: 'فارم ۲', item_name: 'کالا۹', item_category: 'feed',
      item_unit: 'kg', on_hand_qty: 800, unit_cost: 21000,
      value_rial: 16800000, priced_on: '2026-05-27' },
    { farm_name: 'فارم ۱', item_name: 'کالا۱۰', item_category: 'bedding',
      item_unit: 'kg', on_hand_qty: 5, unit_cost: 3000000,
      value_rial: 15000000, priced_on: '2026-05-22' },
    { farm_name: 'فارم ۲', item_name: 'کالا۱۱', item_category: 'feed',
      item_unit: 'kg', on_hand_qty: 700, unit_cost: 20000,
      value_rial: 14000000, priced_on: '2026-05-21' },
    { farm_name: 'فارم ۱', item_name: 'کالا۱۲', item_category: 'feed',
      item_unit: 'kg', on_hand_qty: 600, unit_cost: 22000,
      value_rial: 13200000, priced_on: '2026-05-20' },
  ],

  RPT_INVENTORY_LEDGER: [
    { txn_date: '2026-06-01', txn_type: 'purchase', farm_name: 'فارم ۱',
      item_name: 'ذرت', item_unit: 'kg',
      qty_in: 500, qty_out: 0, unit_price: 28000, total_price: 14000000,
      prior_balance: 0, running_balance: 500, reference_no: 'PO-001',
      supplier_name: 'تأمین الف' },
    { txn_date: '2026-06-02', txn_type: 'consumption', farm_name: 'فارم ۱',
      item_name: 'ذرت', item_unit: 'kg',
      qty_in: 0, qty_out: 120, unit_price: null, total_price: null,
      prior_balance: 500, running_balance: 380, reference_no: 'V-1001',
      supplier_name: null },
  ],

  RPT_CONSUMPTION_ANALYTICS: [
    // Multi-day/category fixture covering feed + medicine. The waste
    // ratio on ذرت-supp (30/80 = 0.375) exceeds the 15% threshold so
    // the variance_flag column triggers on that category, exercising
    // the warn branch.
    { group_key: 'corn-uuid',  group_label: 'ذرت',       item_category: 'feed',
      consumed_qty: 200, waste_qty: 5,  total_qty: 205, voucher_count: 3 },
    { group_key: 'soy-uuid',   group_label: 'مکمل سویا',  item_category: 'feed',
      consumed_qty: 50,  waste_qty: 30, total_qty: 80,  voucher_count: 2 },
    { group_key: 'med-uuid',   group_label: 'ویتامین',   item_category: 'medicine',
      consumed_qty: 20,  waste_qty: 0,  total_qty: 20,  voucher_count: 1 },
  ],

  RPT_INVENTORY_AGING: [
    { farm_name: 'فارم ۱', item_name: 'ذرت قدیمی', item_unit: 'kg',
      on_hand_qty: 220, last_movement_date: '2026-01-10',
      days_since_last_movement: 134, age_bucket: '90+',
      unit_cost: 27000, value_rial: 5940000, dead_stock: true },
    { farm_name: 'فارم ۲', item_name: 'سویا', item_unit: 'kg',
      on_hand_qty: 60, last_movement_date: '2026-05-30',
      days_since_last_movement: 24, age_bucket: '0-30',
      unit_cost: 42000, value_rial: 2520000, dead_stock: false },
  ],

  RPT_PARETO_CLASSIFICATION: [
    { item_name: 'ذرت', farm_name: 'فارم ۱', item_unit: 'kg',
      period_qty: 1500, basis_metric: 42000000,
      share_pct: 45, cumulative_share_pct: 45,
      abc_class: 'A', on_hand_qty: 220, reorder_point: 200,
      avg_daily_consumption: 50, reorder_recommended: true },
    { item_name: 'سویا', farm_name: 'فارم ۱', item_unit: 'kg',
      period_qty: 900, basis_metric: 27000000,
      share_pct: 29, cumulative_share_pct: 74,
      abc_class: 'B', on_hand_qty: 150, reorder_point: 180,
      avg_daily_consumption: 30, reorder_recommended: false },
    { item_name: 'مکمل ویتامینه', farm_name: 'فارم ۱', item_unit: 'kg',
      period_qty: 80, basis_metric: 12000000,
      share_pct: 13, cumulative_share_pct: 87,
      abc_class: 'B', on_hand_qty: 18, reorder_point: 40,
      avg_daily_consumption: 4, reorder_recommended: true },
    { item_name: 'نمک', farm_name: 'فارم ۱', item_unit: 'kg',
      period_qty: 30, basis_metric: 9000000,
      share_pct: 10, cumulative_share_pct: 97,
      abc_class: 'C', on_hand_qty: 12, reorder_point: 10,
      avg_daily_consumption: 1, reorder_recommended: false },
  ],

  RPT_SUPPLIERS: [
    // Active supplier with rich purchase history — exercises the
    // numeric columns (usage_count, total_purchases_rial) and the
    // date columns (first_purchase_date, last_purchase_date).
    { supplier_id: '8ff31c0e-fb89-4a01-8e11-000000000001',
      name: 'خوراک دام زرین',
      status: 'فعال',
      usage_count: 24, total_purchases_rial: 450000000,
      first_purchase_date: '2025-01-01',
      last_purchase_date: '2026-06-01',
      farm_count: 2,
      created_by_username: 'admin',
      created_at: '2025-01-01T10:00:00Z' },
    // Inactive supplier with sparse history — exercises the COALESCE
    // fallbacks to 0 on stats-side NULLs (no txns since 2025-03).
    { supplier_id: '9de50e0e-af23-4b02-9e22-000000000002',
      name: 'شرکت دارویی بهبود',
      status: 'غیرفعال',
      usage_count: 3, total_purchases_rial: 12000000,
      first_purchase_date: '2025-02-15',
      last_purchase_date: '2025-03-10',
      farm_count: 1,
      created_by_username: 'operator',
      created_at: '2025-02-10T12:00:00Z' },
    // Active supplier with NO purchase history — exercises the
    // LEFT JOIN path: usage_count/total/first/last/farm_count all
    // fall through to COALESCE zer0 / NULL.
    { supplier_id: '1aa88b0e-bc45-4c03-af33-000000000003',
      name: 'نهاده‌های شرق',
      status: 'فعال',
      usage_count: 0, total_purchases_rial: 0,
      first_purchase_date: null,
      last_purchase_date: null,
      farm_count: 0,
      created_by_username: 'supervisor',
      created_at: '2026-05-20T09:00:00Z' },
  ],
};

// Augment each registry report with the totals / reconciliation
// shape the template treats as opt-in. The registry now declares
// totalsColumns + dashboardByDefault + topN + lowStockColumn /
// lowStockThreshold for RPT_INVENTORY_VALUATION_SUMMARY; we still
// layer in the test-only extras (totalsColumns for consumption + aging,
// reconciliation for ledger) here so this file remains self-sufficient.
function augment(reportDef, reportId /*, rows */) {
  const def = { ...reportDef, id: reportId };
  if (reportId === 'RPT_INVENTORY_VALUATION_SUMMARY') {
    if (!def.totalsColumns) def.totalsColumns = ['on_hand_qty', 'value_rial'];
    if (!def.reconcileColumn) {
      def.reconcileColumn = { column: 'value_rial', label: 'کنترل (آخر − اول)' };
    }
  }
  if (reportId === 'RPT_CONSUMPTION_ANALYTICS') {
    def.totalsColumns = ['consumed_qty', 'waste_qty', 'total_qty', 'voucher_count'];
  }
  if (reportId === 'RPT_INVENTORY_LEDGER') {
    def.reconcileColumn = { column: 'running_balance', label: 'کنترل (آخر − اول)' };
  }
  if (reportId === 'RPT_INVENTORY_AGING') {
    def.totalsColumns = ['on_hand_qty', 'value_rial'];
  }
  return def;
}

// ---------------------------------------------------------------------
// Assertion helpers.
// ---------------------------------------------------------------------
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

function assertHasABCFormula(rules) {
  // The ABC rules use cellIs with formulae=['"A"'], formulae=['"B"'],
  // formulae=['"C"'] (string-literal-with-double-quotes — Excel
  // formula syntax for matching the literal cell value).
  return Array.isArray(rules) && rules.some((r) =>
    Array.isArray(r.formulae) && r.formulae.some(
      (f) => typeof f === 'string' && /"A"/.test(f),
    ),
  );
}

function assertHasDataBarRule(rules) {
  return Array.isArray(rules) && rules.some((r) => r && r.type === 'dataBar');
}

function assertHasLowStockRule(rules, threshold) {
  // Match the cellIs lessThanOrEqual rule with the exact expected
  // threshold ExcelJS serialises as a string formula.
  return Array.isArray(rules) && rules.some((r) =>
    r
    && r.type === 'cellIs'
    && r.operator === 'lessThanOrEqual'
    && Array.isArray(r.formulae)
    && r.formulae.includes(String(threshold)),
  );
}

// ExcelJS 4.4 reads conditionalFormattings either as a flat array of
// {ref, rules} entries OR as a map keyed by range string. Normalize
// both shapes to a single flat rules array.
function collectAllRules(ws) {
  const cf = ws && ws.conditionalFormattings;
  const flat = [];
  if (Array.isArray(cf)) {
    cf.forEach((entry) => {
      if (entry && Array.isArray(entry.rules)) flat.push(...entry.rules);
    });
  }
  if (cf && typeof cf === 'object' && !Array.isArray(cf)) {
    Object.values(cf).forEach((entry) => {
      const rules = Array.isArray(entry) ? entry : (entry && Array.isArray(entry.rules) ? entry.rules : null);
      if (rules) flat.push(...rules);
    });
  }
  return flat;
}

// Has the dashboard sheet a Top-N block whose sub-header text matches
// the registry.topN.label? Walk every cell for the label text and
// confirm at least one cell in the rows beneath contains a formula
// referencing the data sheet.
function findDashboardTopN(dashWs, expectedLabel, dataSheetName) {
  if (!dashWs) return { subHeaderFound: false, nRowsFound: 0 };
  let subHeaderFound = false;
  let nRowsFound = 0;
  const dataSheetRef = `'${dataSheetName}'!`;
  dashWs.eachRow((row) => {
    row.eachCell((cell) => {
      if (typeof cell.value === 'string' && cell.value === expectedLabel) {
        subHeaderFound = true;
      }
      if (cell.value && typeof cell.value === 'object'
        && typeof cell.value.formula === 'string'
        && cell.value.formula.includes(dataSheetRef)) {
        nRowsFound += 1;
      }
    });
  });
  return { subHeaderFound, nRowsFound };
}

async function reparse(buffer) {
  // ExcelJS throws on malformed XML — reparse success IS the no-warning
  // assertion.
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

async function runReport(reportId, rows, dashboardMode, opts = {}) {
  console.log(`\n— ${reportId}${dashboardMode ? ' (with dashboard)' : ''} —`);
  const optsTestLowStockThreshold = opts.lowStockThreshold ?? 10;
  const baseDef = reportRegistry[reportId] || opts.syntheticDef;
  if (!baseDef) {
    assert(false, `registry has ${reportId}`);
    return;
  }
  const def = augment(baseDef, reportId, rows);
  // Multi-sheet dispatch — separate assertion path because the data
  // shape, sheet ordering, and merge-cells guarantees differ.
  if (baseDef.kind === 'multi-sheet') {
    await runMultiSheetReport(reportId, def, rows, opts);
    return;
  }
  let buffer;
  try {
    buffer = await buildReportWorkbook(def, rows, {
      dashboard: dashboardMode,
      lowStockThreshold: optsTestLowStockThreshold,
    });
  } catch (err) {
    // Diagnostic stacks on build throws are helpful during template
    // development but they spam CI logs once the template is stable.
    // Gate the verbose path behind DEBUG_TEST=1.
    if (process.env.DEBUG_TEST) {
      console.error(`  [stack] ${err.stack || err.message}`);
    }
    assert(false, `build ${reportId} threw: ${err.message}`);
    return;
  }
  assert(Buffer.isBuffer(buffer) && buffer.length > 1024,
    `buffer ≥ 1KB`);
  assert(
    buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04,
    `ZIP magic PK\\x03\\x04 (got ${buffer.slice(0, 4).toString('hex')})`,
  );

  if (KEEP_BLOBS) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const file = path.join(OUTPUT_DIR, `${reportId}${dashboardMode ? '_dashboard' : ''}.xlsx`);
    fs.writeFileSync(file, buffer);
    console.log(`    wrote ${file}`);
  }

  const wb = await reparse(buffer);

  // Workbook metadata.
  assert(wb.creator === 'Morvarid-Farm', `creator = Morvarid-Farm`);
  assert(wb.company === 'Morvarid-Farm', `company = Morvarid-Farm`);
  assert(wb.title && wb.title.length > 0, `title set to non-empty string`);

  // Sheet count.
  const expectedSheetCount = dashboardMode ? 2 : 1;
  assert(wb.worksheets.length === expectedSheetCount,
    `worksheets.length == ${expectedSheetCount} (got ${wb.worksheets.length})`);

  // Identify the data sheet (the one whose name starts with the data prefix).
  // ExcelJS preserves sheet names that contain Persian + em-dash.
  const dataWs = wb.worksheets.find((ws) => typeof ws.name === 'string'
    && ws.name.includes(reportDefSheetName(baseDef)));
  assert(Boolean(dataWs),
    `data sheet "${reportDefSheetName(baseDef)}" present (got: ${wb.worksheets.map((w) => w.name).join(' | ')})`);

  if (dashboardMode) {
    const dash = wb.worksheets.find((ws) => ws.name === 'داشبورد');
    assert(Boolean(dash), `dashboard sheet present (got: ${wb.worksheets.map((w) => w.name).join(' | ')})`);
  }

  // Header row carries the Persian column names from the registry.
  const headerRow = dataWs.getRow(2);
  baseDef.columns.forEach((col, i) => {
    const got = headerRow.getCell(i + 1).value;
    const ok = got === col.header
      || (typeof got === 'object' && got !== null && got.richText
        && Array.isArray(got.richText) && got.richText.length > 0
        && got.richText[0].text === col.header)
      || (typeof got === 'string' && got === col.header);
    assert(ok, `header[${i}] = "${col.header}" (got ${JSON.stringify(got)})`);
  });

  // Body row count.
  // ExcelJS sets rowCount lazily. Force materialization by reading
  // the last expected row to confirm it exists.
  if (rows.length > 0) {
    const lastRow = dataWs.getRow(2 + rows.length);
    const lastHasCell = lastRow.hasValues || (lastRow.values && lastRow.values.length > 1);
    assert(Boolean(lastHasCell), `last data row (row ${2 + rows.length}) materialized (got values: ${JSON.stringify(lastRow.values)?.slice(0, 80)})`);
  }

  // Frozen pane + RTL view.
  if (dataWs.views && dataWs.views.length > 0) {
    const view = dataWs.views[0];
    assert(view.state === 'frozen', `view.state = frozen (got ${view.state})`);
    assert(view.rightToLeft === true, `view.rightToLeft = true (got ${view.rightToLeft})`);
    assert(view.ySplit === 2, `view.ySplit = 2 (got ${view.ySplit})`);
  } else {
    // ExcelJS may store view differently — content check via re-parse path
    // is non-trivial; we accept silent skip here as long as the
    // frozen-pane integer round-trip is not regressed. Honest fail.
    assert(false, `view state present (got views=${JSON.stringify(dataWs.views)})`);
  }

  // Auto filter range. ExcelJS 4 stores autoFilter as either an
  // object {from:{row,column}, to:{row,column}} OR a string "A2:F5"
  // depending on which loader path wrote it. Spec §3 requires *some*
  // range be set — we check the invariant shape, not the exact range.
  if (rows.length > 0) {
    const af = dataWs.autoFilter;
    const isObjRange = af && typeof af === 'object' && af.from && af.to
      && Number.isFinite(af.from.row) && Number.isFinite(af.to.row);
    const isStringRange = typeof af === 'string' && af.length > 0;
    assert(isObjRange || isStringRange,
      `autoFilter range set (got ${JSON.stringify(af)})`);
  }

  // Totals row SUM formulas. ExcelJS stores formulas as { formula, result }
  // on cell.value; result is undefined pre-evaluation.
  if (def.totalsColumns && def.totalsColumns.length && rows.length > 0) {
    const totalsRowIdx = 2 + rows.length + 1;
    const totalsRow = dataWs.getRow(totalsRowIdx);
    let foundSum = 0;
    def.totalsColumns.forEach((key) => {
      const colIdx = baseDef.columns.findIndex((c) => c.key === key);
      if (colIdx < 0) return;
      const cell = totalsRow.getCell(colIdx + 1);
      const f = cell.value && cell.value.formula;
      const ok = typeof f === 'string' && f.includes('SUM(');
      if (ok) foundSum += 1;
      assert(ok, `totals row ${key} has SUM formula (got ${JSON.stringify(f)})`);
    });
    // First cell of totals row = 'جمع'.
    assert(totalsRow.getCell(1).value === 'جمع',
      `totals row first cell = 'جمع' (got "${totalsRow.getCell(1).value}")`);
  }

  // Reconciliation row formula.
  if (def.reconcileColumn && def.reconcileColumn.column && rows.length > 0) {
    const reconRowIdx = 2 + rows.length + 2;
    const reconRow = dataWs.getRow(reconRowIdx);
    const colIdx = baseDef.columns.findIndex((c) => c.key === def.reconcileColumn.column);
    const cell = reconRow.getCell(colIdx + 1);
    const f = cell.value && cell.value.formula;
    assert(typeof f === 'string' && f.includes('-'),
      `reconciliation cell has formula with '-' (got ${JSON.stringify(f)})`);
    assert(reconRow.getCell(1).value === def.reconcileColumn.label,
      `reconciliation label = "${def.reconcileColumn.label}" (got "${reconRow.getCell(1).value}")`);
  }

  // Conditional formatting — low-stock (Dashboard Summary's highlight
  // capability). Only emitted when the registry declares lowStockColumn
  // AND opts.lowStockThreshold is a finite number.
  if (def.lowStockColumn && Number.isFinite(optsTestLowStockThreshold) && rows.length > 0) {
    const rules = collectAllRules(dataWs);
    assert(assertHasLowStockRule(rules, optsTestLowStockThreshold),
      `lowStock cellIs rule for "${def.lowStockColumn}" ≤ ${optsTestLowStockThreshold} (rules seen: ${rules.length})`);
  }

  // Conditional formatting — ABC class.
  if (baseDef.columns.some((c) => c.key === 'abc_class') && rows.length > 0) {
    const cf = dataWs.conditionalFormattings;
    // ExcelJS 4.4 stores CF as a flat array of {ref, rules} OR a range map.
    // Even if cf is null/undefined, the on-write path may still have
    // pushed CF — we accept EITHER storage shape.
    let flatRules = [];
    if (Array.isArray(cf)) {
      cf.forEach((entry) => {
        if (entry && Array.isArray(entry.rules)) flatRules.push(...entry.rules);
      });
    }
    if (cf && typeof cf === 'object' && !Array.isArray(cf)) {
      Object.values(cf).forEach((rules) => {
        if (Array.isArray(rules)) flatRules.push(...rules);
      });
    }
    assert(assertHasABCFormula(flatRules),
      `ABC conditional formatting rules present (rules seen: ${flatRules.length})`);
  }

  // Conditional formatting — aging dataBar.
  if (baseDef.columns.some((c) => c.key === 'days_since_last_movement') && rows.length > 0) {
    const cf = dataWs.conditionalFormattings;
    let flatRules = [];
    if (Array.isArray(cf)) {
      cf.forEach((entry) => {
        if (entry && Array.isArray(entry.rules)) flatRules.push(...entry.rules);
      });
    }
    if (cf && typeof cf === 'object' && !Array.isArray(cf)) {
      Object.values(cf).forEach((rules) => {
        if (Array.isArray(rules)) flatRules.push(...rules);
      });
    }
    assert(assertHasDataBarRule(flatRules),
      `aging dataBar conditional formatting present (rules seen: ${flatRules.length})`);
  }

  // Dashboard: meta block + KPI formulas exist.
  if (dashboardMode) {
    const dash = wb.worksheets.find((ws) => ws.name === 'داشبورد');
    if (dash) {
      let aMetaHasText = false;
      let kpiFormulaFound = false;
      dash.eachRow((row) => {
        row.eachCell((cell) => {
          if (typeof cell.value === 'string'
            && cell.value.includes('داشبورد خلاصه')) {
            aMetaHasText = true;
          }
          if (cell.value && typeof cell.value === 'object'
            && typeof cell.value.formula === 'string'
            && cell.value.formula.includes('SUM(')) {
            kpiFormulaFound = true;
          }
        });
      });
      assert(aMetaHasText, `dashboard contains 'داشبورد خلاصه' text`);
      assert(kpiFormulaFound, `dashboard contains a SUM-formula KPI cell`);

      // Top-N block — present iff registry declared topN and rows>0.
      if (def.topN && Array.isArray(def.topN.columns) && rows.length > 0) {
        const N = Math.max(1, Math.min(def.topN.n ?? 10, rows.length));
        const topCols = def.topN.columns
          .map((k) => reportRegistry[reportId].columns.find((c) => c.key === k))
          .filter(Boolean);
        const { subHeaderFound, nRowsFound } = findDashboardTopN(
          dash, def.topN.label || `برترین ${N} مورد`, reportDefSheetName(baseDef),
        );
        assert(subHeaderFound,
          `dashboard top-N sub-header "${def.topN.label}" present`);
        // Expect at least N data rows × `topCols.length` formula refs.
        const expectedRefs = N * topCols.length;
        assert(nRowsFound >= expectedRefs,
          `dashboard top-N data formula refs ≥ ${expectedRefs} (got ${nRowsFound}, topCols=${topCols.length}, N=${N})`);
      }
    }
  }
}

function reportDefSheetName(reportDef) {
  return 'گزارش — ' + reportDef.sheetName;
}

// ---------------------------------------------------------------------
// Multi-sheet test path — pivots the analytics export through
// buildMultiReportWorkbook. Validates:
//   - 2 sheets in the workbook, named "rawSheetName" + "analysisSheetName"
//   - Pivot sheet has ZERO merged cells (Ctrl+A → pivot compat)
//   - Pivot sheet header is at row 1 (no title row obstruction)
//   - Analysis sheet has 1 merged cell (title row only); header at row 2
//   - Analysis sheet rectangular SUMIFS formulas across the category block
//   - waste_ratio + variance_flag formulas (with the 15% threshold check)
//   - Totals row + cross-sheet parity-check row both present
// ---------------------------------------------------------------------
async function runMultiSheetReport(reportId, def, rows, opts) {
  // Distinct categories — mirrors server.mjs pre-computation so the
  // SUMIFS paint region matches the test fixture's expected shape.
  const distinctCategories = Array.from(
    new Set(
      rows.map((r) => (r && r.item_category) || null)
        .filter((v) => v !== null && v !== undefined && v !== ''),
    ),
  ).sort();

  let buffer;
  try {
    buffer = await buildMultiReportWorkbook(def, rows, {
      analysisRows: distinctCategories.map((category) => ({ category })),
    });
  } catch (err) {
    if (process.env.DEBUG_TEST) {
      console.error(`  [stack] ${err.stack || err.message}`);
    }
    assert(false, `build ${reportId} (multi-sheet) threw: ${err.message}`);
    return;
  }
  assert(Buffer.isBuffer(buffer) && buffer.length > 1024, `buffer ≥ 1KB`);
  assert(
    buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04,
    `ZIP magic PK\\x03\\x04 (got ${buffer.slice(0, 4).toString('hex')})`,
  );

  if (KEEP_BLOBS) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const file = path.join(OUTPUT_DIR, `${reportId}_multi.xlsx`);
    fs.writeFileSync(file, buffer);
    console.log(`    wrote ${file}`);
  }

  const wb = await reparse(buffer);

  // Workbook metadata — multi-sheet path is single-workbook, single
  // creator/title like single-sheet.
  assert(wb.creator === 'Morvarid-Farm', `creator = Morvarid-Farm`);
  assert(wb.company === 'Morvarid-Farm', `company = Morvarid-Farm`);
  assert(wb.title === def.title, `title set to "${def.title}"`);

  // Sheet count: 2 (no dashboard).
  assert(wb.worksheets.length === 2, `worksheets.length == 2 (got ${wb.worksheets.length})`);

  // Locate the two primary sheets by their registry-declared names.
  const rawWs = wb.worksheets.find((ws) => typeof ws.name === 'string'
    && ws.name === def.rawSheetName);
  const analysisWs = wb.worksheets.find((ws) => typeof ws.name === 'string'
    && ws.name === def.analysisSheetName);
  assert(Boolean(rawWs), `raw sheet "${def.rawSheetName}" present (got: ${wb.worksheets.map((w) => w.name).join(' | ')})`);
  assert(Boolean(analysisWs), `analysis sheet "${def.analysisSheetName}" present`);

  // ---------- PIVOT-READY SHEET INVARIANTS ----------
  // 1. ZERO merged cells. ExcelJS exposes merges via ws.model.merges.
  const rawMerges = rawWs.model && rawWs.model.merges
    ? rawWs.model.merges
    : [];
  assert(Array.isArray(rawMerges) && rawMerges.length === 0,
    `raw sheet has zero merged cells (got ${JSON.stringify(rawMerges)})`);

  // 2. Column header carries the registry Persian names at row 1.
  const rawHeader = rawWs.getRow(1);
  def.columns.forEach((col, i) => {
    const got = rawHeader.getCell(i + 1).value;
    assert(got === col.header,
      `raw header[${i}] = "${col.header}" (got ${JSON.stringify(got)})`);
  });
  // 3. No title row — first cell of row 1 is the FIRST column header, not a title.
  assert(typeof rawHeader.getCell(1).value === 'string'
    && rawHeader.getCell(1).value === def.columns[0].header,
    `raw row 1 cell 1 is column header (no title obstruction)`);

  // 4. Body row materialised at row 2.
  if (rows.length > 0) {
    const firstBodyRow = rawWs.getRow(2);
    const firstBodyHasValues = firstBodyRow.hasValues
      || (firstBodyRow.values && firstBodyRow.values.length > 1);
    assert(Boolean(firstBodyHasValues), `raw body row 2 materialized`);
  }

  // 5. Frozen pane ySplit = 1 (header only).
  if (rawWs.views && rawWs.views.length > 0) {
    const view = rawWs.views[0];
    assert(view.state === 'frozen', `raw view.state = frozen`);
    assert(view.ySplit === 1, `raw view.ySplit = 1 (got ${view.ySplit})`);
    assert(view.rightToLeft === true, `raw view.rightToLeft = true`);
  } else {
    assert(false, `raw view state present`);
  }

  // 6. AutoFilter range covers header + body.
  if (rows.length > 0) {
    const af = rawWs.autoFilter;
    const isObjRange = af && typeof af === 'object' && af.from && af.to
      && Number.isFinite(af.from.row) && Number.isFinite(af.to.row);
    const isStringRange = typeof af === 'string' && af.length > 0;
    assert(isObjRange || isStringRange,
      `raw autoFilter range set (got ${JSON.stringify(af)})`);
  }

  // ---------- ANALYSIS SHEET INVARIANTS ----------
  // 1. Exactly one merged cell — the title row only.
  const analysisMerges = analysisWs.model && analysisWs.model.merges
    ? analysisWs.model.merges
    : [];
  assert(Array.isArray(analysisMerges) && analysisMerges.length === 1,
    `analysis sheet has exactly one merged cell (title only) — got ${JSON.stringify(analysisMerges)}`);

  // 2. Column header at row 2 (row 1 is merged title).
  if (distinctCategories.length > 0) {
    const analysisHeader = analysisWs.getRow(2);
    def.analysisColumns.forEach((col, i) => {
      assert(analysisHeader.getCell(i + 1).value === col.header,
        `analysis header[${i}] = "${col.header}"`);
    });
  }

  // 3. Rectangular SUMIFS block for each category.
  if (distinctCategories.length > 0) {
    distinctCategories.forEach((cat, idx) => {
      const r = 3 + idx;
      const dataRow = analysisWs.getRow(r);
      // First cell = the category label.
      assert(dataRow.getCell(1).value === cat,
        `analysis row ${r} category = "${cat}" (got ${JSON.stringify(dataRow.getCell(1).value)})`);
      // SUMIFS for consumed/waste/total/voucher — cell.value.{formula}.
      ['consumed_sum', 'waste_sum', 'total_sum', 'voucher_sum'].forEach((key) => {
        const colIdx = def.analysisColumns.findIndex((c) => c.key === key);
        const cell = dataRow.getCell(colIdx + 1);
        const f = cell.value && cell.value.formula;
        assert(typeof f === 'string' && f.startsWith('SUMIFS('),
          `${key} at row ${r} uses SUMIFS (got ${JSON.stringify(f)})`);
      });
      // waste_ratio cell: formula like "IF(tLetter${r}=0,0,wLetter${r}/tLetter${r})"
      const ratioIdx = def.analysisColumns.findIndex((c) => c.key === 'waste_ratio');
      const ratioCell = dataRow.getCell(ratioIdx + 1);
      assert(ratioCell.value && typeof ratioCell.value.formula === 'string'
        && /\//.test(ratioCell.value.formula),
        `waste_ratio at row ${r} is a percent-cell formula`);
      // variance_flag cell: IF(ratio>threshold, ...)
      const flagIdx = def.analysisColumns.findIndex((c) => c.key === 'variance_flag');
      const flagCell = dataRow.getCell(flagIdx + 1);
      assert(flagCell.value && typeof flagCell.value.formula === 'string'
        && /^IF\(/.test(flagCell.value.formula),
        `variance_flag at row ${r} is an IF formula`);
    });
  }

  // 4. Totals row + parity (cross-sheet checksum) row both present.
  if (distinctCategories.length > 0) {
    const totalsIdx = 3 + distinctCategories.length;
    const totalsRow = analysisWs.getRow(totalsIdx);
    assert(totalsRow.getCell(1).value === 'جمع کل',
      `analysis totals row ${totalsIdx} starts with 'جمع کل'`);
    // Parity row at totalsIdx + 2.
    const parityIdx = totalsIdx + 2;
    const parityRow = analysisWs.getRow(parityIdx);
    assert(parityRow.getCell(1).value === 'کنترل برابری (تحلیل ↔ خام)',
      `parity row ${parityIdx} label = 'کنترل برابری'`);
    ['consumed_sum', 'waste_sum', 'total_sum'].forEach((key) => {
      const colIdx = def.analysisColumns.findIndex((c) => c.key === key);
      const cell = parityRow.getCell(colIdx + 1);
      const f = cell.value && cell.value.formula;
      assert(typeof f === 'string' && f.startsWith('IF(')
        && f.includes('SUM('),
        `parity cell for ${key} uses SUM and IF (got ${JSON.stringify(f)})`);
    });
  }
}

// ---------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------
(async () => {
  console.log('Excel Design System self-test (xlsx-template.mjs)');
  console.log('==================================================');

  for (const reportId of Object.keys(FIXTURE_REPORTS)) {
    if (reportId === 'RPT_INVENTORY_VALUATION_SUMMARY_BIG') continue;
    await runReport(reportId, FIXTURE_REPORTS[reportId], false);
  }
  // Dashboard-enabled pass for valuation with the small fixture
  // (rows < topN.n — exercises the "n clamped to rows.length" branch).
  await runReport('RPT_INVENTORY_VALUATION_SUMMARY',
    FIXTURE_REPORTS.RPT_INVENTORY_VALUATION_SUMMARY, true);

  // Dashboard-enabled pass for valuation with the 12-row fixture
  // (rows > topN.n — exercises the full top-10 block + low-stock rule
  // with mixed qty buckets). Same registry entry, second pass.
  await runReport('RPT_INVENTORY_VALUATION_SUMMARY',
    FIXTURE_REPORTS.RPT_INVENTORY_VALUATION_SUMMARY_BIG,
    true,
    { lowStockThreshold: 10 });

  // Empty-rows edge case (e.g. no items returned for the filter).
  // We accept EITHER a clean re-parse with no body OR a thrown error
  // that we record as a `build threw` failure — neither is a regression.
  await runReport('RPT_INVENTORY_AGING', [], false);

  console.log('\n==================================================');
  console.log(`PASS: ${passed}  FAIL: ${failed}`);
  if (failed > 0) {
    console.error('Failed assertions:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log('All template invariants hold.');
})().catch((err) => {
  console.error('Self-test crashed:', err);
  process.exit(2);
});
