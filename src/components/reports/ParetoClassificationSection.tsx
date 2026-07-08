// =====================================================================
// ParetoClassificationSection — per-report UI for RPT_PARETO_CLASSIFICATION.
//
// Layout:
//   ┌──── Toolbar ─────────────────────────────────────────────────┐
//   │ [مبنای محاسبه: ارزش | مقدار]  [کلاس‌ها: A | B | C]            │
//   │ [فقط پیشنهاد سفارش]   [Export]                              │
//   │ Row counter + breakdown banner (A/B/C counts + total share)  │
//   ├──── Table ───────────────────────────────────────────────────┤
//   │ # | کالا | فارم | واحد | مقدار دوره | مبنا (ریال/مقدار)     │
//   │   | سهم (%) | سهم تجمعی (%) | کلاس | موجودی | نقطه سفارش    │
//   │   | مصرف روزانه | اقدام                                      │
//   │   (class A rows get a subtle highlight, reorder-recommended   │
//   │    rows get an amber pill + ⚠ icon)                          │
//   └──────────────────────────────────────────────────────────────┘
//
// Design notes:
//
// 1. Basis toggle (value vs quantity) is mirrored into ReportFiltersState
//    via abcBasis. RPC is recomputed on toggle.
//
// 2. The A/B/C filter chips are pure UX — the server doesn't need a new
//    param because we already have abc_class on every row.
//
// 3. Reorder recommendations are explained in a banner AT THE TOP of the
//    table so operators don't take the heuristic as gospel. The icon + pill
//    on each row + a tooltip on the column header compound that.
//
// 4. Cumulative share always wraps to 100% at the bottom row by SQL design;
//    a small footer note ("۱۰۰٪ — مجموع اقلام فعال در بازه") confirms.
//
// 5. Quick search is client-side over loaded rows (cheap, dataset is
//    bounded). We surface the fact in the search input placeholder so the
//    operator knows an item has to be 'in' the loaded set.
//
// 6. Drilldown to ItemLedgerPanel mirrors the valuation / aging report —
//    click any row to open the ledger side panel.
// =====================================================================

import { memo, useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calculator,
  Download,
  Inbox,
  ListFilter,
  Package,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton as Sk } from '@/components/ui/Skeleton';
import { toast } from 'sonner';
import { ItemLedgerPanel } from './ItemLedgerPanel';
import { triggerServerExport } from '@/lib/excelServer';
import { cn } from '@/utils/cn';
import { toPersianDigits, toEnglishDigits } from '@/utils/persianNumbers';
import {
  useParetoClassification,
  type ParetoRow,
} from '@/hooks/useParetoClassification';
import {
  ABC_THRESHOLDS,
  ABC_BASIS_OPTIONS,
  REORDER_HORIZON_DAYS,
  type AbcBasis,
} from '@/utils/constants';

interface ParetoClassificationSectionProps {
  /** ISO yyyy-MM-dd — required. */
  date_from: string;
  /** ISO yyyy-MM-dd — required. */
  date_to: string;
  /** Optional single farm filter. */
  farm_id?: string | null;
  /** Optional category text filter. */
  category?: string | null;
  /** Basis selector. Mirrored into filters.abcBasis. */
  basis: AbcBasis;
  /** Callback fired when user toggles the basis selector. */
  onBasisChange: (basis: AbcBasis) => void;
}

const CLASS_KEYS = ['A', 'B', 'C'] as const;
type ClassKey = (typeof CLASS_KEYS)[number];

const CLASS_LABELS: Record<ClassKey, string> = {
  A: 'کلاس A — اقلام حیاتی',
  B: 'کلاس B — اقلام متوسط',
  C: 'کلاس C — اقلام کم‌اهمیت',
};

function ParetoClassificationSectionInner({
  date_from,
  date_to,
  farm_id,
  category,
  basis,
  onBasisChange,
}: ParetoClassificationSectionProps) {
  // ===========================================================================
  // Live data hook.
  // ===========================================================================
  const { rows, isLoading, error } = useParetoClassification({
    date_from,
    date_to,
    farm_id: farm_id ?? null,
    category: category ?? null,
    basis,
  });

  // ===========================================================================
  // Local UX state — class chips + reorder-only toggle + search + drilldown.
  // ===========================================================================
  const [activeClasses, setActiveClasses] = useState<Set<ClassKey>>(
    () => new Set<ClassKey>(['A', 'B', 'C']),
  );
  const [reorderOnly, setReorderOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [drilldown, setDrilldown] = useState<{
    item_id: string;
    item_name: string;
    item_unit: string;
    item_category: string;
    farm_id: string;
    farm_name: string;
  } | null>(null);

  const toggleClass = useCallback((key: ClassKey) => {
    setActiveClasses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Don't allow zero-class filter state — at least one must remain.
        if (next.size <= 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // ===========================================================================
  // Visible rows — chip + reorder-only + search filter.
  // Search matches item_name or farm_name (case-insensitive substring).
  //
  // Persian-digit normalization: normalize BOTH the haystack and the
  // needle via toEnglishDigits before .includes() so that searching
  // "۱" (Persian) matches "1" (ASCII) inside e.g. "فارم ۱" or
  // "ذرت شماره ۱۲". Without this, users in the Persian locale typing
  // with Persian digits see "no match" on items whose stored digits
  // are Latin for the same character. Audit MINOR #6
  // (Known Limitations #6 → "Pareto + Ledger search doesn't normalize
  // Persian digits") followup.
  // ===========================================================================
  const visibleRows = useMemo<ParetoRow[]>(() => {
    const needle = toEnglishDigits(search.trim()).toLowerCase();
    return rows.filter((r) => {
      const cls = (r.abc_class as ClassKey);
      if (!activeClasses.has(cls)) return false;
      if (reorderOnly && !r.reorder_recommended) return false;
      if (needle.length > 0) {
        const hay = toEnglishDigits(`${r.item_name} ${r.farm_name}`).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, activeClasses, reorderOnly, search]);

  // ===========================================================================
  // Cohort summary — A/B/C row counts + reorder-pending count.
  // ===========================================================================
  const summary = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0 } as Record<ClassKey, number>;
    let reorderPending = 0;
    for (const r of rows) {
      const cls = (r.abc_class as ClassKey);
      if (cls in counts) counts[cls] += 1;
      if (r.reorder_recommended) reorderPending += 1;
    }
    return { counts, reorderPending };
  }, [rows]);

  // ===========================================================================
  // Handlers.
  // ===========================================================================
  const handleRowClick = useCallback((row: ParetoRow) => {
    setDrilldown({
      item_id: row.item_id,
      item_name: row.item_name,
      item_unit: row.item_unit,
      item_category: row.item_category,
      farm_id: row.farm_id,
      farm_name: row.farm_name || '',
    });
  }, []);
  const closeDrilldown = useCallback(() => setDrilldown(null), []);

  // ===========================================================================
  // Export — server-side .xlsx via the BFF. RBAC + JWT are enforced
  // server-side. Loading toast -> success (fileName + rowCount) or
  // informative failure (RBAC vs RPC vs network).
  // ===========================================================================
  const [exporting, setExporting] = useState(false);
  const onExportClick = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    const toastId = toast.loading('در حال ساخت فایل اکسل…');
    try {
      const { fileName, rowCount } = await triggerServerExport(
        'RPT_PARETO_CLASSIFICATION',
        {
          date_from,
          date_to,
          farm_id: farm_id ?? null,
          category: category ?? null,
          basis,
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
  }, [basis, category, date_from, date_to, exporting, farm_id]);

  return (
    <>
      {/* Heuristic explainer banner — sets expectations up front. */}
      <div
        className="rounded-[14px] border border-[var(--c-primary)]/30 bg-[var(--c-primary)]/5 px-3 py-2.5 text-xs sm:text-sm text-[var(--c-fg)] flex gap-2 items-start"
        role="note"
        aria-label="توضیح روش محاسبهٔ پارتو و پیشنهاد سفارش"
      >
        <Calculator className="w-4 h-4 mt-0.5 text-[var(--c-primary)] flex-shrink-0" />
        <div className="leading-relaxed">
          <span className="font-semibold">روش محاسبه:</span>{' '}
          کلاس‌بندی پارتو با آستانه‌های پیش‌فرض{' '}
          <span dir="ltr" className="font-semibold tabular-nums">
            {toPersianDigits(String(Math.round(ABC_THRESHOLDS.A * 100)))}٪
          </span>{' '}/{' '}
          <span dir="ltr" className="font-semibold tabular-nums">
            {toPersianDigits(String(Math.round(ABC_THRESHOLDS.B * 100)))}٪
          </span>{' '}
          روی مصرف دورهٔ انتخاب‌شده (نه کل موجودی). پیشنهاد سفارش بر اساس
          نقطهٔ سفارش هر کالا (reorder_point) است؛ جدول زمان تحویل (lead time)
          در این گزارش لحاظ نمی‌شود.
        </div>
      </div>

      {/* Toolbar: basis toggle + class chips + reorder toggle + search + export. */}
      <div className="flex flex-wrap items-center gap-2 rounded-[14px] bg-[var(--c-card)] border border-[var(--c-border)] shadow-[var(--card-shadow)] px-3 py-2.5 mt-3">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-[var(--c-muted-fg)]" />
          <span className="text-xs font-semibold text-[var(--c-fg)]">مبنای محاسبه:</span>
        </div>
        <div className="inline-flex items-center gap-0.5 bg-[var(--c-muted)] rounded-full p-0.5" role="group" aria-label="مبنای محاسبه">
          {ABC_BASIS_OPTIONS.map((opt) => {
            const active = basis === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onBasisChange(opt.value)}
                aria-pressed={active}
                title={opt.label}
                className={cn(
                  'text-xs font-medium px-2.5 h-7 rounded-full transition-colors',
                  active
                    ? 'bg-[var(--c-primary)] text-white shadow-[0_2px_6px_color-mix(in_srgb,var(--c-primary)_25%,transparent)]'
                    : 'text-[var(--c-muted-fg)] hover:text-[var(--c-fg)]',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="h-6 w-px bg-[var(--c-border)] hidden md:block" />

        <div className="flex items-center gap-1.5">
          <ListFilter className="w-3.5 h-3.5 text-[var(--c-muted-fg)]" />
          <span className="text-xs font-semibold text-[var(--c-fg)]">کلاس‌ها:</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="انتخاب کلاس‌ها">
          {CLASS_KEYS.map((k) => {
            const active = activeClasses.has(k);
            const count = summary.counts[k];
            const palette = CLASS_PALETTE[k];
            return (
              <button
                key={k}
                type="button"
                role="switch"
                aria-checked={active}
                aria-label={`${CLASS_LABELS[k]} — ${toPersianDigits(String(count))} ردیف`}
                title={`${CLASS_LABELS[k]} — ${toPersianDigits(String(count))} ردیف`}
                onClick={() => toggleClass(k)}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-bold px-2 h-8 rounded-full border transition-colors',
                  active
                    ? `${palette.active.bg} ${palette.active.text} ${palette.active.border}`
                    : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-muted-fg)] hover:bg-[var(--c-muted)]',
                )}
              >
                <span dir="ltr">{k}</span>
                <span
                  dir="ltr"
                  className={cn(
                    'rounded-full px-1 text-[10px] tabular-nums',
                    active ? 'bg-white/25 text-current' : 'bg-[var(--c-muted)] text-[var(--c-fg)]',
                  )}
                >
                  {toPersianDigits(String(count))}
                </span>
              </button>
            );
          })}
        </div>

        <div className="h-6 w-px bg-[var(--c-border)] hidden md:block" />

        <button
          type="button"
          onClick={() => setReorderOnly((v) => !v)}
          aria-pressed={reorderOnly}
          aria-label="فقط اقلام با پیشنهاد سفارش"
          title={
            reorderOnly
              ? 'غیرفعال‌سازی فیلتر پیشنهاد سفارش'
              : 'نمایش فقط اقلام با پیشنهاد سفارش (کلاس A و موجودی < نقطهٔ سفارش)'
          }
          className={cn(
            'inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium px-2.5 h-8 rounded-md border transition-colors',
            reorderOnly
              ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700/60'
              : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-fg)] hover:bg-[var(--c-muted)]',
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          فقط پیشنهاد سفارش
        </button>

        <div className="ms-auto flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-muted-fg)] pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجو در نام کالا یا فارم…"
              aria-label="جستجو در کالا یا فارم"
              className="text-xs sm:text-sm bg-[var(--c-bg)] border border-[var(--c-border)] rounded-md pr-7 pl-2 h-8 w-44 focus:outline-none focus:ring-2 focus:ring-[var(--c-primary)]/40"
            />
          </div>
          <Button size="sm" variant="outline" onClick={onExportClick} disabled={exporting} title={exporting ? 'در حال ساخت فایل…' : 'خروجی اکسل'} aria-label="خروجی اکسل" aria-busy={exporting}>
            {exporting ? (
              <span className="inline-block w-3.5 h-3.5 ml-1.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 ml-1.5" />
            )}
            {exporting ? 'در حال ساخت…' : 'خروجی اکسل'}
          </Button>
        </div>
      </div>

      {/* Row counter + reorder-pending badge. */}
      <div className="mt-2 flex items-center justify-between text-xs text-[var(--c-muted-fg)]">
        <span className="flex items-center gap-1.5">
          <span dir="ltr" className="font-semibold text-[var(--c-fg)] tabular-nums">
            {toPersianDigits(String(visibleRows.length))}
          </span>
          <span>ردیف از</span>
          <span dir="ltr" className="tabular-nums">
            {toPersianDigits(String(rows.length))}
          </span>
          <span>ردیف فعال</span>
        </span>
        {summary.reorderPending > 0 && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
            title={`${toPersianDigits(String(summary.reorderPending))} قلم پیشنهاد سفارش دارد — بر اساس آستانهٔ نقطهٔ سفارش هر کالا`}
          >
            <AlertTriangle className="w-2.5 h-2.5" />
            <span dir="ltr" className="font-semibold tabular-nums">
              {toPersianDigits(String(summary.reorderPending))}
            </span>
            <span>پیشنهاد سفارش</span>
          </span>
        )}
      </div>

      {/* Error banner. */}
      {error && (
        <div
          role="alert"
          className="rounded-[14px] border border-[var(--c-destructive)]/30 bg-[var(--c-destructive)]/10 px-4 py-3 text-sm text-[var(--c-destructive)] mt-3"
        >
          {error}
        </div>
      )}

      {/* Initial-load skeleton. */}
      {isLoading && rows.length === 0 ? (
        <div className="space-y-2 mt-3" aria-busy="true" aria-label="در حال بارگذاری طبقه‌بندی پارتو">
          {Array.from({ length: 8 }).map((_, i) => (
            <Sk key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : visibleRows.length === 0 ? (
        <EmptyPareto />
      ) : (
        <div className="mt-3">
          <ParetoTable rows={visibleRows} basis={basis} onRowClick={handleRowClick} />
        </div>
      )}

      {/* Drilldown — open ItemLedgerPanel on row click. */}
      <ItemLedgerPanel
        isOpen={drilldown !== null}
        onClose={closeDrilldown}
        itemId={drilldown?.item_id ?? null}
        itemName={drilldown?.item_name ?? null}
        itemUnit={drilldown?.item_unit ?? null}
        itemCategory={drilldown?.item_category ?? null}
        farmId={drilldown?.farm_id ?? null}
        asOf={date_to}
      />
    </>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

const CLASS_PALETTE: Record<ClassKey, {
  active: { bg: string; text: string; border: string };
  badge: { bg: string; text: string };
  rowTint: string;
}> = {
  A: {
    active: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-800 dark:text-green-300', border: 'border-green-300 dark:border-green-700/60' },
    badge:  { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-800 dark:text-green-300' },
    rowTint: 'bg-green-50/40 hover:bg-green-50 dark:bg-green-950/10',
  },
  B: {
    active: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-800 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-700/60' },
    badge:  { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-800 dark:text-amber-300' },
    rowTint: 'hover:bg-[var(--c-muted)]/60',
  },
  C: {
    active: { bg: 'bg-slate-100 dark:bg-slate-900/40', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-300 dark:border-slate-700/60' },
    badge:  { bg: 'bg-slate-100 dark:bg-slate-900/40', text: 'text-slate-700 dark:text-slate-300' },
    rowTint: 'hover:bg-[var(--c-muted)]/60',
  },
};

interface ParetoTableProps {
  rows: ParetoRow[];
  basis: AbcBasis;
  onRowClick: (row: ParetoRow) => void;
}

function ParetoTable({ rows, basis, onRowClick }: ParetoTableProps) {
  const isValue = basis === 'value';
  return (
    <div className="overflow-x-auto rounded-[14px] bg-[var(--c-card)] border border-[var(--c-border)] shadow-[var(--card-shadow)]">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-[var(--c-muted)] border-b-2 border-[var(--c-border)]">
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] w-12 sticky right-0 bg-[var(--c-muted)] z-10">#</th>
            <th className="px-3 py-3 text-right font-semibold text-[var(--c-fg)]">کالا</th>
            <th className="px-3 py-3 text-right font-semibold text-[var(--c-fg)]">فارم</th>
            <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">مقدار دوره</th>
            <th
              className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]"
              title={
                isValue
                  ? 'ارزش دوره = مقدار مصرف × آخرین قیمت واحد خرید'
                  : 'مبنا: مقدار خالص مصرف در دوره'
              }
            >
              {isValue ? 'ارزش دوره (ریال)' : 'مبنا (مقدار)'}
            </th>
            <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">سهم %</th>
            <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">سهم تجمعی %</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)]">کلاس</th>
            <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">موجودی</th>
            <th
              className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]"
              title={`نقطهٔ سفارش پیکربندی‌شده در farm_items.reorder_point — جدول زمان تحویل (lead time) در این گزارش لحاظ نمی‌شود`}
            >
              نقطه سفارش
            </th>
            <th
              className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]"
              title={`میانگین مصرف روزانه در دورهٔ انتخاب‌شده — افق پیشنهادی: ${toPersianDigits(String(REORDER_HORIZON_DAYS))} روز`}
            >
              مصرف روزانه
            </th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)]">اقدام</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <ParetoRowView
              key={`${row.farm_id}-${row.item_id}`}
              row={row}
              index={idx}
              isValue={isValue}
              onClick={onRowClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ParetoRowViewProps {
  row: ParetoRow;
  index: number;
  isValue: boolean;
  onClick: (row: ParetoRow) => void;
}

function ParetoRowView({ row, index, isValue, onClick }: ParetoRowViewProps) {
  const cls = (row.abc_class as ClassKey);
  const palette = CLASS_PALETTE[cls] ?? CLASS_PALETTE.C;
  return (
    <tr
      className={cn(
        'border-b border-[var(--c-border)] cursor-pointer transition-colors focus-within:bg-[var(--c-muted)]/70',
        palette.rowTint,
      )}
      onClick={() => onClick(row)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(row);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`باز کردن گردش کالا — کلاس ${cls}`}
    >
      <td className="px-3 py-2.5 text-center text-[var(--c-muted-fg)] sticky right-0 z-10 tabular-nums bg-[var(--c-card)]" dir="ltr">
        {toPersianDigits(index + 1)}
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center gap-2 justify-end">
          <span className="text-[var(--c-fg)]">{row.item_name}</span>
          <span className="text-xs text-[var(--c-muted-fg)]">({row.item_unit})</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right text-[var(--c-fg)]">{row.farm_name || '—'}</td>
      <td className="px-3 py-2.5 text-left tabular-nums text-[var(--c-fg)]" dir="ltr">
        {toPersianDigits(row.period_qty.toLocaleString('en-US'))}
      </td>
      <td
        className={cn(
          'px-3 py-2.5 text-left tabular-nums font-semibold',
          row.unit_cost == null && isValue ? 'text-[var(--c-muted-fg)] italic' : 'text-[var(--c-fg)]',
        )}
        dir="ltr"
      >
        {isValue
          ? row.unit_cost == null
            ? '— (فاقد قیمت)'
            : toPersianDigits(Math.round(row.basis_metric).toLocaleString('en-US'))
          : toPersianDigits(row.basis_metric.toLocaleString('en-US'))}
      </td>
      <td className="px-3 py-2.5 text-left tabular-nums text-[var(--c-fg)]" dir="ltr">
        {toPersianDigits(row.share_pct.toFixed(1))}٪
      </td>
      <td className="px-3 py-2.5 text-left tabular-nums text-[var(--c-fg)]" dir="ltr">
        {toPersianDigits(row.cumulative_share_pct.toFixed(1))}٪
      </td>
      <td className="px-3 py-2.5 text-center">
        <Badge className={palette.badge.bg}>کلاس {cls}</Badge>
      </td>
      <td
        className={cn(
          'px-3 py-2.5 text-left tabular-nums font-semibold',
          row.on_hand_qty < 0 ? 'text-amber-700 dark:text-amber-400' : 'text-[var(--c-fg)]',
        )}
        dir="ltr"
      >
        {toPersianDigits(row.on_hand_qty.toLocaleString('en-US'))}
      </td>
      <td className="px-3 py-2.5 text-left tabular-nums text-[var(--c-fg)]" dir="ltr">
        {toPersianDigits(row.reorder_point.toLocaleString('en-US'))}
      </td>
      <td className="px-3 py-2.5 text-left tabular-nums text-[var(--c-fg)]" dir="ltr">
        {toPersianDigits(row.avg_daily_consumption.toLocaleString('en-US', { maximumFractionDigits: 2 }))}
      </td>
      <td className="px-3 py-2.5 text-center">
        {row.reorder_recommended ? (
          <span
            className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-300"
            title={`پیشنهاد سفارش — کلاس ${cls}، موجودی کمتر از نقطهٔ سفارش (${toPersianDigits(row.reorder_point.toLocaleString('en-US'))})، مصرف روزانه: ${toPersianDigits(row.avg_daily_consumption.toLocaleString('en-US', { maximumFractionDigits: 2 }))}`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>سفارش</span>
          </span>
        ) : (
          <span className="text-xs text-[var(--c-muted-fg)]">—</span>
        )}
      </td>
    </tr>
  );
}

function EmptyPareto() {
  return (
    <div className="text-center py-16 mt-3 rounded-[14px] border border-dashed border-[var(--c-border)] bg-[var(--c-card)]/40">
      <Inbox className="w-12 h-12 mx-auto mb-3 text-[var(--c-muted-fg)] opacity-60" />
      <Package className="w-4 h-4 mx-auto mb-2 text-[var(--c-primary)]" />
      <p className="font-bold text-[var(--c-fg)] mb-1">کالای فعالی در بازهٔ انتخاب‌شده یافت نشد</p>
      <p className="text-sm text-[var(--c-muted-fg)] max-w-md mx-auto">
        بازهٔ تاریخی یا فیلتر کلاس را تغییر دهید — کلاس‌بندی فقط روی اقلام با مصرف مثبت در دوره اعمال می‌شود.
      </p>
    </div>
  );
}

export const ParetoClassificationSection = memo(ParetoClassificationSectionInner);
ParetoClassificationSection.displayName = 'ParetoClassificationSection';
