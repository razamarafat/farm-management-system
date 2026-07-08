// =====================================================================
// reportColumns — per-report ColumnDef declarations.
//
// The framework is data-source agnostic. For demo purposes, only
// RPT-001 (Stock Balance) is fully wired with a 7-column catalog.
// Other reports return `[]` to short-circuit the framework chrome:
// they show the FilterBar + ColumnChooser + Table (empty) + saved-views
// modal, but no real data fetcher is wired until each report lands.
//
// This file is intentionally small so that when each new report's
// hook (e.g. useStockBalanceReport()) becomes available, this mapper
// simply appends the matching columns.
// =====================================================================

import type { ColumnDef } from '@/types/report.types';

export type ColumnRegistry = Record<string, ColumnDef<Record<string, unknown>>[]>;

// RPT-001 — Stock Balance (current)
const rpt001: ColumnDef<Record<string, unknown>>[] = [
  { key: 'item_name',    header: 'نام کالا',           align: 'right' },
  { key: 'item_unit',    header: 'واحد',               align: 'center', numeric: true, sortable: false, className: 'w-20' },
  { key: 'item_category',header: 'دسته',               align: 'center' },
  { key: 'farm_name',    header: 'فارم',               align: 'right' },
  { key: 'on_hand_qty',  header: 'موجودی (پایان)',     align: 'left',  numeric: true },
  { key: 'unit_cost',    header: 'قیمت واحد (ریال)',   align: 'left',  numeric: true },
  { key: 'value_rial',   header: 'ارزش (ریال)',        align: 'left',  numeric: true },
];

// RPT_INVENTORY_LEDGER — column set is deliberately NOT declared here.
// The report renders through a dedicated InventoryLedgerSection
// (load-more pagination + quick search + group-by-item + hall-data
// cache) rather than the generic ReportTable, so ColumnDef entries
// would be dead code. If a future "Export to Excel full columns"
// view lands, declare the columns here at that point.

// RPT_INVENTORY_VALUATION_SUMMARY
// Uses reporting_inventory_balance_as_of (Postgres RPC). Row key set:
//   item_name, item_unit, item_category, farm_name (joined via farm_id),
//   on_hand_qty, unit_cost, priced_on (alias for "Last Priced Date"),
//   value_rial (qty × unit_cost; NULL when unit_cost is unpriced).
// The row's `item_id` and `farm_id` are kept on the record (not visible)
// so the drilldown side-panel can call useItemLedger directly with no
// re-derivation.
const rptInventoryValuationSummary: ColumnDef<Record<string, unknown>>[] = [
  { key: 'item_name',    header: 'نام کالا',                  align: 'right' },
  { key: 'item_unit',    header: 'واحد',                      align: 'center', sortable: false, className: 'w-20' },
  { key: 'item_category',header: 'دسته',                      align: 'center', sortable: false },
  { key: 'farm_name',    header: 'فارم',                      align: 'right' },
  { key: 'on_hand_qty',  header: 'موجودی',                    align: 'left', numeric: true },
  { key: 'unit_cost',    header: 'قیمت واحد (آخرین خرید)',   align: 'left', numeric: true },
  { key: 'value_rial',   header: 'ارزش (ریال)',               align: 'left', numeric: true },
  { key: 'priced_on',    header: 'تاریخ آخرین قیمت',          align: 'center', sortable: false, className: 'w-32' },
];

// Empty placeholder for stub reports — keeps the framework chaining
// clean while clearly signalling "no declared columns yet".
const emptyArr: ColumnDef<Record<string, unknown>>[] = [];

export const REPORT_COLUMNS: ColumnRegistry = {
  'RPT-001': rpt001,
  'RPT-002': emptyArr,
  'RPT-003': emptyArr,
  'RPT-004': emptyArr,
  'RPT-005': emptyArr,
  'RPT-006': emptyArr,
  'RPT-007': emptyArr,
  'RPT-008': emptyArr,
  'RPT_INVENTORY_VALUATION_SUMMARY': rptInventoryValuationSummary,

  'RPT-010': emptyArr,
  'RPT-011': emptyArr,
  'RPT-012': emptyArr,
  'RPT-013': emptyArr,
  'RPT-014': emptyArr,
};

export function getReportColumns(reportId: string): ColumnDef<Record<string, unknown>>[] {
  return REPORT_COLUMNS[reportId] ?? [];
}
