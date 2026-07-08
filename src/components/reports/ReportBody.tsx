// =====================================================================
// ReportBody — drill-down view for ONE report.
//
// This component is the per-report state container. It MUST stay at
// module scope (NOT defined inside ReportsHomePage) so that React
// preserves its identity across parent renders — otherwise every keystroke
// in the parent would re-create the component ref and force an unmount
// + remount, losing focus and state.
//
// The parent keys it with `report.id`, so:
//   - On report switch, React unmounts the old ReportBody and mounts a
//     new one. Every useState lazy initializer re-fires, reading the
//     fresh persisted slice for the new report.id from
//     useReportViewsStore.
//   - Mount-time effects (none here currently) also re-fire — that's
//     why we don't put fetch-on-mount hooks in this component.
//
// Filters are NOT persisted per-report: we don't want a user's
// "stock balance today" filters to leak into their "purchase summary"
// filters on report switch. Instead, the user can save filters as a
// Saved View explicitly via the modal — the discoverable path.
//
// Reports handled:
//   - RPT-001                       : static demo (kept for backwards compat).
//   - RPT_INVENTORY_VALUATION_SUMMARY :
//                                     live RPC via useInventoryValuationSummary +
//                                     drilldown into useItemLedger.
//   - RPT_INVENTORY_LEDGER          : live RPC via useInventoryLedgerReport +
//                                     dedicated InventoryLedgerSection (load-more
//                                     pagination + quick search + group-by-item).
//                                     Same drilldown as the valuation report.
//   - others                        : framework chrome only (stub placeholder).
// =====================================================================

import { memo, useCallback, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { ReportShell, PAGE_SIZE_DEFAULT } from './ReportShell';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ReportFilterBar } from './ReportFilterBar';
import { ReportSavedViews } from './ReportSavedViews';
import { ItemLedgerPanel } from './ItemLedgerPanel';
import { InventoryLedgerSection } from './InventoryLedgerSection';
import { ConsumptionAnalyticsSection } from './ConsumptionAnalyticsSection';
import { InventoryAgingSection } from './InventoryAgingSection';
import { ParetoClassificationSection } from './ParetoClassificationSection';
import { getReportColumns } from './reportColumns';
import { triggerServerExport } from '@/lib/excelServer';
import {
  useReportViewsStore,
  buildSavedView,
} from '@/store/reportViewsStore';
import {
  useInventoryValuationSummary,
  type InventoryValuationRow,
} from '@/hooks/useInventoryValuationSummary';
import type { UseInventoryLedgerReportParams } from '@/hooks/useInventoryLedgerReport';
import { defaultReportFilters } from '@/types/report.types';
import type {
  ListOption,
  ReportCatalogEntry,
  ReportFiltersState,
  DateRangePreset,
  SavedReportView,
  SortState,
} from '@/types/report.types';
import { TXN_TYPE_LABELS, type TransactionType } from '@/types/inventory.types';
import { getJalaliToday, jalaliToGregorian } from '@/utils/jalaliDate';
import { toPersianDigits } from '@/utils/persianNumbers';
import { toast } from 'sonner';

// -------- module-scope constants ---------------------------------------
const REPORT_ID_INVENTORY_VALUATION = 'RPT_INVENTORY_VALUATION_SUMMARY';
const REPORT_ID_INVENTORY_LEDGER = 'RPT_INVENTORY_LEDGER';
const REPORT_ID_CONSUMPTION_ANALYTICS = 'RPT_CONSUMPTION_ANALYTICS';
const REPORT_ID_INVENTORY_AGING = 'RPT_INVENTORY_AGING';
const REPORT_ID_PARETO_CLASSIFICATION = 'RPT_PARETO_CLASSIFICATION';
const REPORT_ID_STOCK_BALANCE_DEMO = 'RPT-001';

// ----------------------------------------------------------------------------
// Static demo data so RPT-001 is fully interactive out of the box.
// Other reports stub through their data hook or empty.
// ----------------------------------------------------------------------------
type DemoRow = {
  id: string;
  item_name: string;
  item_unit: string;
  item_category: 'نهاده' | 'بسته‌بندی';
  farm_name: string;
  on_hand_qty: number;
  unit_cost: number;
  value_rial: number;
};

const DEMO_FARMS: ListOption[] = [
  { value: 'demo-1', label: 'فارم مرکزی' },
  { value: 'demo-2', label: 'فارم شماره ۲' },
];

const DEMO_HALLS: ListOption[] = [
  { value: 'demo-h-1', label: 'سالن ۱' },
  { value: 'demo-h-2', label: 'سالن ۲' },
  { value: 'demo-h-3', label: 'سالن ۳' },
];

const DEMO_ITEMS: ListOption[] = [
  { value: 'demo-i-1', label: 'ذرت (کیلوگرم)' },
  { value: 'demo-i-2', label: 'کنجاله سویا (کیلوگرم)' },
  { value: 'demo-i-3', label: 'پودر ماهی (کیلوگرم)' },
  { value: 'demo-i-4', label: 'مکمل معدنی (کیلوگرم)' },
  { value: 'demo-i-5', label: 'آرد گندم (کیلوگرم)' },
];

const DEMO_SUPPLIERS: ListOption[] = [
  { value: 'demo-s-1', label: 'تعاونی مرغداران' },
  { value: 'demo-s-2', label: 'بازار آزاد' },
];

const DEMO_FORMULAS: ListOption[] = [
  { value: 'demo-f-1', label: 'فرمول رشد (۲۱٪ پروتئین)' },
  { value: 'demo-f-2', label: 'فرمول پایانی (۱۸٪ پروتئین)' },
  { value: 'demo-f-3', label: 'فرمول مولد (۱۶٪ پروتئین)' },
];

const CATEGORY_OPTIONS: ListOption[] = [
  { value: 'feed', label: 'نهاده' },
  { value: 'packaging', label: 'بسته‌بندی' },
];

// ------------------------------------------------------------------------
// Transaction-type options for the ledger report's filter slot.
// Derived from TXN_TYPE_LABELS so the order matches the enum order in
// inventory.types.ts. Stable across reports — the framework only
// renders them when ReportBody passes `txnTypeOptions` to ReportShell.
// ------------------------------------------------------------------------
const TXN_TYPE_OPTIONS: ListOption[] = (
  Object.keys(TXN_TYPE_LABELS) as TransactionType[]
).map((k) => ({ value: k, label: TXN_TYPE_LABELS[k] }));

// ------------------------------------------------------------------------
// Translate a DateRangePreset into a concrete Gregorian (yyyy-MM-dd)
// {from, to} pair for the ledger hook. Required because the ledger
// RPC's p_date_from / p_date_to parameters are NOT NULL.
//   * today       → today
//   * this_week   → last 7 days inclusive
//   * this_month  → last 30 days inclusive (pragmatic v0 window)
//   * custom      → from/to, fallback to today if either is missing
//
// "today" derivation goes through the Jalali→Gregorian path
// (jalaliToGregorian(getJalaliToday())) so the IRST/East-of-GMT day
// boundary matches the rest of the SPA — never `new Date().toISOString()`
// which would return the UTC day and slip filters a day forward for
// operators east of GMT past their local midnight (audit TAX §4 +
// Known Limitations #3 followup).
// ------------------------------------------------------------------------
function ledgerRangeFromPreset(
  preset: DateRangePreset,
  customFrom: string | undefined,
  customTo: string | undefined,
): { from: string; to: string } {
  if (preset === 'custom') {
    return {
      from: customFrom ? jalaliToGregorian(customFrom) : jalaliToGregorian(getJalaliToday()),
      to: customTo ? jalaliToGregorian(customTo) : jalaliToGregorian(getJalaliToday()),
    };
  }
  const todayIso = jalaliToGregorian(getJalaliToday());
  if (preset === 'today') return { from: todayIso, to: todayIso };
  // For this_week / this_month, derive `startIso` by subtracting N
  // Gregorian days from the Jalali-derived "today". We trust
  // getJalaliToday() for the END anchor; the start anchor is a
  // relative day offset so a pure UTC delta is acceptable. Round-trip
  // through Gregorian convert and use Date.UTC (not `new Date(...)`)
  // to avoid local-TZ bleed. Guarded against a malformed ISO string
  // (Date.UTC with NaN throws RangeError on toISOString()) — falls
  // back to today in that pathological case.
  const isoFromJalali = jalaliToGregorian(getJalaliToday());
  const parts = isoFromJalali.split('-').map((s) => parseInt(s, 10));
  if (parts.length !== 3 || !parts.every(Number.isFinite)) {
    return { from: todayIso, to: todayIso };
  }
  const [gy, gm, gd] = parts;
  const utc = Date.UTC(gy, gm - 1, gd);
  const days = preset === 'this_week' ? 6 : 29; // this_month ≈ last 30 days
  const startIso = new Date(utc - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return { from: startIso, to: todayIso };
}

const DEMO_STOCK: DemoRow[] = [
  { id: '1', item_name: 'ذرت',                  item_unit: 'kg',  item_category: 'نهاده',     farm_name: 'فارم مرکزی',   on_hand_qty: 4250,  unit_cost: 38000,  value_rial: 161500000 },
  { id: '2', item_name: 'کنجالهٔ سویا',         item_unit: 'kg',  item_category: 'نهاده',     farm_name: 'فارم مرکزی',   on_hand_qty: 1820,  unit_cost: 52000,  value_rial: 94640000 },
  { id: '3', item_name: 'پودر ماهی',            item_unit: 'kg',  item_category: 'نهاده',     farm_name: 'فارم شماره ۲', on_hand_qty: 220,   unit_cost: 185000, value_rial: 40700000 },
  { id: '4', item_name: 'مکمل معدنی',           item_unit: 'kg',  item_category: 'نهاده',     farm_name: 'فارم مرکزی',   on_hand_qty: 95,    unit_cost: 240000, value_rial: 22800000 },
  { id: '5', item_name: 'آرد گندم',             item_unit: 'kg',  item_category: 'نهاده',     farm_name: 'فارم شماره ۲', on_hand_qty: 1440,  unit_cost: 27500,  value_rial: 39600000 },
  { id: '6', item_name: 'کیسهٔ ۲۵ کیلویی',     item_unit: 'عدد', item_category: 'بسته‌بندی', farm_name: 'فارم مرکزی',   on_hand_qty: 480,   unit_cost: 12000,  value_rial: 5760000 },
  { id: '7', item_name: 'لیبل چاپی',            item_unit: 'عدد', item_category: 'بسته‌بندی', farm_name: 'فارم مرکزی',   on_hand_qty: 12400, unit_cost: 850,    value_rial: 10540000 },
  { id: '8', item_name: 'جعبهٔ مقوایی',         item_unit: 'عدد', item_category: 'بسته‌بندی', farm_name: 'فارم شماره ۲', on_hand_qty: 230,   unit_cost: 22500,  value_rial: 5175000 },
  { id: '9', item_name: 'سلفون ۵ کیلویی',       item_unit: 'عدد', item_category: 'بسته‌بندی', farm_name: 'فارم مرکزی',   on_hand_qty: 60,    unit_cost: 68000,  value_rial: 4080000 },
  { id: '10', item_name: 'کاغذ بسته‌بندی',       item_unit: 'kg',  item_category: 'بسته‌بندی', farm_name: 'فارم شماره ۲', on_hand_qty: 320,   unit_cost: 14500,  value_rial: 4640000 },
];

interface ReportBodyProps {
  report: ReportCatalogEntry;
  userId: string;
}

function ReportBodyInner({ report, userId }: ReportBodyProps) {
  // ===========================================================================
  // Identity check (used to gate per-report behaviour).
  // ===========================================================================
  const isValuationReport = report.id === REPORT_ID_INVENTORY_VALUATION;
  const isLedgerReport = report.id === REPORT_ID_INVENTORY_LEDGER;
  const isConsumptionAnalytics = report.id === REPORT_ID_CONSUMPTION_ANALYTICS;
  const isInventoryAging = report.id === REPORT_ID_INVENTORY_AGING;
  const isParetoClassification = report.id === REPORT_ID_PARETO_CLASSIFICATION;

  // ===========================================================================
  // Initial state — read ONCE from the persisted store. Because the parent
  // keys us with report.id, every report switch re-mounts us, so these
  // initializers re-fire and pick up the new report.id's slice.
  // ===========================================================================
  const initialPersisted = useReportViewsStore.getState().scopes[userId];

  const [filters, setFilters] = useState<ReportFiltersState>(() => ({
    ...defaultReportFilters,
    // Valuation pivots on a single "as-of" date — start pinned to today
    // so the table has data the moment the user clicks the tile.
    datePreset:
      isValuationReport || isInventoryAging
        ? 'today'
        : defaultReportFilters.datePreset,
  }));
  // Debounced view of `filters` — fed to RPC-bound useMemo params so a
  // burst of chip/date edits collapses into ONE refetch instead of N.
  // 200 ms matches the audit's Per-Taxonomy §3 filter-debouncing MINOR
  // guidance (Known Limitations #4 followup). UI animations + saved
  // view loaders still see the un-debounced value.
  const debouncedFilters = useDebouncedValue(filters, 200);
  const [visibleColumns, setVisibleColumnsLocal] = useState<string[]>(() => {
    const declared = getReportColumns(report.id).map((c) => c.key);
    const persisted = initialPersisted?.visibleColumns?.[report.id];
    return persisted && persisted.length > 0
      ? persisted.filter((k) => declared.includes(k))
      : declared;
  });
  const [sort, setSortLocal] = useState<SortState | null>(
    () => initialPersisted?.sortByReport?.[report.id] ?? null,
  );
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(PAGE_SIZE_DEFAULT);
  const [valuationExporting, setValuationExporting] = useState(false);

  // ===========================================================================
  // Drilldown state — shared by the valuation report and the ledger report
  // (both surface the same ItemLedgerPanel on row click).
  // ===========================================================================
  const [drilldown, setDrilldown] = useState<{
    item_id: string;
    item_name: string;
    item_unit: string;
    item_category: string;
    farm_id: string;
    farm_name: string | null;
  } | null>(null);

  // ===========================================================================
  // Saved-Views modal state for the ledger branch (the valuation report's
  // modal is owned by ReportShell internally).
  // ===========================================================================
  const [savedViewsOpenLedger, setSavedViewsOpenLedger] = useState(false);

  // ===========================================================================
  // Store actions (stable references) + reactive scope read.
  // ===========================================================================
  const setVisibleColumns = useReportViewsStore((s) => s.setVisibleColumns);
  const setSortForReport = useReportViewsStore((s) => s.setSortForReport);
  const saveView = useReportViewsStore((s) => s.saveView);
  const deleteView = useReportViewsStore((s) => s.deleteView);
  const renameView = useReportViewsStore((s) => s.renameView);
  const scope = useReportViewsStore((s) => s.scopes[userId]);

  // ===========================================================================
  // Live data hooks — invoked unconditionally (rules-of-hooks) but each
  // short-circuits cheaply when its report id doesn't match.
  // ===========================================================================
  // Reads from `debouncedFilters` for cross-RPC-site consistency with
  // ledger/consumption/pareto params. valuation's `pAsOf` feeds
  // useInventoryValuationSummary() which is RPC-bound — a 200 ms
  // coalesce here lets the date-picker sweep behave identically to the
  // other reports (audit TAX §3 + Known Limitations #4 followup).
  const pAsOf = useMemo<string>(() => {
    if (!isValuationReport) return '';
    if (debouncedFilters.dateTo) return jalaliToGregorian(debouncedFilters.dateTo);
    if (debouncedFilters.dateFrom) return jalaliToGregorian(debouncedFilters.dateFrom);
    return jalaliToGregorian(getJalaliToday());
  }, [isValuationReport, debouncedFilters.dateFrom, debouncedFilters.dateTo]);

  const valuation = useInventoryValuationSummary({
    as_of: pAsOf,
    farm_id: debouncedFilters.farmIds[0] ?? null,
    category: debouncedFilters.categories[0] ?? null,
  });

  // Ledger hook params — the ledger branch owns this binding. We compute it
  // unconditionally so React's hook-list stays stable across reports.
  // Reads from `debouncedFilters` so a burst of chip/date edits collapses
  // into ONE refetch (200 ms debounce — see useDebouncedValue declaration).
  const ledgerParams = useMemo<UseInventoryLedgerReportParams>(() => {
    const range = ledgerRangeFromPreset(
      debouncedFilters.datePreset,
      debouncedFilters.dateFrom,
      debouncedFilters.dateTo,
    );
    return {
      date_from: range.from,
      date_to: range.to,
      farm_id: debouncedFilters.farmIds[0] ?? null,
      item_id: debouncedFilters.itemIds[0] ?? null,
      category: debouncedFilters.categories[0] ?? null,
      txnTypes: debouncedFilters.txnTypes.length > 0 ? debouncedFilters.txnTypes : null,
    };
  }, [
    debouncedFilters.datePreset,
    debouncedFilters.dateFrom,
    debouncedFilters.dateTo,
    debouncedFilters.farmIds,
    debouncedFilters.itemIds,
    debouncedFilters.categories,
    debouncedFilters.txnTypes,
  ]);

  // The Drilldown panel's `asOf` — for the valuation report it's the as-of
  // pivot. For the ledger report it's the date_to of the window (so the
  // panel naturally loads up to the ledger's "end of period"). For other
  // reports it's 'today'.
  const drilldownAsOf = useMemo<string>(() => {
    if (isValuationReport) return pAsOf;
    return ledgerParams.date_to || jalaliToGregorian(getJalaliToday());
  }, [isValuationReport, pAsOf, ledgerParams.date_to]);

  // Consumption-analytics params — reuse the same date-window helper used
  // by the ledger branch. GroupBy lives in the section's local state so
  // switching tabs refetches but never resets the date or farm filter.
  // Reads from debouncedFilters — same 200 ms coalescing rationale.
  const consumptionParams = useMemo<{
    date_from: string;
    date_to: string;
    farm_id: string | null;
    category: string | null;
  }>(() => {
    const range = ledgerRangeFromPreset(
      debouncedFilters.datePreset,
      debouncedFilters.dateFrom,
      debouncedFilters.dateTo,
    );
    return {
      date_from: range.from,
      date_to: range.to,
      farm_id: debouncedFilters.farmIds[0] ?? null,
      category: debouncedFilters.categories[0] ?? null,
    };
  }, [
    debouncedFilters.datePreset,
    debouncedFilters.dateFrom,
    debouncedFilters.dateTo,
    debouncedFilters.farmIds,
    debouncedFilters.categories,
  ]);

  // Inventory-aging params — single-shot as-of snapshot. Reuses the
  // date-window helper but always picks the END of the window so the
  // days_since_last_movement and bucket assignments stay deterministic.
  // Reads from debouncedFilters (audit TAX §3 + Known Limitations #4
  // followup) — agingAsOf feeds useInventoryAging() which is RPC-bound.
  const agingAsOf = useMemo<string>(() => {
    if (!isInventoryAging) return '';
    if (debouncedFilters.dateTo) return jalaliToGregorian(debouncedFilters.dateTo);
    return jalaliToGregorian(getJalaliToday());
  }, [isInventoryAging, debouncedFilters.dateTo]);

  // Pareto params — same date-window helper as ledger / consumption.
  // The basis selector lives in filters.abcBasis and is mirrored through
  // to the section via paretoBasis, which calls onBasisChange to update
  // filter state — keeps the persistence layer consistent across reports.
  // Reads from debouncedFilters — same 200 ms coalescing rationale.
  const paretoParams = useMemo<{
    date_from: string;
    date_to: string;
    farm_id: string | null;
    category: string | null;
    basis: 'value' | 'quantity';
  }>(() => {
    const range = ledgerRangeFromPreset(
      debouncedFilters.datePreset,
      debouncedFilters.dateFrom,
      debouncedFilters.dateTo,
    );
    return {
      date_from: range.from,
      date_to: range.to,
      farm_id: debouncedFilters.farmIds[0] ?? null,
      category: debouncedFilters.categories[0] ?? null,
      basis: debouncedFilters.abcBasis ?? 'value',
    };
  }, [
    debouncedFilters.datePreset,
    debouncedFilters.dateFrom,
    debouncedFilters.dateTo,
    debouncedFilters.farmIds,
    debouncedFilters.categories,
    debouncedFilters.abcBasis,
  ]);

  const onBasisChange = useCallback(
    (basis: 'value' | 'quantity') => {
      setFilters((prev) => ({ ...prev, abcBasis: basis }));
    },
    [setFilters],
  );

  // ===========================================================================
  // State → store mirror (per-report persistence).
  // ===========================================================================
  const updateVisibleColumns = useCallback(
    (next: string[]) => {
      setVisibleColumnsLocal(next);
      setVisibleColumns(userId, report.id, next);
    },
    [userId, report.id, setVisibleColumns],
  );

  const updateSort = useCallback(
    (next: SortState | null) => {
      setSortLocal(next);
      setSortForReport(userId, report.id, next);
    },
    [userId, report.id, setSortForReport],
  );

  const resetFilters = useCallback(() => {
    setFilters({
      ...defaultReportFilters,
      datePreset:
        isValuationReport || isInventoryAging
          ? 'today'
          : defaultReportFilters.datePreset,
    });
    setPage(1);
  }, [isValuationReport, isInventoryAging]);

  // ===========================================================================
  // Data source — non-ledger, non-valuation reports fall through to either
  // the static demo (RPT-001) or empty.
  // ===========================================================================
  const rawRows = useMemo<Record<string, unknown>[]>(() => {
    if (isValuationReport) {
      return valuation.rows as unknown as Record<string, unknown>[];
    }
    if (report.id === REPORT_ID_STOCK_BALANCE_DEMO) {
      return DEMO_STOCK as unknown as Record<string, unknown>[];
    }
    return [];
  }, [isValuationReport, report.id, valuation.rows]);

  const sortedRows = useMemo(() => {
    if (!sort) return rawRows;
    const arr = [...rawRows];
    arr.sort((a, b) => {
      const av = a[sort.columnKey];
      const bv = b[sort.columnKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sort.direction === 'asc' ? av - bv : bv - av;
      }
      const sa = av == null ? '' : String(av);
      const sb = bv == null ? '' : String(bv);
      // { numeric: true } so "سالن ۲" sorts before "سالن ۱۰".
      const cmp = sa.localeCompare(sb, 'fa', { numeric: true });
      return sort.direction === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rawRows, sort]);

  const totalCount = sortedRows.length;
  const pageStart = (page - 1) * pageSize;
  const pagedRows = useMemo(
    () => sortedRows.slice(pageStart, pageStart + pageSize),
    [sortedRows, pageStart, pageSize],
  );

  // ===========================================================================
  // Saved Views (filtered to the current report).
  // ===========================================================================
  const savedViews = useMemo<SavedReportView[]>(() => {
    if (!scope) return [];
    return (scope.savedViews ?? []).filter((v) => v.reportId === report.id);
  }, [scope, report.id]);

  const onSaveCurrentAs = useCallback(
    (name: string) => {
      const view = buildSavedView({
        reportId: report.id,
        name,
        filters,
        visibleColumns,
        sort,
      });
      saveView(userId, view);
    },
    [report.id, filters, visibleColumns, sort, saveView, userId],
  );

  const onLoadView = useCallback((view: SavedReportView) => {
    setFilters(view.filters);
    setVisibleColumnsLocal(view.visibleColumns);
    setSortLocal(view.sort);
    setPage(1);
  }, []);

  const onDeleteView = useCallback(
    (viewId: string) => deleteView(userId, viewId),
    [deleteView, userId],
  );

  const onValuationExportClick = useCallback(async () => {
    if (valuationExporting) return;
    setValuationExporting(true);
    const toastId = toast.loading('در حال ساخت فایل اکسل…');
    try {
      const { fileName, rowCount } = await triggerServerExport(
        'RPT_INVENTORY_VALUATION_SUMMARY',
        {
          date_to: pAsOf,
          farm_id: debouncedFilters.farmIds[0] ?? null,
          category: debouncedFilters.categories[0] ?? null,
        },
      );
      toast.success(
        `فایل اکسل آماده شد: ${fileName}` + (rowCount != null ? ` (${toPersianDigits(String(rowCount))} ردیف)` : ''),
        { id: toastId },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'خطای ناشناخته در ساخت فایل اکسل';
      toast.error(msg, { id: toastId });
    } finally {
      setValuationExporting(false);
    }
  }, [
    debouncedFilters.categories,
    debouncedFilters.farmIds,
    pAsOf,
    valuationExporting,
  ]);

  const onRenameView = useCallback(
    (viewId: string, name: string) => renameView(userId, viewId, name),
    [renameView, userId],
  );

  // ===========================================================================
  // Drilldown — open the item-ledger side panel. Both the valuation report
  // (InventoryValuationRow) and the ledger report (ItemLedgerRow) carry
  // item_id/item_name/item_unit/item_category/farm_id/farm_name. We accept
  // either shape via a permissive row cast — the panel itself only reads
  // those keys.
  // ===========================================================================
  const onRowClick = useCallback(
    (row: Record<string, unknown>) => {
      if (!isValuationReport && !isLedgerReport) return;
      const itemId = row.item_id ?? row.itemId;
      if (!itemId) return;
      if (isValuationReport) {
        const v = row as unknown as InventoryValuationRow;
        setDrilldown({
          item_id: v.item_id,
          item_name: v.item_name,
          item_unit: v.item_unit,
          item_category: String(v.item_category ?? ''),
          farm_id: v.farm_id,
          farm_name: v.farm_name ?? null,
        });
      } else {
        // Ledger row keys: item_id, item_name, item_unit, item_category, farm_id, farm_name.
        setDrilldown({
          item_id: String(itemId),
          item_name: String(row.item_name ?? ''),
          item_unit: String(row.item_unit ?? ''),
          item_category: String(row.item_category ?? ''),
          farm_id: String(row.farm_id ?? ''),
          farm_name: row.farm_name == null ? null : String(row.farm_name),
        });
      }
    },
    [isValuationReport, isLedgerReport],
  );

  const closeDrilldown = useCallback(() => setDrilldown(null), []);

  // ===========================================================================
  // Branch render — the ledger report has its own layout (FilterBar +
  // InventoryLedgerSection + Saved-Views modal) because the standard
  // ReportTable inside ReportShell cannot drive load-more pagination.
  // Consumption analytics also has its own branch (FilterBar +
  // ConsumptionAnalyticsSection + Saved-Views modal) because the
  // section renders a tab strip and amber variance highlighting that
  // don't fit the generic ReportShell chrome.
  // Everything else falls through to the generic ReportShell path.
  // ===========================================================================
  if (isInventoryAging) {
    return (
      <>
        <div className="space-y-4">
          {/* Report header */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-5 h-5 text-[var(--c-primary)]" />
                <h2 className="text-xl font-bold text-[var(--c-fg)]">{report.title}</h2>
              </div>
              <p className="text-sm text-[var(--c-muted-fg)] flex items-center gap-1.5" dir="ltr">
                <span>{report.subtitle}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono truncate inline-block max-w-[180px]" title={report.id}>
                  {report.id}
                </span>
              </p>
            </div>
          </div>

          <ReportFilterBar
            filters={filters}
            onChange={setFilters}
            onReset={resetFilters}
            farmOptions={DEMO_FARMS}
            // The aging RPC consumes only farm_id + category. We pass
            // empty arrays for hall/item/supplier so the corresponding
            // chip blocks do not render (avoids silent no-op selections).
            hallOptions={[]}
            itemOptions={[]}
            supplierOptions={[]}
            categoryOptions={CATEGORY_OPTIONS}
          />

          <InventoryAgingSection
            asOf={agingAsOf}
            farm_id={filters.farmIds[0] ?? null}
            category={filters.categories[0] ?? null}
          />
        </div>

        <ReportSavedViews
          isOpen={savedViewsOpenLedger}
          onClose={() => setSavedViewsOpenLedger(false)}
          views={savedViews}
          onLoad={onLoadView}
          onDelete={onDeleteView}
          onRename={onRenameView}
          onSaveAs={(name) => {
            onSaveCurrentAs(name);
            setSavedViewsOpenLedger(false);
          }}
          reportTitle={report.title}
        />
      </>
    );
  }

  if (isParetoClassification) {
    return (
      <>
        <div className="space-y-4">
          {/* Report header */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-5 h-5 text-[var(--c-primary)]" />
                <h2 className="text-xl font-bold text-[var(--c-fg)]">{report.title}</h2>
              </div>
              <p className="text-sm text-[var(--c-muted-fg)] flex items-center gap-1.5" dir="ltr">
                <span>{report.subtitle}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono truncate inline-block max-w-[180px]" title={report.id}>
                  {report.id}
                </span>
              </p>
            </div>
          </div>

          <ReportFilterBar
            filters={filters}
            onChange={setFilters}
            onReset={resetFilters}
            farmOptions={DEMO_FARMS}
            // The Pareto RPC consumes only farm_id + category. The
            // supplier/hall/item/txnType/formula chips are unused — pass
            // empty arrays so the corresponding chip blocks do not render.
            hallOptions={[]}
            itemOptions={[]}
            supplierOptions={[]}
            categoryOptions={CATEGORY_OPTIONS}
          />

          <ParetoClassificationSection
            date_from={paretoParams.date_from}
            date_to={paretoParams.date_to}
            farm_id={paretoParams.farm_id}
            category={paretoParams.category}
            basis={paretoParams.basis}
            onBasisChange={onBasisChange}
          />
        </div>

        <ReportSavedViews
          isOpen={savedViewsOpenLedger}
          onClose={() => setSavedViewsOpenLedger(false)}
          views={savedViews}
          onLoad={onLoadView}
          onDelete={onDeleteView}
          onRename={onRenameView}
          onSaveAs={(name) => {
            onSaveCurrentAs(name);
            setSavedViewsOpenLedger(false);
          }}
          reportTitle={report.title}
        />
      </>
    );
  }

  if (isConsumptionAnalytics) {
    return (
      <>
        <div className="space-y-4">
          {/* Report header */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-5 h-5 text-[var(--c-primary)]" />
                <h2 className="text-xl font-bold text-[var(--c-fg)]">{report.title}</h2>
              </div>
              <p className="text-sm text-[var(--c-muted-fg)] flex items-center gap-1.5" dir="ltr">
                <span>{report.subtitle}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono truncate inline-block max-w-[180px]" title={report.id}>
                  {report.id}
                </span>
              </p>
            </div>
          </div>

          <ReportFilterBar
            filters={filters}
            onChange={setFilters}
            onReset={resetFilters}
            farmOptions={DEMO_FARMS}
            hallOptions={DEMO_HALLS}
            itemOptions={DEMO_ITEMS}
            supplierOptions={DEMO_SUPPLIERS}
            categoryOptions={CATEGORY_OPTIONS}
            formulaOptions={DEMO_FORMULAS}
          />

          <ConsumptionAnalyticsSection
            date_from={consumptionParams.date_from}
            date_to={consumptionParams.date_to}
            farm_id={consumptionParams.farm_id}
            category={consumptionParams.category}
            formulaIds={filters.formulaIds}
            hallIds={filters.hallIds}
          />
        </div>

        <ReportSavedViews
          isOpen={savedViewsOpenLedger}
          onClose={() => setSavedViewsOpenLedger(false)}
          views={savedViews}
          onLoad={onLoadView}
          onDelete={onDeleteView}
          onRename={onRenameView}
          onSaveAs={(name) => {
            onSaveCurrentAs(name);
            setSavedViewsOpenLedger(false);
          }}
          reportTitle={report.title}
        />
      </>
    );
  }

  if (isLedgerReport) {
    return (
      <>
        <div className="space-y-4">
          {/* Report header */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-5 h-5 text-[var(--c-primary)]" />
                <h2 className="text-xl font-bold text-[var(--c-fg)]">{report.title}</h2>
              </div>
              <p className="text-sm text-[var(--c-muted-fg)] flex items-center gap-1.5" dir="ltr">
                <span>{report.subtitle}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono truncate inline-block max-w-[180px]" title={report.id}>
                  {report.id}
                </span>
              </p>
            </div>
          </div>

          <ReportFilterBar
            filters={filters}
            onChange={setFilters}
            onReset={resetFilters}
            farmOptions={DEMO_FARMS}
            hallOptions={DEMO_HALLS}
            itemOptions={DEMO_ITEMS}
            supplierOptions={DEMO_SUPPLIERS}
            categoryOptions={CATEGORY_OPTIONS}
            txnTypeOptions={TXN_TYPE_OPTIONS}
          />

          <InventoryLedgerSection filters={ledgerParams} asOf={drilldownAsOf} />
        </div>

        <ReportSavedViews
          isOpen={savedViewsOpenLedger}
          onClose={() => setSavedViewsOpenLedger(false)}
          views={savedViews}
          onLoad={onLoadView}
          onDelete={onDeleteView}
          onRename={onRenameView}
          onSaveAs={(name) => {
            onSaveCurrentAs(name);
            setSavedViewsOpenLedger(false);
          }}
          reportTitle={report.title}
        />

        <ItemLedgerPanel
          isOpen={drilldown !== null}
          onClose={closeDrilldown}
          itemId={drilldown?.item_id ?? null}
          itemName={drilldown?.item_name ?? null}
          itemUnit={drilldown?.item_unit ?? null}
          itemCategory={drilldown?.item_category ?? null}
          farmId={drilldown?.farm_id ?? null}
          asOf={drilldownAsOf}
        />
      </>
    );
  }

  return (
    <>
      <ReportShell
        report={report}
        columns={getReportColumns(report.id)}
        rows={pagedRows}
        totalCount={totalCount}
        isLoading={isValuationReport ? valuation.isLoading : false}
        filters={filters}
        onFiltersChange={setFilters}
        onFiltersReset={resetFilters}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        sort={sort}
        onSortChange={updateSort}
        visibleColumns={visibleColumns}
        onVisibleColumnsChange={updateVisibleColumns}
        farmOptions={DEMO_FARMS}
        hallOptions={DEMO_HALLS}
        itemOptions={DEMO_ITEMS}
        supplierOptions={DEMO_SUPPLIERS}
        categoryOptions={CATEGORY_OPTIONS}
        savedViews={savedViews}
        onSaveCurrentAs={onSaveCurrentAs}
        onLoadView={onLoadView}
        onDeleteView={onDeleteView}
        onRenameView={onRenameView}
        onRowClick={isValuationReport ? onRowClick : undefined}
        onExportClick={isValuationReport ? onValuationExportClick : undefined}
        isExporting={isValuationReport ? valuationExporting : false}
      />

      {isValuationReport && (
        <ItemLedgerPanel
          isOpen={drilldown !== null}
          onClose={closeDrilldown}
          itemId={drilldown?.item_id ?? null}
          itemName={drilldown?.item_name ?? null}
          itemUnit={drilldown?.item_unit ?? null}
          itemCategory={drilldown?.item_category ?? null}
          farmId={drilldown?.farm_id ?? null}
          asOf={pAsOf}
        />
      )}
    </>
  );
}

export const ReportBody = memo(ReportBodyInner);
ReportBody.displayName = 'ReportBody';
