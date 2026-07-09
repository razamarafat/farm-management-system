// =====================================================================
// ReportBody — drill-down view for ONE report.
//
// Pass 1 of the Reports-menu redesign (see docs/reports/reports-menu-redesign.md):
// the component now recognises EXACTLY six report IDs from REPORT_CATALOG
// and dispatches each to its corresponding section stub. The framework
// chrome (FilterBar + SavedViews modal + per-report header) stays intact
// so each stub in Pass 2 can plug into a uniform shell without redoing
// layout work.
//
// State that lives here:
//   - filters: a per-report-filter `ReportFiltersState` (NOT persisted
//     across report switches by design — see the comment block above the
//     `useState` initializer).
//   - visibleColumns / sort / page: per-user, per-report, persisted to
//     useReportViewsStore so reopening the same report restores the
//     user's column/sort choices.
//   - Saved Views modal open/close.
//
// State that lives in section stubs (Pass 2):
//   - rows, isLoading, drilldown, export orchestration. Stubs in Pass 1
//     render <UnderDevelopment />; Pass 2 replaces each stub body with
//     the real RPC/table/drilldown UX while keeping the prop signature
//     so ReportBody needs ZERO changes between Pass 1 and Pass 2.
//
// Why ReportBody must stay at MODULE SCOPE: ReportsHomePage re-renders
// on every keystroke in the parent. Defining ReportBody inside the
// parent would re-create the component ref, force an unmount + remount,
// and lose focus + filter state on every keystroke. (Module-scope memo
// keeps the identity stable.)
// =====================================================================

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
// `useState` is used below for `filters` and `savedViewsOpen`.
// (Pass 2 will also need it for `page`, `visibleColumns`, `sort` selectors.)
import { FileText } from 'lucide-react';
import { ReportFilterBar } from './ReportFilterBar';
import { ReportSavedViews } from './ReportSavedViews';
import { InventoryStockSection } from './InventoryStockSection';
import { ConsumptionReportSection } from './ConsumptionReportSection';
import { SalesTransfersSection } from './SalesTransfersSection';
import { PurchasesSection } from './PurchasesSection';
import { PackagingSection } from './PackagingSection';
import { ReorderPointSection } from './ReorderPointSection';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { supabase } from '@/lib/supabase';
import {
  REPORT_CATALOG,
  defaultReportFilters,
} from '@/types/report.types';
import type {
  ListOption,
  ReportCatalogEntry,
  ReportFiltersState,
  SavedReportView,
  SortState,
} from '@/types/report.types';
import { useReportViewsStore, buildSavedView } from '@/store/reportViewsStore';
import { getJalaliToday, jalaliToGregorian } from '@/utils/jalaliDate';
import { toPersianDigits } from '@/utils/persianNumbers';

// ---------------------------------------------------------------------
// The 6 authority report IDs — kept here as a const tuple so tsc catches
// drift if REPORT_CATALOG changes.
// ---------------------------------------------------------------------
const REPORT_IDS = {
  INVENTORY_STOCK: 'RPT_INVENTORY_STOCK',
  CONSUMPTION_REPORT: 'RPT_CONSUMPTION_REPORT',
  SALES_TRANSFERS: 'RPT_SALES_TRANSFERS',
  PURCHASES: 'RPT_PURCHASES',
  PACKAGING: 'RPT_PACKAGING',
  REORDER_POINT: 'RPT_REORDER_POINT',
} as const;

// Defensive cross-check: every ID in REPORT_CATALOG must be in the switch
// below. CI/scripts/test-spa-reports.mjs runs an equivalent test; tsc
// catches typos at compile time because the switch falls through to
// `unknownReport()` with a console.warn.
for (const entry of REPORT_CATALOG) {
  if (!Object.values(REPORT_IDS).includes(entry.id as typeof REPORT_IDS[keyof typeof REPORT_IDS])) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ReportBody] REPORT_CATALOG has id "${entry.id}" which is not in the dispatch switch. ` +
      'Add a case for it before shipping.',
    );
  }
}

const CATEGORY_OPTIONS: ListOption[] = [
  { value: 'feed', label: 'نهاده' },
  { value: 'packaging', label: 'بسته‌بندی' },
];

const CONSUMPTION_GROUP_BY_OPTIONS: ListOption[] = [
  { value: 'item', label: 'به تفکیک کالا' },
  { value: 'day', label: 'به تفکیک روز' },
  { value: 'hall', label: 'به تفکیک سالن' },
  { value: 'formula', label: 'به تفکیک فرمول' },
];

const TRANSFER_TXN_TYPE_OPTIONS: ListOption[] = [
  { value: 'transfer_in', label: 'انتقال ورودی' },
  { value: 'transfer_out', label: 'انتقال خروجی' },
  { value: 'sale', label: 'فروش' },
];

const ABC_CLASS_OPTIONS: ListOption[] = [
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
];

const ABC_BASIS_OPTIONS: ListOption[] = [
  { value: 'value', label: 'بر اساس ارزش ریالی' },
  { value: 'quantity', label: 'بر اساس مقدار مصرف' },
];

interface ReportFilterOptions {
  farmOptions: ListOption[];
  hallOptions: ListOption[];
  itemOptions: ListOption[];
  supplierOptions: ListOption[];
  formulaOptions: ListOption[];
}

const EMPTY_OPTIONS: ReportFilterOptions = {
  farmOptions: [],
  hallOptions: [],
  itemOptions: [],
  supplierOptions: [],
  formulaOptions: [],
};

function useReportFilterOptions(selectedFarmIds: string[]): ReportFilterOptions {
  const [options, setOptions] = useState<ReportFilterOptions>(EMPTY_OPTIONS);
  const selectedFarmKey = selectedFarmIds.join('|');

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      const farmIds = selectedFarmKey ? selectedFarmKey.split('|').filter(Boolean) : [];

      try {
        let hallsQuery = supabase
          .from('farm_halls')
          .select('id, name, hall_number, farm_id')
          .eq('is_active', true)
          .order('hall_number', { ascending: true });

        let itemsQuery = supabase
          .from('farm_items')
          .select('id, name, unit, farm_id, priority')
          .eq('is_active', true)
          .order('priority', { ascending: true });

        let formulasQuery = supabase
          .from('farm_feed_formulas')
          .select('id, name, formula_no, farm_id')
          .eq('is_active', true)
          .order('formula_no', { ascending: true });

        if (farmIds.length > 0) {
          hallsQuery = hallsQuery.in('farm_id', farmIds);
          itemsQuery = itemsQuery.in('farm_id', farmIds);
          formulasQuery = formulasQuery.in('farm_id', farmIds);
        }

        const [
          farmsResult,
          hallsResult,
          itemsResult,
          suppliersResult,
          formulasResult,
        ] = await Promise.all([
          supabase
            .from('farms')
            .select('id, name')
            .eq('is_active', true)
            .order('name', { ascending: true }),
          hallsQuery,
          itemsQuery,
          supabase
            .from('suppliers')
            .select('id, name')
            .eq('is_active', true)
            .order('name', { ascending: true }),
          formulasQuery,
        ]);

        const firstError =
          farmsResult.error ??
          hallsResult.error ??
          itemsResult.error ??
          suppliersResult.error ??
          formulasResult.error;

        if (firstError) throw firstError;
        if (cancelled) return;

        setOptions({
          farmOptions: (farmsResult.data ?? []).map((farm) => ({
            value: farm.id,
            label: farm.name,
          })),
          hallOptions: (hallsResult.data ?? []).map((hall) => ({
            value: hall.id,
            label: hall.name || `سالن ${toPersianDigits(String(hall.hall_number))}`,
          })),
          itemOptions: (itemsResult.data ?? []).map((item) => ({
            value: item.id,
            label: `${item.name}${item.unit ? ` (${item.unit})` : ''}`,
          })),
          supplierOptions: (suppliersResult.data ?? []).map((supplier) => ({
            value: supplier.id,
            label: supplier.name,
          })),
          formulaOptions: (formulasResult.data ?? []).map((formula) => ({
            value: formula.id,
            label: formula.name || `فرمول ${toPersianDigits(String(formula.formula_no))}`,
          })),
        });
      } catch (error) {
        console.error('Error loading report filter options:', error);
        if (!cancelled) setOptions(EMPTY_OPTIONS);
      }
    }

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, [selectedFarmKey]);

  return options;
}

// ---------------------------------------------------------------------
// Date-range helper — converts the FilterBar preset + custom dates
// into a concrete {from, to} pair of Gregorian 'yyyy-MM-dd' strings
// for the section hooks. Sections consume ISO gregorian dates; the
// UI surfaces Jalali dates to the user.
// ---------------------------------------------------------------------
function gregorianDateRange(filters: ReportFiltersState): { from: string; to: string } {
  if (filters.datePreset === 'custom') {
    return {
      from: filters.dateFrom ? jalaliToGregorian(filters.dateFrom) : jalaliToGregorian(getJalaliToday()),
      to: filters.dateTo ? jalaliToGregorian(filters.dateTo) : jalaliToGregorian(getJalaliToday()),
    };
  }
  const todayIso = jalaliToGregorian(getJalaliToday());
  if (filters.datePreset === 'today') return { from: todayIso, to: todayIso };
  // this_week → 6-day window; this_month → 29-day window. We round-trip
  // through Date.UTC explicitly to strip local-TZ bleed for the start
  // anchor. (The end anchor is the Jalali-derived "today".)
  const parts = todayIso.split('-').map((s) => parseInt(s, 10));
  if (parts.length !== 3 || !parts.every(Number.isFinite)) {
    return { from: todayIso, to: todayIso };
  }
  const [gy, gm, gd] = parts;
  const utc = Date.UTC(gy, gm - 1, gd);
  const days = filters.datePreset === 'this_week' ? 6 : 29;
  const startIso = new Date(utc - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from: startIso, to: todayIso };
}

function asOfDate(filters: ReportFiltersState): string {
  if (filters.dateTo) return jalaliToGregorian(filters.dateTo);
  if (filters.dateFrom) return jalaliToGregorian(filters.dateFrom);
  return jalaliToGregorian(getJalaliToday());
}

// ---------------------------------------------------------------------
// Filter chrome per report:
//   - Packaging & Reorder-point intentionally have NO hall selector
//     (per the user's explicit spec — بسته‌بندی در سطح فارم رهگیری
//     می‌شود/اقلام سفارش در سطح فارم).
//   - Reorder-point has no formula selector (no formula relationship).
//   - Sales+Transfers has no supplier selector (inter-warehouse moves
//     are not purchases).
// Pass 2 will turn these into real-live hooks, but the chrome shape is
// final here.
// ---------------------------------------------------------------------
function filterChromeForReport(id: string) {
  return {
    showDateFilter: id !== REPORT_IDS.REORDER_POINT,
    showHalls: id === REPORT_IDS.CONSUMPTION_REPORT,
    showItems: id === REPORT_IDS.SALES_TRANSFERS || id === REPORT_IDS.PURCHASES,
    showSuppliers: id === REPORT_IDS.PURCHASES,
    showCategories:
      id === REPORT_IDS.INVENTORY_STOCK ||
      id === REPORT_IDS.CONSUMPTION_REPORT,
    showFormulas: id === REPORT_IDS.CONSUMPTION_REPORT,
    groupByOptions:
      id === REPORT_IDS.CONSUMPTION_REPORT ? CONSUMPTION_GROUP_BY_OPTIONS : [],
    txnTypeOptions:
      id === REPORT_IDS.SALES_TRANSFERS ? TRANSFER_TXN_TYPE_OPTIONS : [],
    abcClassOptions:
      id === REPORT_IDS.REORDER_POINT ? ABC_CLASS_OPTIONS : [],
    basisOptions:
      id === REPORT_IDS.REORDER_POINT ? ABC_BASIS_OPTIONS : [],
    booleanFilterLabel:
      id === REPORT_IDS.INVENTORY_STOCK
        ? 'فقط اقلام راکد'
        : id === REPORT_IDS.REORDER_POINT
          ? 'فقط نیازمند سفارش'
          : undefined,
  };
}

// ---------------------------------------------------------------------
// Per-report section dispatcher. Each stub currently accepts a permissive
// _props: Record<string, unknown> — Pass 2 replaces the body with a real
// implementation but keeps the same prop shape, so this dispatcher is
// stable between Pass 1 and Pass 2.
// ---------------------------------------------------------------------
function renderReportSection(
  id: typeof REPORT_IDS[keyof typeof REPORT_IDS],
  debouncedFilters: ReportFiltersState,
) {
  const range = gregorianDateRange(debouncedFilters);
  switch (id) {
    case REPORT_IDS.INVENTORY_STOCK:
      return (
        <InventoryStockSection
          asOf={asOfDate(debouncedFilters)}
          farm_id={debouncedFilters.farmIds[0] ?? null}
          category={debouncedFilters.categories[0] ?? null}
          deadStockOnly={debouncedFilters.reorderNeededOnly === true}
        />
      );
    case REPORT_IDS.CONSUMPTION_REPORT:
      return (
        <ConsumptionReportSection
          date_from={range.from}
          date_to={range.to}
          farm_id={debouncedFilters.farmIds[0] ?? null}
          category={debouncedFilters.categories[0] ?? null}
          hallIds={debouncedFilters.hallIds}
          formulaIds={debouncedFilters.formulaIds}
          group_by={debouncedFilters.groupBy ?? 'item'}
        />
      );
    case REPORT_IDS.SALES_TRANSFERS:
      return (
        <SalesTransfersSection
          date_from={range.from}
          date_to={range.to}
          farm_id={debouncedFilters.farmIds[0] ?? null}
          item_id={debouncedFilters.itemIds[0] ?? null}
          txn_type={debouncedFilters.txnTypes[0] ?? null}
        />
      );
    case REPORT_IDS.PURCHASES:
      return (
        <PurchasesSection
          date_from={range.from}
          date_to={range.to}
          farm_id={debouncedFilters.farmIds[0] ?? null}
          supplier_id={debouncedFilters.supplierIds[0] ?? null}
          item_id={debouncedFilters.itemIds[0] ?? null}
        />
      );
    case REPORT_IDS.PACKAGING:
      return (
        <PackagingSection
          date_from={range.from}
          date_to={range.to}
          farm_id={debouncedFilters.farmIds[0] ?? null}
        />
      );
    case REPORT_IDS.REORDER_POINT:
      return (
        <ReorderPointSection
          farm_id={debouncedFilters.farmIds[0] ?? null}
          abcClass={debouncedFilters.abcClassFilter ?? null}
          reorderNeededOnly={debouncedFilters.reorderNeededOnly ?? false}
          basis={debouncedFilters.categoryBasis === 'quantity' ? 'quantity' : 'value'}
        />
      );
    default:
      return (
        <div className="rounded-[14px] border border-dashed border-[var(--c-border)] bg-[var(--c-card)]/40 p-6 text-center text-sm text-[var(--c-muted-fg)]">
          گزارش ناشناس: <span className="font-mono">{String(id)}</span>
        </div>
      );
  }
}

// ---------------------------------------------------------------------
// Filter chrome render — pulled out so the dispatch is the only thing
// that switches per report.
// ---------------------------------------------------------------------
function ReportFilterBarForReport({
  filters,
  onChange,
  onReset,
  id,
}: {
  filters: ReportFiltersState;
  onChange: (next: ReportFiltersState) => void;
  onReset: () => void;
  id: string;
}) {
  const chrome = useMemo(() => filterChromeForReport(id), [id]);
  const liveOptions = useReportFilterOptions(filters.farmIds);
  return (
    <ReportFilterBar
      filters={filters}
      onChange={onChange}
      onReset={onReset}
      farmOptions={liveOptions.farmOptions}
      hallOptions={chrome.showHalls ? liveOptions.hallOptions : []}
      itemOptions={chrome.showItems ? liveOptions.itemOptions : []}
      supplierOptions={chrome.showSuppliers ? liveOptions.supplierOptions : []}
      categoryOptions={chrome.showCategories ? CATEGORY_OPTIONS : []}
      formulaOptions={chrome.showFormulas ? liveOptions.formulaOptions : []}
      txnTypeOptions={chrome.txnTypeOptions}
      groupByOptions={chrome.groupByOptions}
      abcClassOptions={chrome.abcClassOptions}
      basisOptions={chrome.basisOptions}
      booleanFilterLabel={chrome.booleanFilterLabel}
      showDateFilter={chrome.showDateFilter}
    />
  );
}

// ---------------------------------------------------------------------
// Main component.
// ---------------------------------------------------------------------
interface ReportBodyProps {
  report: ReportCatalogEntry;
  userId: string;
}

function ReportBodyInner({ report, userId }: ReportBodyProps) {
  // ---------------------------------------------------------------------------
  // Filter state — kept here at the body level so the chrome can debounce
  // and pass shared params to whichever section is mounted. We initialise
  // from defaultReportFilters every time the parent keys us with a new
  // `report.id`, which is exactly the behaviour we want (no filter leakage
  // between reports).
  // ---------------------------------------------------------------------------
  const [filters, setFilters] = useState<ReportFiltersState>(() => ({
    ...defaultReportFilters,
  }));
  const debouncedFilters = useDebouncedValue(filters, 200);

  // ---------------------------------------------------------------------------
  // Saved views are persisted to the user-scope store keyed by
  // [userId, report.id] so reopening the same report restores the user's
  // saved filter snapshot. Visible-columns / sort / page-size are also
  // persisted via the same store — Pass-2 sections will read those as
  // props, but Pass-1 stubs have no table yet, so the selectors are
  // deferred until the stub has a real table.
  // ---------------------------------------------------------------------------
  const saveView = useReportViewsStore((s) => s.saveView);
  const deleteView = useReportViewsStore((s) => s.deleteView);
  const renameView = useReportViewsStore((s) => s.renameView);
  const scope = useReportViewsStore((s) => s.scopes[userId]);

  const [savedViewsOpen, setSavedViewsOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Saved-views filtered to the current report id.
  // ---------------------------------------------------------------------------
  const savedViews = useMemo<SavedReportView[]>(() => {
    if (!scope) return [];
    return (scope.savedViews ?? []).filter((v) => v.reportId === report.id);
  }, [scope, report.id]);

  // ---------------------------------------------------------------------------
  // Reset filters — always returns to canonical defaults, intentionally
  // ignoring the per-report datePreset variations from the legacy
  // ReportBody (the new design pivots on `asOf` automatically).
  // ---------------------------------------------------------------------------
  const resetFilters = useCallback(() => {
    setFilters({ ...defaultReportFilters });
  }, []);

  // ---------------------------------------------------------------------------
  // Save current view as a named saved-view.
  // ---------------------------------------------------------------------------
  const onSaveCurrentAs = useCallback(
    (name: string) => {
      saveView(
        userId,
        buildSavedView({
          reportId: report.id,
          name,
          filters,
          // Empty arrays here are intentional — Pass 2 stubs surface
          // visibleColumns + sort from their own tables; once we hook
          // those back here they round-trip through the store naturally.
          visibleColumns: [],
          sort: null as SortState | null,
        }),
      );
    },
    [userId, report.id, filters, saveView],
  );

  const onLoadView = useCallback((view: SavedReportView) => {
    setFilters(view.filters);
    setSavedViewsOpen(false);
  }, []);

  const onDeleteView = useCallback(
    (viewId: string) => deleteView(userId, viewId),
    [deleteView, userId],
  );

  const onRenameView = useCallback(
    (viewId: string, name: string) => renameView(userId, viewId, name),
    [renameView, userId],
  );

  // Pass-2 note: visible-columns / sort / pagination selectors will be
  // re-introduced here once the section stubs replace <UnderDevelopment/>
  // with real tables. Until then, the store is initialised lazily by
  // passing `userId` and `report.id` as scope keys in saveView() below.

  // ---------------------------------------------------------------------------
  // Render — uniform chrome for ALL six reports; only `renderReportSection`
  // differs. Each report gets the same FilterBar shape (with the
  // report-specific chip blocks conditionally rendered via empty arrays).
  // ---------------------------------------------------------------------------
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

        <ReportFilterBarForReport
          filters={filters}
          onChange={setFilters}
          onReset={resetFilters}
          id={report.id}
        />

        {renderReportSection(
          report.id as typeof REPORT_IDS[keyof typeof REPORT_IDS],
          debouncedFilters,
        )}
      </div>

      <ReportSavedViews
        isOpen={savedViewsOpen}
        onClose={() => setSavedViewsOpen(false)}
        views={savedViews}
        onLoad={onLoadView}
        onDelete={onDeleteView}
        onRename={onRenameView}
        onSaveAs={(name) => {
          onSaveCurrentAs(name);
          setSavedViewsOpen(false);
        }}
        reportTitle={report.title}
      />
    </>
  );
}

export const ReportBody = memo(ReportBodyInner);
ReportBody.displayName = 'ReportBody';
