// =====================================================================
// reportColumns — per-report ColumnDef declarations for the 6 NEW
// v3 reporting_* reports + the legacy RPT-001 + RPT_INVENTORY_VALUATION_SUMMARY.
//
// ColumnDef shape mirrors services/export-api/registry.mjs's `columns[]`
// spec field-for-field on Persian header + key. We auto-derive
// `align` (numeric → left, ends with `_date` → center, otherwise → right)
// and `numeric` (`numeric: true` on columns where the suffix implies
// qty/rial/amount/value/price/count/days) so the framework's
// right-aligned numeric renderer kicks in for Persian-digit + LTR layout.
//
// `getReportColumnsFromBff(id)` returns the matching entry, or [] when
// the report ID isn't yet declared (the framework shows the empty-state
// placeholder until each section's hook is wired).
// =====================================================================

import type { ColumnDef } from '@/types/report.types';

export type ColumnRegistry = Record<string, ColumnDef<Record<string, unknown>>[]>;

// ----- spec table → ColumnDef[] helper ---------------------------------
interface ColSpec {
  key: string;
  header: string;
  align?: 'right' | 'left' | 'center';
  numeric?: boolean;
  className?: string;
}

const build = (specs: ColSpec[]): ColumnDef[] =>
  specs.map((s) => {
    const numeric = s.numeric ?? NUMERIC_KEYS.test(s.key);
    const align =
      s.align ?? (numeric ? 'left' : s.key.endsWith('_date') ? 'center' : 'right');
    return { key: s.key, header: s.header, align, numeric, className: s.className };
  });

const NUMERIC_KEYS =
  /(_qty|_count|_rial|_price|_amount|_value|_days|days_since|\bid\b|_balance|_share)/i;

// ----- RPT-001 (legacy) ----------------------------------------------
const rpt001: ColumnDef[] = build([
  { key: 'item_name',    header: 'نام کالا' },
  { key: 'item_unit',    header: 'واحد', align: 'center' },
  { key: 'item_category',header: 'دسته', align: 'center' },
  { key: 'farm_name',    header: 'فارم' },
  { key: 'on_hand_qty',  header: 'موجودی (پایان)', numeric: true },
  { key: 'unit_cost',    header: 'قیمت واحد (ریال)', numeric: true },
  { key: 'value_rial',   header: 'ارزش (ریال)', numeric: true },
]);

// ----- RPT_INVENTORY_VALUATION_SUMMARY (legacy) ---------------------
const rptInventoryValuationSummary: ColumnDef[] = build([
  { key: 'item_name',    header: 'نام کالا' },
  { key: 'item_unit',    header: 'واحد', align: 'center' },
  { key: 'item_category',header: 'دسته', align: 'center' },
  { key: 'farm_name',    header: 'فارم' },
  { key: 'on_hand_qty',  header: 'موجودی', numeric: true },
  { key: 'unit_cost',    header: 'قیمت واحد (آخرین خرید)', numeric: true },
  { key: 'value_rial',   header: 'ارزش (ریال)', numeric: true },
  { key: 'priced_on',    header: 'تاریخ آخرین قیمت', align: 'center' },
]);

// ----- RPT_INVENTORY_STOCK ------------------------------------------
const rptInventoryStock: ColumnDef[] = build([
  { key: 'farm_name',               header: 'فارم' },
  { key: 'item_name',               header: 'کالا' },
  { key: 'item_category',           header: 'دسته', align: 'center' },
  { key: 'item_unit',               header: 'واحد', align: 'center' },
  { key: 'on_hand_qty',             header: 'موجودی', numeric: true },
  { key: 'unit_cost',               header: 'قیمت واحد (ریال)', numeric: true },
  { key: 'value_rial',              header: 'ارزش (ریال)', numeric: true },
  { key: 'last_movement_date',      header: 'آخرین حرکت', align: 'center' },
  { key: 'days_since_last_movement',header: 'سن (روز)', numeric: true, align: 'center' },
  { key: 'is_dead_stock',           header: 'راکد', align: 'center' },
]);

// ----- RPT_CONSUMPTION_REPORT ---------------------------------------
const rptConsumptionReport: ColumnDef[] = build([
  { key: 'group_key',       header: 'کلید' },
  { key: 'group_label',     header: 'گروه' },
  { key: 'item_category',   header: 'دسته', align: 'center' },
  { key: 'hall_name',       header: 'سالن' },
  { key: 'formula_name',    header: 'فرمول' },
  { key: 'consumed_qty',    header: 'مصرف', numeric: true },
  { key: 'waste_qty',       header: 'ضایعات', numeric: true },
  { key: 'unit_price',      header: 'قیمت واحد', numeric: true },
  { key: 'rial_value',      header: 'ارزش ریالی', numeric: true },
  { key: 'closing_balance', header: 'مانده انبار', numeric: true },
  { key: 'voucher_count',   header: 'تعداد حواله', numeric: true },
]);

// ----- RPT_SALES_TRANSFERS ------------------------------------------
const rptSalesTransfers: ColumnDef[] = build([
  { key: 'txn_date',     header: 'تاریخ', align: 'center' },
  { key: 'txn_type',     header: 'نوع', align: 'center' },
  { key: 'source_farm',  header: 'مبدأ' },
  { key: 'dest_farm',    header: 'مقصد' },
  { key: 'item_name',    header: 'کالا' },
  { key: 'item_unit',    header: 'واحد', align: 'center' },
  { key: 'qty',          header: 'مقدار', numeric: true },
  { key: 'unit_price',   header: 'قیمت واحد', numeric: true },
  { key: 'amount',       header: 'مبلغ', numeric: true },
  { key: 'reference_no', header: 'مرجع' },
]);

// ----- RPT_PURCHASES ------------------------------------------------
const rptPurchases: ColumnDef[] = build([
  { key: 'txn_date',       header: 'تاریخ', align: 'center' },
  { key: 'supplier_name',  header: 'تأمین‌کننده' },
  { key: 'item_name',      header: 'کالا' },
  { key: 'item_unit',      header: 'واحد', align: 'center' },
  { key: 'qty',            header: 'مقدار', numeric: true },
  { key: 'unit_price',     header: 'قیمت واحد', numeric: true },
  { key: 'total_amount',   header: 'مبلغ کل', numeric: true },
  { key: 'reference_no',   header: 'مرجع/شماره سند' },
]);

// ----- RPT_PACKAGING ------------------------------------------------
const rptPackaging: ColumnDef[] = build([
  { key: 'item_name',       header: 'کالای بسته‌بندی' },
  { key: 'item_unit',       header: 'واحد', align: 'center' },
  { key: 'consumed_qty',    header: 'مصرف/خروج', numeric: true },
  { key: 'rial_value',      header: 'ارزش ریالی', numeric: true },
  { key: 'closing_balance', header: 'مانده انبار', numeric: true },
]);

// ----- RPT_REORDER_POINT --------------------------------------------
// NOTE: reorder_recommended + abc_class get custom render() on the
// section component (Persian A/B/C chip + green check). Numeric stack:
// on_hand_qty, reorder_point, avg_daily_consumption. Sortable: per
// numeric + per text label.
const rptReorderPoint: ColumnDef[] = build([
  { key: 'item_name',             header: 'کالا' },
  { key: 'farm_name',             header: 'فارم' },
  { key: 'item_unit',             header: 'واحد', align: 'center' },
  { key: 'on_hand_qty',           header: 'موجودی فعلی', numeric: true },
  { key: 'reorder_point',         header: 'نقطه سفارش', numeric: true },
  { key: 'avg_daily_consumption', header: 'مصرف روزانه', numeric: true },
  { key: 'abc_class',             header: 'کلاس ABC', align: 'center' },
  { key: 'reorder_recommended',   header: 'پیشنهاد سفارش', align: 'center' },
]);

// ----- Registry — keys must match src/types/report.types.ts's
// REPORT_CATALOG exactly.
export const REPORT_COLUMNS: ColumnRegistry = {
  'RPT-001': rpt001,
  'RPT_INVENTORY_VALUATION_SUMMARY': rptInventoryValuationSummary,
  'RPT_INVENTORY_STOCK': rptInventoryStock,
  'RPT_CONSUMPTION_REPORT': rptConsumptionReport,
  'RPT_SALES_TRANSFERS': rptSalesTransfers,
  'RPT_PURCHASES': rptPurchases,
  'RPT_PACKAGING': rptPackaging,
  'RPT_REORDER_POINT': rptReorderPoint,
} as const;

export function getReportColumnsFromBff(reportId: string): ColumnDef[] {
  return REPORT_COLUMNS[reportId] ?? [];
}
