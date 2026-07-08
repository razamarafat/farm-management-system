// =====================================================================
// InventoryAgingSection — per-report UI for RPT_INVENTORY_AGING.
//
// Layout:
//   ┌──── Toolbar ─────────────────────────────────────────────────┐
//   │ [Bucket chips: ۰–۳۰ / ۳۱–۶۰ / ۶۱–۹۰ / ۹۰+]   [Show dead only] [Export] │
//   │ Row counter + total dead count                               │
//   ├──── Table ───────────────────────────────────────────────────┤
//   │ # | کالا | فارم | موجودی | آخرین حرکت | سن (روز) | بازه | راکد | ارزش │
//   │   (dead-stock rows get an amber/red tint + ☠ icon)           │
//   └──────────────────────────────────────────────────────────────┘
//
// Bucket chips are multi-select "include these buckets" — tapping a
// chip toggles inclusion. All four are active by default so the table
// renders every row the RPC returned; the section never expands the
// data set, it only narrows.
//
// Dead-stock behaviour:
//   - Server returns dead_stock=true per row (using p_dead_stock_days).
//   - Section has a "فقط اقلام راکد" toggle that filters the table to
//     only dead rows — that's a UX shortcut, not a recomputation. The
//     server-supplied flag stays the source of truth.
//   - Amber/red tint + ☠ icon on dead rows so they stay visible in
//     the all-buckets view.
//
// Drilldown:
//   Clicking a row opens ItemLedgerPanel for that (item_id, farm_id)
//   pinned to the report's asOf date. Reuses the same panel the
//   valuation report and the ledger report already use.
//
// Export:
//   Placeholder button only — actual Excel export is a follow-up.
// =====================================================================

import { memo, useCallback, useMemo, useState } from 'react';
import {
  AlertOctagon,
  Calendar,
  Download,
  Inbox,
  Skull,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton as Sk } from '@/components/ui/Skeleton';
import { toast } from 'sonner';
import { ItemLedgerPanel } from './ItemLedgerPanel';
import { triggerServerExport } from '@/lib/excelServer';
import { cn } from '@/utils/cn';
import { toPersianDigits } from '@/utils/persianNumbers';
import { gregorianToJalali } from '@/utils/jalaliDate';
import {
  useInventoryAging,
  type InventoryAgingRow,
} from '@/hooks/useInventoryAging';
import { AGE_BUCKETS, DEAD_STOCK_THRESHOLD_DAYS } from '@/utils/constants';

interface InventoryAgingSectionProps {
  /** ISO yyyy-MM-dd — drives days_since_last_movement. Required. */
  asOf: string;
  /** Optional single farm filter. */
  farm_id?: string | null;
  /** Optional category text filter. */
  category?: string | null;
  /** Dead-stock threshold in days. Defaults to constants.DEAD_STOCK_THRESHOLD_DAYS. */
  deadStockDays?: number;
}

function InventoryAgingSectionInner({
  asOf,
  farm_id,
  category,
  deadStockDays,
}: InventoryAgingSectionProps) {
  // ===========================================================================
  // Live data hook.
  // ===========================================================================
  const threshold = deadStockDays ?? DEAD_STOCK_THRESHOLD_DAYS;
  const { rows, isLoading, error } = useInventoryAging({
    as_of: asOf,
    farm_id: farm_id ?? null,
    category: category ?? null,
    dead_stock_days: threshold,
  });

  // ===========================================================================
  // Local UX state — bucket chip selection + dead-only toggle + drilldown.
  // ===========================================================================
  const initialBuckets = useMemo(() => new Set(AGE_BUCKETS.map((b) => b.key)), []);
  const [activeBuckets, setActiveBuckets] = useState<Set<string>>(initialBuckets);
  const [deadOnly, setDeadOnly] = useState(false);
  const [drilldown, setDrilldown] = useState<{
    item_id: string;
    item_name: string;
    item_unit: string;
    item_category: string;
    farm_id: string;
    farm_name: string | null;
  } | null>(null);

  const toggleBucket = useCallback((key: string) => {
    setActiveBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Don't allow zero-bucket state — at least one must remain active.
        if (next.size <= 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // ===========================================================================
  // Visible rows — apply chip + dead-only filters.
  // ===========================================================================
  const visibleRows = useMemo<InventoryAgingRow[]>(() => {
    return rows.filter((r) => {
      // No bucket assigned (NULL = no movement ever) — always shown.
      if (r.age_bucket === null) return true;
      if (!activeBuckets.has(r.age_bucket)) return false;
      if (deadOnly && !r.dead_stock) return false;
      return true;
    });
  }, [rows, activeBuckets, deadOnly]);

  // ===========================================================================
  // Aggregate stats — total rows + dead count + total value.
  // ===========================================================================
  const stats = useMemo(() => {
    const totalValue = visibleRows.reduce((acc, r) => acc + (r.value_rial ?? 0), 0);
    const deadCount = visibleRows.filter((r) => r.dead_stock).length;
    return { totalValue, deadCount };
  }, [visibleRows]);

  // ===========================================================================
  // Bucket → rowcount mapping for the chip strip — used to label each
  // bucket with its visible count without forcing the chip to be the
  // filter authority (server's row order already respects bucket).
  // ===========================================================================
  const bucketCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (r.age_bucket === null) continue;
      counts.set(r.age_bucket, (counts.get(r.age_bucket) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  // ===========================================================================
  // Drilldown + table click handler.
  // ===========================================================================
  const handleRowClick = useCallback((row: InventoryAgingRow) => {
    setDrilldown({
      item_id: row.item_id,
      item_name: row.item_name,
      item_unit: row.item_unit,
      item_category: row.item_category,
      farm_id: row.farm_id,
      farm_name: row.farm_name || null,
    });
  }, []);
  const closeDrilldown = useCallback(() => setDrilldown(null), []);

  // ===========================================================================
  // Export — trigger the server-side BFF to drain the aging RPC, format
  // a styled .xlsx, and download the blob. RBAC + JWT are enforced
  // server-side; we just forward the user's filters and the same Bearer
  // token the row query already used. Errors surface in a toast so
  // operators know why the download failed (RBAC vs RPC vs network).
  // ===========================================================================
  const [exporting, setExporting] = useState(false);
  const onExportClick = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    const toastId = toast.loading('در حال ساخت فایل اکسل…');
    try {
      const { fileName, rowCount } = await triggerServerExport(
        'RPT_INVENTORY_AGING',
        {
          date_to: asOf,
          farm_id: farm_id ?? null,
          category: category ?? null,
          dead_stock_days: threshold,
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
  }, [asOf, category, exporting, farm_id, threshold]);

  return (
    <>
      {/* Bucket chip strip + dead-only + export. */}
      <div className="flex flex-wrap items-center gap-2 rounded-[14px] bg-[var(--c-card)] border border-[var(--c-border)] shadow-[var(--card-shadow)] px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-[var(--c-muted-fg)]" />
          <span className="text-xs font-semibold text-[var(--c-fg)]">بازهٔ سنی:</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="انتخاب بازه‌های سنی">
          {AGE_BUCKETS.map((b) => {
            const active = activeBuckets.has(b.key);
            const count = bucketCounts.get(b.key) ?? 0;
            return (
              <button
                key={b.key}
                type="button"
                role="switch"
                aria-checked={active}
                aria-label={`${b.label} — ${toPersianDigits(String(count))} ردیف`}
                title={`${b.label} — ${toPersianDigits(String(count))} ردیف`}
                onClick={() => toggleBucket(b.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium px-2 h-8 rounded-full border transition-colors',
                  active
                    ? b.key === '90+'
                      ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700/60'
                      : 'bg-[var(--c-primary)] text-white border-[var(--c-primary)] shadow-[0_2px_6px_color-mix(in_srgb,var(--c-primary)_25%,transparent)]'
                    : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-muted-fg)] hover:bg-[var(--c-muted)]',
                )}
              >
                {b.label}
                <span
                  dir="ltr"
                  className={cn(
                    'rounded-full px-1 text-[10px] tabular-nums font-bold',
                    active
                      ? 'bg-white/20 text-current'
                      : 'bg-[var(--c-muted)] text-[var(--c-fg)]',
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
          onClick={() => setDeadOnly((v) => !v)}
          aria-pressed={deadOnly}
          aria-label="فقط اقلام راکد"
          title={
            deadOnly
              ? `غیرفعال‌سازی فیلتر اقلام راکد — آستانه: ${toPersianDigits(String(threshold))} روز`
              : `نمایش فقط اقلام راکد — آستانه: ${toPersianDigits(String(threshold))} روز`
          }
          className={cn(
            'inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium px-2.5 h-8 rounded-md border transition-colors',
            deadOnly
              ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700/60'
              : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-fg)] hover:bg-[var(--c-muted)]',
          )}
        >
          <Skull className="w-3.5 h-3.5" />
          فقط اقلام راکد
        </button>

        <Button
          size="sm"
          variant="outline"
          onClick={onExportClick}
          disabled={exporting}
          title={exporting ? 'در حال ساخت فایل…' : 'خروجی اکسل'}
          aria-label="خروجی اکسل"
          aria-busy={exporting}
        >
          {exporting ? (
            <span className="inline-block w-3.5 h-3.5 ml-1.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5 ml-1.5" />
          )}
          {exporting ? 'در حال ساخت…' : 'خروجی اکسل'}
        </Button>

        <div className="ms-auto flex items-center gap-3 text-xs text-[var(--c-muted-fg)]">
          <span className="flex items-center gap-1.5">
            <span dir="ltr" className="font-semibold text-[var(--c-fg)] tabular-nums">
              {toPersianDigits(String(visibleRows.length))}
            </span>
            <span>ردیف</span>
          </span>
          {stats.deadCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
              title={`اقلام راکد — آستانه: ${toPersianDigits(String(threshold))} روز`}
            >
              <AlertOctagon className="w-2.5 h-2.5" />
              <span dir="ltr" className="font-semibold tabular-nums">
                {toPersianDigits(String(stats.deadCount))}
              </span>
              <span>راکد</span>
            </span>
          )}
        </div>
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
        <div className="space-y-2 mt-3" aria-busy="true" aria-label="در حال بارگذاری پیر شدگی موجودی">
          {Array.from({ length: 8 }).map((_, i) => (
            <Sk key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : visibleRows.length === 0 ? (
        <EmptyAging />
      ) : (
        <div className="mt-3">
          <AgingTable
            rows={visibleRows}
            onRowClick={handleRowClick}
            threshold={threshold}
          />
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
        asOf={asOf}
      />
    </>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

interface AgingTableProps {
  rows: InventoryAgingRow[];
  onRowClick: (row: InventoryAgingRow) => void;
  /** Computed dead-stock threshold (deadStockDays ?? constant) — threaded
   *  down so the per-row Skull icon tooltip follows the prop instead of
   *  hardcoding DEAD_STOCK_THRESHOLD_DAYS (audit Known Limitations #5
   *  followup). */
  threshold: number;
}

function AgingTable({ rows, onRowClick, threshold }: AgingTableProps) {
  return (
    <div className="overflow-x-auto rounded-[14px] bg-[var(--c-card)] border border-[var(--c-border)] shadow-[var(--card-shadow)]">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-[var(--c-muted)] border-b-2 border-[var(--c-border)]">
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] w-12 sticky right-0 bg-[var(--c-muted)] z-10">#</th>
            <th className="px-3 py-3 text-right font-semibold text-[var(--c-fg)]">کالا</th>
            <th className="px-3 py-3 text-right font-semibold text-[var(--c-fg)]">فارم</th>
            <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">موجودی</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] whitespace-nowrap">آخرین حرکت</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)]">سن (روز)</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)]">بازه</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)]">وضعیت</th>
            <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">ارزش ریالی</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <AgingRow
              key={`${row.farm_id}-${row.item_id}`}
              row={row}
              index={idx}
              onClick={onRowClick}
              threshold={threshold}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface AgingRowProps {
  row: InventoryAgingRow;
  index: number;
  onClick: (row: InventoryAgingRow) => void;
  /** Dead-stock threshold (days) — used for the Skull icon tooltip so
   *  the value follows the parent prop override, not the constant. */
  threshold: number;
}

function AgingRow({ row, index, onClick, threshold }: AgingRowProps) {
  return (
    <tr
      className={cn(
        'border-b border-[var(--c-border)] cursor-pointer transition-colors focus-within:bg-[var(--c-muted)]/70',
        row.dead_stock
          ? 'bg-red-50 hover:bg-red-100/80 dark:bg-red-950/30 dark:hover:bg-red-950/50'
          : 'hover:bg-[var(--c-muted)]/60',
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
      aria-label={row.dead_stock ? 'باز کردن گردش کالای راکد' : 'باز کردن گردش کالا'}
    >
      <td
        className={cn(
          'px-3 py-2.5 text-center text-[var(--c-muted-fg)] sticky right-0 z-10 tabular-nums',
          row.dead_stock ? 'bg-red-50 dark:bg-red-950/30' : 'bg-[var(--c-card)]',
        )}
        dir="ltr"
      >
        {toPersianDigits(index + 1)}
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center gap-2 justify-end">
          {row.dead_stock && (
            <span
              className="inline-flex items-center gap-1 text-red-700 dark:text-red-400"
              title={`کالای راکد — بیش از ${toPersianDigits(String(threshold))} روز بدون حرکت`}
            >
              <Skull className="w-3.5 h-3.5" />
            </span>
          )}
          <span className="text-[var(--c-fg)]">{row.item_name}</span>
          <span className="text-xs text-[var(--c-muted-fg)]">({row.item_unit})</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right text-[var(--c-fg)]">{row.farm_name || '—'}</td>
      <td
        className={cn(
          'px-3 py-2.5 text-left tabular-nums font-bold',
          row.on_hand_qty < 0 ? 'text-amber-700 dark:text-amber-400' : 'text-[var(--c-fg)]',
        )}
        dir="ltr"
      >
        {toPersianDigits(row.on_hand_qty.toLocaleString('en-US'))}
      </td>
      <td className="px-3 py-2.5 text-center" dir="ltr">
        <span className="tabular-nums text-[var(--c-fg)]">
          {row.last_movement_date
            ? toPersianDigits(gregorianToJalali(row.last_movement_date))
            : '—'}
        </span>
      </td>
      <td
        className={cn(
          'px-3 py-2.5 text-center tabular-nums font-semibold',
          row.dead_stock ? 'text-red-700 dark:text-red-400' : 'text-[var(--c-fg)]',
        )}
        dir="ltr"
      >
        {row.days_since_last_movement != null
          ? toPersianDigits(row.days_since_last_movement.toLocaleString('en-US'))
          : '—'}
      </td>
      <td className="px-3 py-2.5 text-center">
        <BucketBadge bucketKey={row.age_bucket} />
      </td>
      <td className="px-3 py-2.5 text-center">
        {row.dead_stock ? (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
            راکد
          </Badge>
        ) : (
          <Badge variant="secondary">فعال</Badge>
        )}
      </td>
      <td className="px-3 py-2.5 text-left tabular-nums text-[var(--c-fg)]" dir="ltr">
        {row.value_rial != null
          ? toPersianDigits(Number(row.value_rial).toLocaleString('en-US'))
          : '—'}
      </td>
    </tr>
  );
}

function BucketBadge({ bucketKey }: { bucketKey: string | null }) {
  if (bucketKey === null) {
    return <Badge variant="secondary">بدون حرکت</Badge>;
  }
  const bucket = AGE_BUCKETS.find((b) => b.key === bucketKey);
  if (!bucket) {
    return <Badge variant="secondary">{bucketKey}</Badge>;
  }
  const colorClass =
    bucketKey === '90+'
      ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
      : bucketKey === '61-90'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
        : bucketKey === '31-60'
          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
          : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  return <Badge className={colorClass}>{bucket.label}</Badge>;
}

function EmptyAging() {
  return (
    <div className="text-center py-16 mt-3 rounded-[14px] border border-dashed border-[var(--c-border)] bg-[var(--c-card)]/40">
      <Inbox className="w-12 h-12 mx-auto mb-3 text-[var(--c-muted-fg)] opacity-60" />
      <p className="font-bold text-[var(--c-fg)] mb-1">کالای متناسب با فیلترها یافت نشد</p>
      <p className="text-sm text-[var(--c-muted-fg)] max-w-md mx-auto">
        بازه سنی انتخاب‌شده خالی است. با فعال کردن سایر بازه‌ها یا تغییر تاریخ، دوباره بررسی کنید.
      </p>
    </div>
  );
}

export const InventoryAgingSection = memo(InventoryAgingSectionInner);
InventoryAgingSection.displayName = 'InventoryAgingSection';
