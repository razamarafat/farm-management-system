// =====================================================================
// services/export-api/registry.mjs
//
// Single source of truth for what reports the export API offers,
// which Postgres RPC they call, the RBAC matrix, the Persian sheet
// name, how to map the request body to RPC parameters, and the
// column shape used to render the worksheet.
//
// Pass 1 of the Reports-menu redesign (docs/reports/reports-menu-redesign.md):
//   - EXACTLY 6 entries, one per tile in REPORT_CATALOG
//     (src/types/report.types.ts).
//   - Each `reportId` MUST match the React-side `ReportCatalogEntry.id`.
//   - Each `rpcName` MUST match a SECURITY INVOKER SQL function to be
//     created in Pass 2 (scripts/migrations/015_*.sql). These are
//     forward references — invoking Export before Pass 2 lands will
//     surface the SQL function-not-found error from the RPC call,
//     which the SONNER toast will render to the operator.
//   - RBAC is *default-deny*: any reportId missing from this map
//     returns 404. Any role missing from `allowedRoles` returns 403.
//
// Pass 2 will:
//   - Create 6 SECURITY INVOKER reporting_* functions in one new migration.
//   - Wire each section's Export button to call triggerServerExport with
//     the matching ID.
//   - Wire perf-budget + template-test + reconciliation-test fixtures
//     to use the new IDs (these scripts are bypass-gated today and so
//     do not block CI in Pass 1).
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
  // RPT_INVENTORY_STOCK — current on-hand balance + value + last-movement
  // aging + dead-stock flag. The merged successor to the deleted
  // RPT_INVENTORY_VALUATION_SUMMARY + RPT_INVENTORY_LEDGER (snapshot
  // half) + RPT_INVENTORY_AGING. Drilldown into the last 90 days of
  // movement is handled by the SPA, not the BFF.
  // RBAC: admin + supervisor (operators see only their assigned farm(s),
  // which the SQL filters down via has_farm_access_v2 — same RLS helper
  // used by all reporting_* functions).
  // ------------------------------------------------------------------
  RPT_INVENTORY_STOCK: {
    rpcName: 'reporting_inventory_stock',
    allowedRoles: ['admin', 'supervisor'],
    sheetName: 'موجودی انبار',
    title: 'موجودی انبار',
    perfBudget: { p95Ms: 2000 },  // snapshot of joined inventory + last-movement
    // Totals row auto-shows these columns' SUM.
    totalsColumns: ['on_hand_qty', 'value_rial'],
    // Soft-warning fill on rows where on_hand_qty ≤ this.
    lowStockColumn: 'on_hand_qty',
    lowStockThreshold: 10,
    mapFilters: (body) => ({
      p_as_of:     body.asOf || body.date_to || new Date().toISOString().slice(0, 10),
      p_farm_id:   body.farm_id   || null,
      p_category:  body.category  || null,
      p_dead_stock_only: body.deadStockOnly === true,
    }),
    columns: [
      { key: 'farm_name',             header: 'فارم',              width: 18 },
      { key: 'item_name',             header: 'کالا',              width: 28 },
      { key: 'item_category',         header: 'دسته',              width: 12 },
      { key: 'item_unit',             header: 'واحد',              width: 10 },
      { key: 'on_hand_qty',           header: 'موجودی',            width: 12 },
      { key: 'unit_cost',             header: 'قیمت واحد (ریال)',  width: 18 },
      { key: 'value_rial',            header: 'ارزش (ریال)',       width: 22 },
      { key: 'last_movement_date',    header: 'آخرین حرکت',        width: 14 },
      { key: 'days_since_last_movement', header: 'سن (روز)',       width: 10 },
      { key: 'is_dead_stock',         header: 'راکد',              width: 10 },
    ],
  },

  // ------------------------------------------------------------------
  // RPT_CONSUMPTION_REPORT — upgraded successor to RPT_CONSUMPTION_ANALYTICS.
  // Adds: مانده انبار (on_hand_qty at end of window) + ارزش ریالی (consumed_qty ×
  // unit_cost) + ردیف جمع. Group-by axis (day/item/hall/formula) mirrors the
  // legacy branch.
  // RBAC: admin + supervisor + operator (operators are farm-scoped).
  // ------------------------------------------------------------------
  RPT_CONSUMPTION_REPORT: {
    rpcName: 'reporting_consumption_report_v3',
    allowedRoles: ['admin', 'supervisor', 'operator'],
    sheetName: 'گزارش مصرف',
    title: 'گزارش مصرف',
    perfBudget: { p95Ms: 3000 },
    // Totals row sums consumption + waste + rial value.
    totalsColumns: ['consumed_qty', 'waste_qty', 'rial_value'],
    mapFilters: (body) => ({
      p_date_from:    body.date_from,
      p_date_to:      body.date_to,
      p_farm_id:      body.farm_id   || null,
      p_category:     body.category  || null,
      p_group_by:     ['day', 'item', 'hall', 'formula'].includes(body.group_by)
                        ? body.group_by
                        : 'item',
      // Multi-select arrays → SQL ANY (uuid[]). Pass [] when empty so
      // the SQL interprets as "no filter" rather than "no data".
      p_hall_ids:     Array.isArray(body.hallIds)    ? body.hallIds    : [],
      p_formula_ids:  Array.isArray(body.formulaIds) ? body.formulaIds : [],
    }),
    columns: [
      { key: 'group_key',          header: 'کلید',           width: 28 },
      { key: 'group_label',        header: 'گروه',           width: 22 },
      { key: 'item_category',      header: 'دسته',           width: 12 },
      { key: 'hall_name',          header: 'سالن',           width: 18 },
      { key: 'formula_name',       header: 'فرمول',          width: 22 },
      { key: 'consumed_qty',       header: 'مصرف',           width: 12 },
      { key: 'waste_qty',          header: 'ضایعات',         width: 12 },
      { key: 'unit_price',         header: 'قیمت واحد',      width: 14 },
      { key: 'rial_value',         header: 'ارزش ریالی',     width: 22 },
      { key: 'closing_balance',    header: 'مانده انبار',    width: 14 },
      { key: 'voucher_count',      header: 'تعداد حواله',    width: 14 },
    ],
    streamingThreshold: 25_000,
    maxRows: 100_000,
  },

  // ------------------------------------------------------------------
  // RPT_SALES_TRANSFERS — outbound sale + inter-farm/inter-hall transfers.
  // The `sale` txn_type does NOT currently exist in inventory_transactions
  // (Phase 1 audit finding). The BFF + SQL implementation will surface
  // this gap explicitly: transfer_out rows are populable today; sale rows
  // return zero rows until a Phase-2 product feature adds the sales entry
  // screen.
  // ------------------------------------------------------------------
  RPT_SALES_TRANSFERS: {
    rpcName: 'reporting_sales_transfers_v3',
    allowedRoles: ['admin', 'supervisor'],
    sheetName: 'فروش و انتقالات',
    title: 'گزارش فروش و انتقال بین انبارها',
    perfBudget: { p95Ms: 2500 },
    totalsColumns: ['qty', 'amount'],
    mapFilters: (body) => ({
      p_date_from:    body.date_from,
      p_date_to:      body.date_to,
      p_farm_id:      body.farm_id  || null,
      p_item_id:      body.item_id  || null,
      // 'sale' | 'transfer_in' | 'transfer_out' → single value or
      // null = no type filter. (Empty array treated as null for parity
      // with the SPA's txnTypeOptions contract.)
      p_txn_type:     ['sale', 'transfer_in', 'transfer_out'].includes(body.txn_type)
                        ? body.txn_type
                        : null,
    }),
    columns: [
      { key: 'txn_date',       header: 'تاریخ',          width: 14 },
      { key: 'txn_type',       header: 'نوع',            width: 14 },
      { key: 'source_farm',    header: 'مبدأ',           width: 18 },
      { key: 'dest_farm',      header: 'مقصد',           width: 18 },
      { key: 'item_name',      header: 'کالا',           width: 28 },
      { key: 'item_unit',      header: 'واحد',           width: 10 },
      { key: 'qty',            header: 'مقدار',          width: 12 },
      { key: 'unit_price',     header: 'قیمت واحد',      width: 14 },
      { key: 'amount',         header: 'مبلغ',           width: 20 },
      { key: 'reference_no',   header: 'مرجع',           width: 16 },
    ],
  },

  // ------------------------------------------------------------------
  // RPT_PURCHASES — list of purchase-side inventory_transactions.
  // ------------------------------------------------------------------
  RPT_PURCHASES: {
    rpcName: 'reporting_purchases_v3',
    allowedRoles: ['admin', 'supervisor', 'operator'],
    sheetName: 'گزارش خریدها',
    title: 'گزارش خریدها',
    perfBudget: { p95Ms: 3000 },
    totalsColumns: ['qty', 'total_amount'],
    mapFilters: (body) => ({
      p_date_from:    body.date_from,
      p_date_to:      body.date_to,
      p_farm_id:      body.farm_id     || null,
      p_supplier_id:  body.supplier_id || null,
      p_item_id:      body.item_id     || null,
    }),
    columns: [
      { key: 'txn_date',       header: 'تاریخ',          width: 14 },
      { key: 'supplier_name',  header: 'تأمین‌کننده',    width: 22 },
      { key: 'item_name',      header: 'کالا',           width: 28 },
      { key: 'item_unit',      header: 'واحد',           width: 10 },
      { key: 'qty',            header: 'مقدار',          width: 12 },
      { key: 'unit_price',     header: 'قیمت واحد',      width: 16 },
      { key: 'total_amount',   header: 'مبلغ کل',        width: 22 },
      { key: 'reference_no',   header: 'مرجع/شماره سند', width: 18 },
    ],
  },

  // ------------------------------------------------------------------
  // RPT_PACKAGING — packaging-items consumption. Modeled on RPT_CONSUMPTION_REPORT
  // (same column philosophy: closing balance + rial value + totals row) but
  // WITHOUT the hall filter/column since packaging items are farm-scoped
  // (per user spec).
  // ------------------------------------------------------------------
  RPT_PACKAGING: {
    rpcName: 'reporting_packaging_v3',
    allowedRoles: ['admin', 'supervisor', 'operator'],
    sheetName: 'اقلام بسته‌بندی',
    title: 'گزارش اقلام بسته‌بندی',
    perfBudget: { p95Ms: 2500 },
    totalsColumns: ['consumed_qty', 'rial_value'],
    mapFilters: (body) => ({
      p_date_from: body.date_from,
      p_date_to:   body.date_to,
      p_farm_id:   body.farm_id || null,
      // category is forced to 'packaging' regardless of caller body —
      // packaging items only exist in the packaging category. Future
      // pass may let the operator pick a sub-category subtype.
      p_category:  'packaging',
    }),
    columns: [
      { key: 'item_name',     header: 'کالای بسته‌بندی',  width: 28 },
      { key: 'item_unit',     header: 'واحد',            width: 10 },
      { key: 'consumed_qty',  header: 'مصرف/خروج',       width: 14 },
      { key: 'rial_value',    header: 'ارزش ریالی',      width: 22 },
      { key: 'closing_balance', header: 'مانده انبار',   width: 14 },
    ],
  },

  // ------------------------------------------------------------------
  // RPT_REORDER_POINT — current on-hand × ABC class × reorder point
  // recommendation. ABC class is computed server-side based on a
  // 90-day moving window; the SPA's `basis` parameter (value|quantity)
  // selects WHICH metric ABC uses.
  // ------------------------------------------------------------------
  RPT_REORDER_POINT: {
    rpcName: 'reporting_reorder_point_v3',
    allowedRoles: ['admin', 'supervisor'],
    sheetName: 'نقطه سفارش کالا',
    title: 'نقطه سفارش کالا + ABC',
    perfBudget: { p95Ms: 2500 },
    // Non-numeric summary count is rendered as a "کل اقلام نیازمند سفارش"
    // cell; we don't shout a totals row at the BFF layer (the chip
    // "فقط نیازمند سفارش" already serves this on-screen).
    totalsColumns: [],
    mapFilters: (body) => ({
      p_farm_id:        body.farm_id || null,
      p_basis:          body.basis === 'quantity' ? 'quantity' : 'value',
      p_abc_class:      ['A', 'B', 'C'].includes(body.abcClass) ? body.abcClass : null,
      // `p_reorder_needed_only` round-trips as a literal boolean — do NOT
      // `body.X || null` (false → null). Pattern from RPT_SUPPLIERS,
      // preserved here.
      p_reorder_needed_only:
        typeof body.reorderNeededOnly === 'boolean' ? body.reorderNeededOnly : null,
    }),
    columns: [
      { key: 'item_name',             header: 'کالا',           width: 28 },
      { key: 'farm_name',             header: 'فارم',           width: 18 },
      { key: 'item_unit',             header: 'واحد',           width: 10 },
      { key: 'on_hand_qty',           header: 'موجودی فعلی',    width: 14 },
      { key: 'reorder_point',         header: 'نقطه سفارش',     width: 14 },
      { key: 'avg_daily_consumption', header: 'مصرف روزانه',    width: 14 },
      { key: 'abc_class',             header: 'کلاس ABC',       width: 12 },
      { key: 'reorder_recommended',   header: 'پیشنهاد سفارش',  width: 16 },
    ],
    // Soft-warning fill on rows where reorder_recommended = true AND
    // abc_class = A — that's the highest-priority slot. Future Pass 2
    // may generalize with a per-ABC threshold.
    lowStockColumn: 'reorder_recommended',
    lowStockThreshold: 1,
  },
};

/** Reports a caller (or smoke test) can introspect for help/error pages. */
export function listReportIds() {
  return Object.keys(reportRegistry);
}
