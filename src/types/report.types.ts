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
//
// === AUTHORITATIVE 6-REPORT CATALOG (approved 2026-07-08 redesign) ===
// See docs/reports/reports-menu-redesign.md §3 for the mapping rationale.
// 18 prior tile entries (6 ready + 12 stubs) collapsed into these 6.
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

/** FilterBar state — every field is optional. */
export interface ReportFiltersState {
  datePreset: DateRangePreset;
  /** ISO "yyyy-MM-dd" — populated when datePreset === 'custom'. */
  dateFrom?: string;
  /** ISO "yyyy-MM-dd" — populated when datePreset === 'custom'. */
  dateTo?: string;
  farmIds: string[];
  hallIds: string[];
  itemIds: string[];
  supplierIds: string[];
  /** Free-text category filter, multi-select. Use 'feed' / 'packaging' / custom strings. */
  categories: string[];
  /** Transaction-type filter — used by ledger / movement reports. Empty = all types. */
  txnTypes: string[];
  /** Formula filter — used by consumption report. Empty = all formulas. */
  formulaIds: string[];
  /** Consumption grouping axis. */
  groupBy?: 'day' | 'item' | 'hall' | 'formula';
  /**
   * For packaging: hard-coded `category='packaging'`; for consumption: 'feed'.
   * For the reorder report: 'value' | 'quantity' (basis for ABC).
   */
  categoryBasis?: 'feed' | 'packaging' | 'value' | 'quantity';
  /** Reorder-point filter: only show items needing reorder. */
  reorderNeededOnly?: boolean;
  /** Reorder-point filter: only show items in this ABC class. */
  abcClassFilter?: 'A' | 'B' | 'C' | null;
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
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  icon: LucideIcon;
  group: 'inventory' | 'consumption' | 'purchase' | 'valuation' | 'kpi';
  /** "ready" = wired to live data; "stub" = framework chrome only. */
  status: 'ready' | 'stub';
}

export type ReportCatalogEntry = Omit<ReportDefinition, 'icon'> & {
  iconName: string;
};

// ---------------------------------------------------------------------
// AUTHORITATIVE 6-REPORT CATALOG — matches services/export-api/registry.mjs
// export IDs + the SQL RPC names in scripts/migrations/014_reporting_v3.sql
// (Phase-3 cutover). Do not add ids outside this set; if a new report is
// needed, run the design-review workflow before adding.
// ---------------------------------------------------------------------
export const REPORT_CATALOG: readonly ReportCatalogEntry[] = [
  {
    id: 'RPT_INVENTORY_STOCK',
    title: 'موجودی انبار',
    subtitle: 'Inventory Stock',
    description: 'موجودی فعلی هر کالا + ارزش ریالی + سن حرکت + وضعیت راکد — با کلیک روی ردیف، گردش ۹۰ روز اخیر باز می‌شود',
    group: 'inventory',
    status: 'stub',
    iconName: 'Warehouse',
  },
  {
    id: 'RPT_CONSUMPTION_REPORT',
    title: 'گزارش مصرف',
    subtitle: 'Consumption Report',
    description: 'مصرف با بازه تاریخی، انتخاب سالن، و ستون مانده انبار و ارزش ریالی + ردیف جمع — گروه‌بندی روز/کالا/سالن/فرمول',
    group: 'consumption',
    status: 'stub',
    iconName: 'BarChart3',
  },
  {
    id: 'RPT_SALES_TRANSFERS',
    title: 'گزارش فروش و انتقال بین انبارها',
    subtitle: 'Sales & Inter-Warehouse Transfers',
    description: 'انتقالات بین فارم‌ها + (هنگام فعال‌شدن ثبت فروش) فروش‌ها — با فیلتر تاریخ و فارم مبدأ/مقصد',
    group: 'purchase',
    status: 'stub',
    iconName: 'RefreshCw',
  },
  {
    id: 'RPT_PURCHASES',
    title: 'گزارش خریدها',
    subtitle: 'Purchases Report',
    description: 'خریدها با تأمین‌کننده، کالا، قیمت واحد و مبلغ کل — گروه‌بندی روز/تأمین‌کننده/کالا',
    group: 'purchase',
    status: 'stub',
    iconName: 'ShoppingCart',
  },
  {
    id: 'RPT_PACKAGING',
    title: 'گزارش اقلام بسته‌بندی',
    subtitle: 'Packaging Items Report',
    description: 'مصرف اقلام بسته‌بندی + مانده انبار و ارزش ریالی — بدون فیلتر سالن (ردیابی در سطح فارم)',
    group: 'consumption',
    status: 'stub',
    iconName: 'Package',
  },
  {
    id: 'RPT_REORDER_POINT',
    title: 'نقطه سفارش کالا',
    subtitle: 'Reorder Point + ABC',
    description: 'اقلام نیازمند سفارش با کلاس A/B/C (ارزش یا مقدار) — پیشنهاد اولویت‌بندی سفارش',
    group: 'valuation',
    status: 'stub',
    iconName: 'AlertTriangle',
  },
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
  groupBy: 'item',
  categoryBasis: 'value',
  reorderNeededOnly: false,
  abcClassFilter: null,
};

/** Common empty-state copy shared by all reports. */
export const REPORT_EMPTY_MESSAGE = 'هیچ داده‌ای برای این فیلترها یافت نشد';
