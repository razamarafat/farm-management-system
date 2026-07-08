// =====================================================================
// services/export-api/registry.mjs
//
// Single source of truth for what reports the export API offers,
// which Postgres RPC they call, the RBAC matrix, the Persian sheet
// name, how to map the request body to RPC parameters, and the
// column shape used to render the worksheet.
//
// IMPORTANT:
//   - `reportId` MUST match the React-side `ReportCatalogEntry.id` from
//     src/types/report.types.ts. The router keys off this ID.
//   - `rpcName` MUST match the SECURITY INVOKER SQL function in
//     scripts/migrations/{008_reporting_layer,009_inventory_aging,
//     010_pareto_classification,011_reporting_suppliers_list}.sql.
//     The server scopes a client with the caller's JWT so RLS
//     naturally applies — no service-role key path.
//   - RBAC is *default-deny*: any reportId missing from this map
//     returns 404. Any role missing from `allowedRoles` returns 403.
//
//   - `mapFilters` MUST preserve booleans literally. The pattern
//         body.X || null
//     coerces `false` → `null`, which silently breaks inactive-only
//     filter paths (e.g. RPT_SUPPLIERS' `p_is_active`). The required
//     shape for any boolean parameter is:
//         typeof body.X === 'boolean' ? body.X : null
//     RPT_SUPPLIERS' mapFilters is the canonical example — use it as
//     the template when adding a new boolean flag.
// =====================================================================

/**
 * @typedef {{ key: string, header: string, width?: number }} Column
 * @typedef {{
 *   rpcName: string,
 *   allowedRoles: Array<'admin'|'supervisor'|'operator'>,
 *   sheetName: string,
 *   mapFilters: (body: Record<string, unknown>) => Record<string, unknown>,
 *   columns: Column[],
 *   title: string,
 * }} ReportDefinition
 */

/** @type {Record<string, ReportDefinition>} */
export const reportRegistry = {
  // ------------------------------------------------------------------
  // RPT_INVENTORY_VALUATION_SUMMARY
  //   CEO "opening file": current stock + value, presented cleanly with a
  //   Dashboard Summary sheet (auto-enabled via dashboardByDefault) +
  //   top-10-by-value block (server-side sort) + soft-warning low-stock
  //   highlight when qty ≤ lowStockThreshold (default 10). Source-of-truth
  //   remains the SECURITY INVOKER RPC reporting_inventory_balance_as_of.
  // ------------------------------------------------------------------
  RPT_INVENTORY_VALUATION_SUMMARY: {
    rpcName: 'reporting_inventory_balance_as_of',
    allowedRoles: ['admin', 'supervisor'],
    sheetName: 'ارزش‌گذاری موجودی',
    title: 'گزارش ارزش موجودی',
    perfBudget: { p95Ms: 2000 },  // p95 latency guardrail (perf-budget.mjs reads this)
    dashboardByDefault: true,
    // Totals row + dashboard KPI block auto-pick these up.
    totalsColumns: ['on_hand_qty', 'value_rial'],
    // Server-side sort by this column DESC so top-N pulls the first N rows
    // directly. Dashboard refs the top-10 via formula chain back to the
    // data sheet — keeps Excel formulas deterministic.
    topN: {
      column: 'value_rial',
      n: 10,
      label: 'برترین ۱۰ کالا بر اساس ارزش',
      columns: ['item_name', 'on_hand_qty', 'unit_cost', 'value_rial'],
    },
    // Soft-warning fill (COLORS.lowStock) on rows where on_hand_qty ≤ this
    // value. Operator can override per-request via body.low_stock_threshold.
    lowStockColumn: 'on_hand_qty',
    lowStockThreshold: 10,
    mapFilters: (body) => ({
      p_as_of:    body.date_to || body.as_of || new Date().toISOString().slice(0, 10),
      p_farm_id:  body.farm_id || null,
      p_category: body.category || null,
    }),
    columns: [
      { key: 'farm_name',     header: 'فارم',         width: 18 },
      { key: 'item_name',     header: 'کالا',         width: 28 },
      { key: 'item_category', header: 'دسته',         width: 12 },
      { key: 'item_unit',     header: 'واحد',         width: 10 },
      { key: 'on_hand_qty',   header: 'موجودی',       width: 12 },
      { key: 'unit_cost',     header: 'قیمت واحد (ریال)', width: 18 },
      { key: 'value_rial',    header: 'ارزش (ریال)',  width: 22 },
      { key: 'priced_on',     header: 'تاریخ قیمت',   width: 14 },
    ],
  },

  // ------------------------------------------------------------------
  // RPT_INVENTORY_LEDGER — paginated keyset. The exporter follows the
  // cursor chain to drain ALL rows for the user's filter set, so the
  // xlsx reflects the complete ledger (no client-side truncation).
  // Audit-grade shape: server pre-resolves farm_id + item_id to their
  // human-readable names so the workbook's frozen "Parameters" band
  // shows what the user filtered on, not opaque UUIDs. Negative running
  //_balance rows get a soft-red cellIs fill — operators reading an
  // export see the mis-stocked rows without needing to recompute.
  // Streaming threshold + maxRows cap protect against runaway exports.
  // ------------------------------------------------------------------
  RPT_INVENTORY_LEDGER: {
    rpcName: 'reporting_inventory_ledger',
    allowedRoles: ['admin', 'supervisor', 'operator'],
    sheetName: 'گردش انبار',
    title: 'گردش کامل انبار',
    perfBudget: { p95Ms: 8000 },  // paginated ledger — slower budget
    // Single-item exports show running_balance reconciliation (last-row
    // cumulative - first-row cumulative = total movement). Multi-item
    // exports carry partitioned running_balance — the last/first delta
    // would be misleading, so server.mjs suppresses reconcileColumn.
    reconcileColumn: { column: 'running_balance', label: 'تغییر کل موجودی' },
    // Soft-red fill on rows where running_balance < 0.
    lowBalanceColumn: 'running_balance',
    // Rows above this threshold use ExcelJS WorkbookWriter streaming
    // to bound peak memory. Below it we use the in-memory Workbook.
    // Picked at 25k — a typical year of one farm's ledger entries fits
    // comfortably under that; larger exports (multi-farm cross-item)
    // benefit from streaming.
    streamingThreshold: 25_000,
    // Hard cap. Server.mjs returns 502 'export_too_large' if rows exceed
    // this. Catches 200k-cap path tests in CI while keeping Excel
    // responsive on real exports (a 100k-row .xlsx opens in ~10s on
    // modern hardware).
    maxRows: 100_000,
    // Parameter band order in the frozen top section. Server fills
    // only the non-empty ones via opts.parameters (date_from + date_to
    // + farm_name + item_name + category + txn_type).
    parametersOrder: ['date_from', 'date_to', 'farm_name', 'item_name', 'category', 'txn_type'],
    mapFilters: (body) => ({
      p_farm_id:    body.farm_id    || null,
      p_item_id:    body.item_id    || null,
      p_category:   body.category   || null,
      p_date_from:  body.date_from  || null,
      p_date_to:    body.date_to    || null,
      // Audit-grade: passing the user's chip selection. When length != 1 the
      // RPC returns NULL and falls back to multi-type (see the hook doc-comment
      // in src/hooks/useInventoryLedgerReport.ts).
      p_txn_type:   Array.isArray(body.txnTypes) && body.txnTypes.length === 1
                      ? body.txnTypes[0]
                      : null,
    }),
    columns: [
      { key: 'txn_date',       header: 'تاریخ',         width: 14 },
      { key: 'txn_type',       header: 'نوع تراکنش',    width: 14 },
      { key: 'farm_name',      header: 'فارم',          width: 18 },
      { key: 'item_name',      header: 'کالا',          width: 28 },
      { key: 'item_unit',      header: 'واحد',          width: 10 },
      { key: 'qty_in',         header: 'ورودی',         width: 12 },
      { key: 'qty_out',        header: 'خروجی',         width: 12 },
      { key: 'unit_price',     header: 'قیمت واحد',     width: 14 },
      { key: 'total_price',    header: 'قیمت کل',       width: 18 },
      { key: 'prior_balance',  header: 'موجودی قبلی',   width: 14 },
      { key: 'running_balance',header: 'موجودی لحظه‌ای', width: 16 },
      { key: 'reference_no',   header: 'شماره مرجع',    width: 16 },
      { key: 'supplier_name',  header: 'تأمین‌کننده',   width: 18 },
    ],
  },

  // ------------------------------------------------------------------
  // RPT_CONSUMPTION_ANALYTICS — single-shot, but group_by axis is
  // a parameter. The SPA passes p_group_by in the body, default 'item'.
  // Operator access included.
  //
  // Multi-sheet design (kind: 'multi-sheet'):
  //   - Sheet 1: "مصرف (خام)" — pure pivot-ready rows. NO title row /
  //     parameters band / merges anywhere. Row 1 IS the column header so
  //     Ctrl+A → Insert PivotTable works without manual range selection.
  //   - Sheet 2: "تحلیل" — title + rectangular SUMIFS blocks keyed by
  //     item_category (the only axis shared across every p_group_by
  //     branch). Adds a waste-ratio column + a variance flag column
  //     where waste_qty / total_qty > varianceThreshold (default 15%).
  //   - sheetName is retained for single-sheet fallback / dashboard link.
  // ------------------------------------------------------------------
  RPT_CONSUMPTION_ANALYTICS: {
    rpcName: 'reporting_consumption_summary',
    allowedRoles: ['admin', 'supervisor', 'operator'],
    perfBudget: { p95Ms: 3000 },  // aggregation RPC; mid-range budget
    // 'multi-sheet' tells server.mjs to dispatch to buildMultiReportWorkbook.
    kind: 'multi-sheet',
    // Sheet 1 — pivot-ready, no merged cells inside data region.
    rawSheetName: 'مصرف (خام)',
    // Sheet 2 — formula analysis blocks.
    analysisSheetName: 'تحلیل',
    // Legacy single-sheet name (kept for dashboard / fallback paths).
    sheetName: 'تحلیل مصرف',
    title: 'تحلیل مصرف',
    // Pivot-ready columns — exactly the shape the RPC returns.
    columns: [
      { key: 'group_key',     header: 'کلید',         width: 28 },
      { key: 'group_label',   header: 'گروه',         width: 22 },
      { key: 'item_category', header: 'دسته',         width: 12 },
      { key: 'consumed_qty',  header: 'مصرف',         width: 12 },
      { key: 'waste_qty',     header: 'ضایعات',       width: 12 },
      { key: 'total_qty',     header: 'جمع',          width: 12 },
      { key: 'voucher_count', header: 'تعداد حواله',  width: 14 },
    ],
    // Analysis sheet columns — rectangular SUMIFS formulas + variance.
    analysisColumns: [
      { key: 'category',      header: 'دسته',         width: 14 },
      { key: 'consumed_sum',  header: 'جمع مصرف',     width: 14, type: 'qty' },
      { key: 'waste_sum',     header: 'جمع ضایعات',   width: 14, type: 'qty' },
      { key: 'total_sum',     header: 'جمع کل',       width: 14, type: 'qty' },
      { key: 'voucher_sum',   header: 'تعداد حواله',  width: 14, type: 'integer' },
      { key: 'waste_ratio',   header: 'نسبت ضایعات',  width: 14, type: 'percent' },
      { key: 'variance_flag', header: 'هشدار',        width: 12 },
    ],
    // Soft-warning fill on analysis-sheet rows where waste_ratio > threshold.
    varianceThreshold: 0.15,
    // Pivot sheet rows balloon in multi-day range queries; same thresholds
    // as the ledger work for this RPC too.
    streamingThreshold: 25_000,
    maxRows: 100_000,
    mapFilters: (body) => ({
      p_date_from:  body.date_from,
      p_date_to:    body.date_to,
      p_farm_id:    body.farm_id  || null,
      p_category:   body.category || null,
      p_group_by:   ['day', 'item', 'hall', 'formula'].includes(body.group_by)
                      ? body.group_by
                      : 'item',
    }),
  },

  // ------------------------------------------------------------------
  // RPT_INVENTORY_AGING — single-shot as-of snapshot.
  // ------------------------------------------------------------------
  RPT_INVENTORY_AGING: {
    rpcName: 'reporting_inventory_aging',
    allowedRoles: ['admin', 'supervisor'],
    sheetName: 'پیر شدگی موجودی',
    title: 'پیر شدگی موجودی + اقلام راکد',
    perfBudget: { p95Ms: 2000 },  // snapshot of joined inventory + transactions
    mapFilters: (body) => ({
      p_as_of:            body.date_to || new Date().toISOString().slice(0, 10),
      p_farm_id:          body.farm_id   || null,
      p_category:         body.category  || null,
      p_dead_stock_days:  body.dead_stock_days ?? 90,
    }),
    columns: [
      { key: 'farm_name',               header: 'فارم',          width: 18 },
      { key: 'item_name',               header: 'کالا',          width: 28 },
      { key: 'item_unit',               header: 'واحد',          width: 10 },
      { key: 'on_hand_qty',             header: 'موجودی',        width: 12 },
      { key: 'last_movement_date',      header: 'آخرین حرکت',    width: 14 },
      { key: 'days_since_last_movement',header: 'سن (روز)',      width: 10 },
      { key: 'age_bucket',              header: 'بازه سنی',      width: 14 },
      { key: 'unit_cost',               header: 'قیمت واحد',     width: 14 },
      { key: 'value_rial',              header: 'ارزش (ریال)',   width: 20 },
      { key: 'dead_stock',              header: 'راکد',          width: 10 },
    ],
  },

  // ------------------------------------------------------------------
  // RPT_PARETO_CLASSIFICATION — single-shot, basis (value/quantity)
  // is part of the request body.
  // ------------------------------------------------------------------
  RPT_PARETO_CLASSIFICATION: {
    rpcName: 'reporting_pareto_classification',
    allowedRoles: ['admin', 'supervisor'],
    sheetName: 'طبقه‌بندی پارتو',
    title: 'طبقه‌بندی پارتو (ABC)',
    perfBudget: { p95Ms: 2000 },  // windowed aggregation with class sort
    mapFilters: (body) => ({
      p_date_from:    body.date_from,
      p_date_to:      body.date_to,
      p_farm_id:      body.farm_id   || null,
      p_category:     body.category  || null,
      p_basis:        body.basis === 'quantity' ? 'quantity' : 'value',
      p_a_threshold:  typeof body.a_threshold === 'number' ? body.a_threshold : 70,
      p_b_threshold:  typeof body.b_threshold === 'number' ? body.b_threshold : 90,
    }),
    columns: [
      { key: 'item_name',             header: 'کالا',           width: 28 },
      { key: 'farm_name',             header: 'فارم',           width: 18 },
      { key: 'item_unit',             header: 'واحد',           width: 10 },
      { key: 'period_qty',            header: 'مقدار دوره',     width: 12 },
      { key: 'basis_metric',          header: 'مبنا (ریال/مقدار)', width: 20 },
      { key: 'share_pct',             header: 'سهم %',          width: 10 },
      { key: 'cumulative_share_pct',  header: 'سهم تجمعی %',    width: 12 },
      { key: 'abc_class',             header: 'کلاس',           width: 10 },
      { key: 'on_hand_qty',           header: 'موجودی',         width: 12 },
      { key: 'reorder_point',         header: 'نقطه سفارش',     width: 12 },
      { key: 'avg_daily_consumption', header: 'مصرف روزانه',    width: 14 },
      { key: 'reorder_recommended',   header: 'پیشنهاد سفارش',  width: 14 },
    ],
  },

  // ------------------------------------------------------------------
  // RPT_SUPPLIERS — audit-grade directory of suppliers. Replaces the
  // legacy client-side exportSuppliersToExcel path with the BFF.
  //
  // Filter semantics — suppliers table has no farm_id or category
  // columns, so the SQL implements those scopes via an EXISTS subquery
  // against purchase-side inventory_transactions. Operators get an
  // answer to "who actually supplies farm X / item-category Y", not
  // just the global roster. p_is_active preserves the literal boolean
  // (false must round-trip; `body.X || null` would coerce it null).
  // p_search is a case-insensitive ilike on name.
  //
  // Sort: alphabetical by name. The data set is small (< 5000 rows
  // realistic ceiling) so streaming is unnecessary — single-shot RPC,
  // bounded by maxRows.
  //
  // Status column translates is_active at the SQL layer so the .xlsx
  // Persian header is human-readable without post-processing.
  // ------------------------------------------------------------------
  RPT_SUPPLIERS: {
    rpcName: 'reporting_suppliers_list',
    allowedRoles: ['admin', 'supervisor', 'operator'],
    sheetName: 'تأمین‌کنندگان',
    title: 'فهرست جامع تأمین‌کنندگان',
    perfBudget: { p95Ms: 1500 },  // single-shot supplier list — fast budget
    maxRows: 5000,                // realistic ceiling for any morvarid-farm
    mapFilters: (body) => ({
      p_farm_id:   body.farm_id   || null,
      p_category:  body.category  || null,
      // Boolean is lost in `body.X || null` (false → null). Use explicit
      // type-narrowing so `is_active: false` round-trips correctly.
      p_is_active: typeof body.is_active === 'boolean' ? body.is_active : null,
      p_search:    body.search    || null,
    }),
    columns: [
      { key: 'name',                 header: 'نام تأمین‌کننده',  width: 25 },
      { key: 'status',               header: 'وضعیت',            width: 12 },
      { key: 'usage_count',          header: 'تعداد خرید',       width: 12 },
      { key: 'total_purchases_rial', header: 'مجموع خرید (ریال)', width: 22 },
      { key: 'farm_count',           header: 'تعداد مزارع تأمین', width: 14 },
      { key: 'first_purchase_date',  header: 'اولین خرید',       width: 14 },
      { key: 'last_purchase_date',   header: 'آخرین خرید',       width: 14 },
      { key: 'created_by_username',  header: 'ایجادکننده',       width: 15 },
      { key: 'created_at',           header: 'تاریخ ثبت سیستمی',  width: 18 },
      { key: 'supplier_id',          header: 'شناسه مرجع',       width: 28 },
    ],
  },
};

/** Reports a caller (or smoke test) can introspect for help/error pages. */
export function listReportIds() {
  return Object.keys(reportRegistry);
}
