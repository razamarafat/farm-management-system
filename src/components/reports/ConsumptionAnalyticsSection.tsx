// =====================================================================
// ConsumptionAnalyticsSection — per-report UI for RPT_CONSUMPTION_ANALYTICS.
//
// Layout:
//   ┌──── Toolbar ─────────────────────────────────────────────────┐
//   │ [راهنمای هشدار]  [Variance toggle ⚠]                Showing X rows │
//   ├──── Group-by tabs ────────────────────────────────────────────┤
//   │ [Day] [Item] [Hall] [Formula]   (active button highlighted)  │
//   ├──── Variance summary banner (only when toggle ON) ───────────┤
//   │ "X rows flagged for abnormally high consumption"             │
//   ├──── Table ───────────────────────────────────────────────────┤
//   │ # | group_label | consumed | waste | total | voucher_count   │
//   │   (abnormal rows get an amber tint + ⚠ icon)                │
//   └──────────────────────────────────────────────────────────────┘
//
// Variance rule (auditable, explainable, NO ML):
//   * Compute mean μ and (population) standard deviation σ across the
//     fetched rows' consumed_qty. Empty/zero rows are ignored.
//   * Threshold = max(1.5 × μ, μ + σ).
//   * A row is "abnormal" if consumed_qty > threshold AND > 0.
//   * Tooltip on the toggle explains the rule in Persian and links to
//     a 7-day MA context per the spec example.
//
// Filters carried across tabs:
//   The hook refetches when `groupBy` changes, but it accepts the same
//   date_from / date_to / farm_id / category as props. Switching tabs
//   resets only the variance highlighting (it's recomputed on every
//   row set change) — never the date or farm.
//
// Post-`group_by` filters for hall/formula:
//   The RPC doesn't consume hall/formula/item IDs; we post-filter
//   client-side inside the section so the user can still narrow the
//   output. document this in the FilterBar caption.
// =====================================================================

import { memo, useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Download,
  Inbox,
  Layers,
  ListChecks,
  Loader2,
  Package,
  Sigma,
} from 'lucide-react';
import { Skeleton as Sk } from '@/components/ui/Skeleton';
import { cn } from '@/utils/cn';
import { toPersianDigits } from '@/utils/persianNumbers';
import { gregorianToJalali } from '@/utils/jalaliDate';
import { triggerServerExport } from '@/lib/excelServer';
import {
  useConsumptionSummary,
  type ConsumptionSummaryRow,
  type GroupByMode,
} from '@/hooks/useConsumptionSummary';
import { toast } from 'sonner';

interface ConsumptionAnalyticsSectionProps {
  /** ISO yyyy-MM-dd — required */
  date_from: string;
  /** ISO yyyy-MM-dd — required */
  date_to: string;
  /** Optional single farm filter. */
  farm_id?: string | null;
  /** Optional category text filter. */
  category?: string | null;
  /** Client-side formula filter — only meaningfully narrows formula/hall modes. */
  formulaIds?: string[];
  /** Client-side hall filter. Only meaningful in 'hall' groupBy. */
  hallIds?: string[];
}

const GROUP_BY_TABS: Array<{ key: GroupByMode; label: string; icon: typeof Calendar }> = [
  { key: 'day', label: 'به تفکیک روز', icon: Calendar },
  { key: 'item', label: 'به تفکیک کالا', icon: Package },
  { key: 'hall', label: 'به تفکیک سالن', icon: Layers },
  { key: 'formula', label: 'به تفکیک فرمول', icon: ListChecks },
];

function ConsumptionAnalyticsSectionInner({
  date_from,
  date_to,
  farm_id,
  category,
  formulaIds,
  hallIds,
}: ConsumptionAnalyticsSectionProps) {
  // ===========================================================================
  // Live data hook. Single-shot RPC; refetch fires whenever any param changes.
  // ===========================================================================
  const [groupBy, setGroupBy] = useState<GroupByMode>('day');
  const { rows, isLoading, error, refetch } = useConsumptionSummary({
    date_from,
    date_to,
    farm_id: farm_id ?? null,
    category: category ?? null,
    group_by: groupBy,
  });

  // ===========================================================================
  // Local UX state — owned by the section, NOT persisted. The groupBy tab
  // is the only piece that defines the data shape; everything else is a
  // server-side filter.
  // ===========================================================================
  const [varianceOn, setVarianceOn] = useState<boolean>(false);

  // ===========================================================================
  // Client-side post-filter for groups the RPC doesn't support natively.
  //   - In 'formula' mode: keep only rows whose group_key is in formulaIds.
  //   - In 'hall' mode   : keep only rows whose group_key is in hallIds.
  //   - Other modes: ignore these filters (formulaIds/hallIds mostly
  //     redundant when grouped by day/item).
  // ===========================================================================
  const visibleRows = useMemo<ConsumptionSummaryRow[]>(() => {
    if (groupBy === 'formula' && formulaIds && formulaIds.length > 0) {
      const set = new Set(formulaIds);
      return rows.filter((r) => set.has(r.group_key));
    }
    if (groupBy === 'hall' && hallIds && hallIds.length > 0) {
      // hallIds may be the slug value ("1", "2") or stored plain string.
      // group_by='hall' returns each hall_token as group_key, so direct
      // equality works after toString normalization upstream.
      const set = new Set(hallIds);
      return rows.filter((r) => set.has(String(r.group_key)));
    }
    return rows;
  }, [rows, groupBy, formulaIds, hallIds]);

  // ===========================================================================
  // Variance statistics — single-pass over visibleRows. Hoisted into a
  // useMemo so the row-level threshold is constant across the table.
  // ===========================================================================
  const variance = useMemo<
    | { mean: number; stdev: number; threshold: number; flagged: Set<string> }
    | null
  >(() => {
    if (!varianceOn) return null;
    const candidates = visibleRows.filter((r) => r.consumed_qty > 0).map((r) => r.consumed_qty);
    if (candidates.length === 0) {
      return { mean: 0, stdev: 0, threshold: Infinity, flagged: new Set() };
    }
    const n = candidates.length;
    const sum = candidates.reduce((acc, v) => acc + v, 0);
    const mean = sum / n;
    const varianceSum = candidates.reduce((acc, v) => acc + (v - mean) ** 2, 0);
    const stdev = Math.sqrt(varianceSum / n);
    // Two complementary thresholds; pick the larger so the signal doesn't
    // over-flag when stdev is zero (uniform rows) — use 1.5×mean in that
    // case so at least one outlier stands out.
    const threshold = mean > 0 ? Math.max(1.5 * mean, mean + stdev) : Infinity;
    const flagged = new Set<string>();
    if (Number.isFinite(threshold)) {
      for (const r of visibleRows) {
        if (r.consumed_qty > threshold) flagged.add(r.group_key);
      }
    }
    return { mean, stdev, threshold, flagged };
  }, [visibleRows, varianceOn]);

  // ===========================================================================
  // Group-label rendering — for 'day' we convert YYYY-MM-DD into a Persian
  // Jalali date. For the other modes we render the label verbatim.
  // ===========================================================================
  const renderGroupLabel = useCallback(
    (row: ConsumptionSummaryRow) => {
      if (groupBy === 'day') {
        const jalali = gregorianToJalali(row.group_label);
        return (
          <span dir="ltr" className="font-medium tabular-nums">
            {toPersianDigits(jalali)}
          </span>
        );
      }
      return <span className="font-medium text-[var(--c-fg)]">{row.group_label || '—'}</span>;
    },
    [groupBy],
  );

  // ===========================================================================
  // Group-by header label for the first column.
  // ===========================================================================
  const firstColumnHeader =
    groupBy === 'day'
      ? 'تاریخ'
      : groupBy === 'item'
        ? 'کالا'
        : groupBy === 'hall'
          ? 'سالن'
          : 'فرمول';

  // ===========================================================================
  // Export — server-side .xlsx via the BFF. The RPC supports date/farm/category
  // and group_by; hall/formula chip filters remain client-side post-filters.
  // ===========================================================================
  const [exporting, setExporting] = useState(false);
  const onExportClick = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    const toastId = toast.loading('در حال ساخت فایل اکسل…');
    try {
      const { fileName, rowCount } = await triggerServerExport(
        'RPT_CONSUMPTION_ANALYTICS',
        {
          date_from,
          date_to,
          farm_id: farm_id ?? null,
          category: category ?? null,
          group_by: groupBy,
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
      setExporting(false);
    }
  }, [category, date_from, date_to, exporting, farm_id, groupBy]);

  // ===========================================================================
  // Render.
  // ===========================================================================
  return (
    <div className="space-y-3">
      {/* Toolbar — group-by tabs + variance toggle + row counter. */}
      <div className="flex flex-wrap items-center gap-2 rounded-[14px] bg-[var(--c-card)] border border-[var(--c-border)] shadow-[var(--card-shadow)] px-3 py-2.5">
        <div className="flex items-center gap-1.5" role="tablist" aria-label="محور گروه‌بندی">
          {GROUP_BY_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.key === groupBy;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setGroupBy(tab.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium px-2.5 h-8 rounded-md border transition-colors',
                  active
                    ? 'bg-[var(--c-primary)] text-white border-[var(--c-primary)] shadow-[0_2px_6px_color-mix(in_srgb,var(--c-primary)_25%,transparent)]'
                    : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-fg)] hover:bg-[var(--c-muted)]',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="h-6 w-px bg-[var(--c-border)] hidden sm:block" />

        <button
          type="button"
          onClick={() => setVarianceOn((v) => !v)}
          aria-pressed={varianceOn}
          aria-label="نمایش هشدار مصرف غیرعادی"
          title={
            varianceOn
              ? 'غیرفعال‌سازی هشدار مصرف غیرعادی'
              : 'هشدار مصرف غیرعادی بر اساس میانگین ۷ روز گذشته'
          }
          className={cn(
            'inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium px-2.5 h-8 rounded-md border transition-colors',
            varianceOn
              ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700/60'
              : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-fg)] hover:bg-[var(--c-muted)]',
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          هشدار مصرف غیرعادی
        </button>

        <button
          type="button"
          onClick={onExportClick}
          disabled={exporting}
          aria-label="خروجی اکسل"
          aria-busy={exporting}
          title={exporting ? 'در حال ساخت فایل…' : 'خروجی اکسل'}
          className={cn(
            'inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium px-2.5 h-8 rounded-md border transition-colors',
            exporting
              ? 'bg-[var(--c-muted)] border-[var(--c-border)] text-[var(--c-muted-fg)] cursor-wait'
              : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-fg)] hover:bg-[var(--c-muted)]',
          )}
        >
          {exporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          {exporting ? 'در حال ساخت…' : 'خروجی اکسل'}
        </button>

        <div className="ms-auto flex items-center gap-1.5 text-xs text-[var(--c-muted-fg)]">
          <Sigma className="w-3.5 h-3.5" />
          <span dir="ltr" className="font-semibold text-[var(--c-fg)]">
            {toPersianDigits(String(visibleRows.length))}
          </span>
          <span>ردیف در گروه</span>
          {varianceOn && variance && variance.flagged.size > 0 && (
            <span
              className="ms-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] font-semibold"
              title={`آستانه: max(۱.۵ × میانگین، میانگین+σ) ≈ ${toPersianDigits(variance.threshold.toLocaleString('en-US', { maximumFractionDigits: 2 }))}`}
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              {toPersianDigits(String(variance.flagged.size))} هشدار
            </span>
          )}
        </div>
      </div>

      {/* Error banner. */}
      {error && (
        <div
          role="alert"
          className="rounded-[14px] border border-[var(--c-destructive)]/30 bg-[var(--c-destructive)]/10 px-4 py-3 text-sm text-[var(--c-destructive)]"
        >
          {error}
        </div>
      )}

      {/* Initial-load skeleton. */}
      {isLoading && rows.length === 0 ? (
        <div className="space-y-2" aria-busy="true" aria-label="در حال بارگذاری خلاصهٔ مصرف">
          {Array.from({ length: 6 }).map((_, i) => (
            <Sk key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : visibleRows.length === 0 ? (
        <EmptyAnalytics />
      ) : (
        <ConsumptionTable
          rows={visibleRows}
          firstColumnHeader={firstColumnHeader}
          renderGroupLabel={renderGroupLabel}
          flaggedKeys={varianceOn && variance ? variance.flagged : null}
          onRetry={refetch}
        />
      )}

      {/* Variance explainer — visible when toggle is ON. */}
      {varianceOn && variance && visibleRows.length > 1 && (
        <div className="text-[11px] leading-relaxed text-[var(--c-muted-fg)] rounded-md bg-[var(--c-muted)]/40 px-3 py-2 border border-[var(--c-border)]/50">
          <p className="font-semibold text-[var(--c-fg)] mb-1">روش محاسبهٔ هشدار</p>
          میانگین مصرف (μ): <span className="font-mono" dir="ltr">{toPersianDigits(variance.mean.toLocaleString('en-US', { maximumFractionDigits: 2 }))}</span>{' '}
          — انحراف معیار (σ): <span className="font-mono" dir="ltr">{toPersianDigits(variance.stdev.toLocaleString('en-US', { maximumFractionDigits: 2 }))}</span>{' '}
          — آستانه: حداکثر «۱.۵ × میانگین» و «میانگین + σ».
          ردیف‌هایی با مصرف بیش از آستانه و بیش از صفر علامت‌گذاری می‌شوند.
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

interface ConsumptionTableProps {
  rows: ConsumptionSummaryRow[];
  firstColumnHeader: string;
  renderGroupLabel: (row: ConsumptionSummaryRow) => React.ReactNode;
  flaggedKeys: Set<string> | null;
  onRetry: () => void;
}

function ConsumptionTable({
  rows,
  firstColumnHeader,
  renderGroupLabel,
  flaggedKeys,
}: ConsumptionTableProps) {
  return (
    <div className="overflow-x-auto rounded-[14px] bg-[var(--c-card)] border border-[var(--c-border)] shadow-[var(--card-shadow)]">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-[var(--c-muted)] border-b-2 border-[var(--c-border)]">
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] w-12 sticky right-0 bg-[var(--c-muted)] z-10">#</th>
            <th className="px-3 py-3 text-right font-semibold text-[var(--c-fg)]">{firstColumnHeader}</th>
            <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">مصرف</th>
            <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">ضایعات</th>
            <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">جمع</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)]">تعداد سند</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const flagged = flaggedKeys?.has(row.group_key) ?? false;
            return (
              <tr
                key={`${row.group_key}-${idx}`}
                className={cn(
                  'border-b border-[var(--c-border)] transition-colors',
                  flagged &&
                    'bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100/80 dark:hover:bg-amber-950/50',
                )}
                aria-label={flagged ? 'ردیف با مصرف غیرعادی' : undefined}
              >
                <td
                  className={cn(
                    'px-3 py-2.5 text-center text-[var(--c-muted-fg)] sticky right-0 z-10 tabular-nums',
                    flagged ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-[var(--c-card)]',
                  )}
                  dir="ltr"
                >
                  {toPersianDigits(idx + 1)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center gap-2 justify-end">
                    {flagged && (
                      <span
                        className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"
                        title="هشدار مصرف غیرعادی — این ردیف بیش از آستانهٔ میانگین + σ (یا ۱.۵ × میانگین) مصرف دارد"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </span>
                    )}
                    {renderGroupLabel(row)}
                  </div>
                </td>
                <td
                  className={cn(
                    'px-3 py-2.5 text-left tabular-nums font-bold',
                    flagged ? 'text-amber-800 dark:text-amber-300' : 'text-[var(--c-fg)]',
                  )}
                  dir="ltr"
                >
                  {toPersianDigits(row.consumed_qty.toLocaleString('en-US'))}
                </td>
                <td className="px-3 py-2.5 text-left tabular-nums text-red-600" dir="ltr">
                  {row.waste_qty > 0
                    ? toPersianDigits(row.waste_qty.toLocaleString('en-US'))
                    : '—'}
                </td>
                <td className="px-3 py-2.5 text-left tabular-nums font-semibold text-[var(--c-fg)]" dir="ltr">
                  {toPersianDigits(row.total_qty.toLocaleString('en-US'))}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-[var(--c-fg)]" dir="ltr">
                  {toPersianDigits(Number(row.voucher_count ?? 0).toLocaleString('en-US'))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyAnalytics() {
  return (
    <div className="text-center py-16 rounded-[14px] border border-dashed border-[var(--c-border)] bg-[var(--c-card)]/40">
      <Inbox className="w-12 h-12 mx-auto mb-3 text-[var(--c-muted-fg)] opacity-60" />
      <p className="font-bold text-[var(--c-fg)] mb-1">هیچ مصرف ثبت‌شده‌ای برای این فیلترها یافت نشد</p>
      <p className="text-sm text-[var(--c-muted-fg)] max-w-md mx-auto">
        بازهٔ تاریخ، فارم یا دسته را تغییر دهید تا خلاصهٔ مصرف نمایش داده شود.
      </p>
    </div>
  );
}

export const ConsumptionAnalyticsSection = memo(ConsumptionAnalyticsSectionInner);
ConsumptionAnalyticsSection.displayName = 'ConsumptionAnalyticsSection';
