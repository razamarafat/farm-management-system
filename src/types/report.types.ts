// =====================================================================
// Morvarid-Farm — Reports framework public types
//
// These shapes are shared by:
//   - src/components/reports/*  (FilterBar / Table / ColumnChooser / ...)
//   - src/pages/ReportsHomePage.tsx (selector → drill-down)
//   - src/store/reportViewsStore.ts   (persisted per-user Saved Views)
//
// IMPORTANT: keep this file free of runtime side-effects. It's pure
// type-shape + a tiny static catalog used by the tile-selector UI.
// =====================================================================

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** A single column declared by a report. */
export interface ColumnDef<T = Record<string, unknown>> {
  /** Stable key used for sort / show-hide persistence / cell lookup. */
  key: string;
  /** Persian header label rendered in <thead>. */
  header: string;
  /** Right-aligned numeric columns render in left-to-right LTR gap with Persian digits. */
  align?: 'right' | 'left' | 'center';
  /** Mark numeric for both LTR alignment and Persian-digit formatting on render. */
  numeric?: boolean;
  /** Optional formatter (defaults to String(row[key])). Receives the row + the resolved cell value. */
  render?: (row: T, raw: unknown) => ReactNode;
  /** When true, column is sortable. Default: true. */
  sortable?: boolean;
  /** Default sort direction the column starts in when first clicked. */
  defaultSort?: 'asc' | 'desc';
  /** Tailwind min-width class, e.g. 'min-w-[120px]'. */
  className?: string;
}

/** Quick-pick date range preset for the FilterBar. */
export type DateRangePreset =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'custom';

/** Multi-select identifier (uuids from the DB). */
export interface ListOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** FilterBar state — every field is optional except `datePreset` or explicit dates. */
export interface ReportFiltersState {
  datePreset: DateRangePreset;
  /** ISO "yyyy-MM-dd" — populated when datePreset === 'custom'. */
  dateFrom?: string;
  /** ISO "yyyy-MM-dd" — populated when datePreset === 'custom'. */
  dateTo?: string;
  farmIds: string[]; // empty = scope-wide
  hallIds: string[];
  itemIds: string[];
  supplierIds: string[];
  /** Free-text category filter, multi-select. Use 'feed' / 'packaging' / custom strings. */
  categories: string[];
  /** Transaction-type filter — used by ledger / movement reports. Empty = all types. */
  txnTypes: string[];
  /** Formula filter — used by consumption analytics. Empty = all formulas. */
  formulaIds: string[];
  /** Pareto basis — used by RPT_PARETO_CLASSIFICATION. 'value' (default) | 'quantity'. */
  abcBasis?: 'value' | 'quantity';
}

/** Sort definition held by the table. */
export interface SortState {
  columnKey: string;
  direction: 'asc' | 'desc';
}

/** A user's saved view — captured snapshot of (filters + visibleCols + sort). */
export interface SavedReportView {
  id: string;
  reportId: string;
  name: string;
  filters: ReportFiltersState;
  visibleColumns: string[]; // column keys in user's preferred order
  sort: SortState | null;
  createdAt: string; // ISO
}

/** Static metadata for the tile selector. No data — just navigation. */
export interface ReportDefinition {
  id: string;                    // matches db-contract catalog IDs (RPT-001..RPT-014)
  title: string;                 // Persian title
  subtitle?: string;             // English / industry label
  description: string;           // 1-line summary used in the tile body
  icon: LucideIcon;              // lucide-react icon
  group: 'inventory' | 'consumption' | 'purchase' | 'valuation' | 'kpi';
  /** "ready" = framework demo wired; "stub" = tile clicks to empty-state placeholder. */
  status: 'ready' | 'stub';
}

// ---------------------------------------------------------------------
// 14-report catalog metadata (mirrors docs/reports/report-catalog.md).
// Icon imports are intentionally deferred to the catalog consumer
// (ReportsHomePage) to keep this file dependency-free.
// ---------------------------------------------------------------------
export type ReportCatalogEntry = Omit<ReportDefinition, 'icon'> & {
  iconName: string; // lucide icon name, resolved by ReportsHomePage via iconMap
};

export const REPORT_CATALOG: readonly ReportCatalogEntry[] = [
  { id: 'RPT-001', title: 'موجودی فعلی انبار',          subtitle: 'Stock Balance (current)',
    description: 'خلاصه موجودی به تفکیک کالا و فارم',
    group: 'inventory',  status: 'ready', iconName: 'Warehouse' },
  { id: 'RPT-002', title: 'گردش انبار',                  subtitle: 'Inventory Ledger (full)',
    description: 'تمام حرکات انبار به ترتیب زمان برای یک کالا',
    group: 'inventory',  status: 'stub',  iconName: 'ScrollText' },
  { id: 'RPT-003', title: 'گردش خلاصه',                 subtitle: 'Consolidated Ledger',
    description: 'حرکات روزانه با جمع موجودی لحظه‌ای',
    group: 'inventory',  status: 'stub',  iconName: 'ListOrdered' },
  { id: 'RPT_INVENTORY_LEDGER', title: 'گردش کامل انبار',    subtitle: 'Inventory Ledger (audit-grade)',
    description: 'تمام حرکات انبار با موجودی لحظه‌ای — فیلتر بر اساس تاریخ، فارم، کالا، نوع تراکنش — با جستجو و گروه‌بندی بر اساس کالا',
    group: 'inventory',  status: 'ready', iconName: 'ScrollText' },
  { id: 'RPT-004', title: 'خرید و انتقال',               subtitle: 'Purchases & Transfers',
    description: 'خریدها و انتقالات بین فارم‌ها',
    group: 'purchase',   status: 'stub',  iconName: 'ShoppingCart' },
  { id: 'RPT-005', title: 'مصرف روزانه',                subtitle: 'Daily Voucher Consumption',
    description: 'مصرف روزانه بر اساس روز مصرف',
    group: 'consumption',status: 'stub',  iconName: 'ClipboardList' },
  { id: 'RPT_CONSUMPTION_ANALYTICS', title: 'تحلیل مصرف',          subtitle: 'Consumption Analytics',
    description: 'خلاصه مصرف با امکان تغییر گروه‌بندی (روز/کالا/سالن/فرمول) + هشدار مصرف غیرعادی',
    group: 'consumption',status: 'ready', iconName: 'LineChart' },
  { id: 'RPT-006', title: 'خلاصه بر اساس سالن',         subtitle: 'Summary by Hall',
    description: 'جمع مصرف هر سالن در بازه',
    group: 'consumption',status: 'stub',  iconName: 'LayoutGrid' },
  { id: 'RPT-007', title: 'خلاصه بر اساس کالا',         subtitle: 'Summary by Item',
    description: 'جمع مصرف هر قلم در بازه',
    group: 'consumption',status: 'stub',  iconName: 'Package' },
  { id: 'RPT-008', title: 'ABC کلاس‌بندی',               subtitle: 'ABC Classification',
    description: 'طبقه‌بندی اقلام پرمصرف / کم‌مصرف',
    group: 'valuation',  status: 'stub',  iconName: 'BarChart3' },
  { id: 'RPT_PARETO_CLASSIFICATION', title: 'طبقه‌بندی پارتو (ABC) + پیشنهاد سفارش', subtitle: 'Pareto Classification + Reorder Hints',
    description: 'کلاس‌بندی A/B/C بر اساس مصرف دوره (ارزش یا مقدار) + سهم تجمعی — با پیشنهاد سفارش‌گذاری مبتنی بر نقطهٔ سفارش هر کالا',
    group: 'valuation',  status: 'ready', iconName: 'PieChart' },
  { id: 'RPT_INVENTORY_VALUATION_SUMMARY', title: 'ارزش موجودی', subtitle: 'Inventory Valuation Summary',
    description: 'موجودی و ارزش ریالی هر کالا در تاریخ دلخواه — با کلیک روی کالا، گردش ۹۰ روز اخیر باز می‌شود',
    group: 'valuation',  status: 'ready', iconName: 'BadgeDollarSign' },
  { id: 'RPT-010', title: 'پیر شدگی کالا',               subtitle: 'Inventory Aging',
    description: 'سن هر قلم در انبار بر اساس آخرین حرکت — با امکان فیلتر بر اساس بازهٔ سنی و شناسایی اقلام راکد',
    group: 'inventory',  status: 'stub',  iconName: 'Clock' },
  { id: 'RPT_INVENTORY_AGING', title: 'پیر شدگی موجودی + اقلام راکد', subtitle: 'Inventory Aging + Dead Stock',
    description: 'هر کالا به تفکیک بازهٔ سنی (۰–۳۰ / ۳۱–۶۰ / ۶۱–۹۰ / ۹۰+) و علامت‌گذاری اقلام راکد — کالا روی ردیف، گردش کالا باز می‌شود',
    group: 'inventory',  status: 'ready', iconName: 'Hourglass' },
  { id: 'RPT-011', title: 'گردش انبار',                  subtitle: 'Inventory Turnover',
    description: 'نسبت مصرف به موجودی میانگین',
    group: 'kpi',        status: 'stub',  iconName: 'RefreshCw' },
  { id: 'RPT-012', title: 'روزهای موجودی',               subtitle: 'Days-on-Hand',
    description: 'چند روز تا رسیدن به نقطهٔ سفارش',
    group: 'kpi',        status: 'stub',  iconName: 'Calendar' },
  { id: 'RPT-013', title: 'نقطهٔ سفارش / موجودی اطمینان', subtitle: 'Reorder & Safety Stock',
    description: 'پیشنهاد نقطهٔ سفارش با احتساب مصرف و زمان تحویل',
    group: 'kpi',        status: 'stub',  iconName: 'AlertTriangle' },
  { id: 'RPT-014', title: 'اقلام منفی / زیر صفر',       subtitle: 'Negative Stock Watch',
    description: 'اقلامی که مصرف از موجودی اولیه پیشی گرفته',
    group: 'kpi',        status: 'stub',  iconName: 'AlertOctagon' },
] as const;

/** Default starting filter (matches the "ماه جاری" preset ergonomics). */
export const defaultReportFilters: ReportFiltersState = {
  datePreset: 'this_month',
  farmIds: [],
  hallIds: [],
  itemIds: [],
  supplierIds: [],
  categories: [],
  txnTypes: [],
  formulaIds: [],
  abcBasis: 'value',
};

/** Common empty-state copy shared by all reports. */
export const REPORT_EMPTY_MESSAGE = 'هیچ داده‌ای برای این فیلترها یافت نشد';
