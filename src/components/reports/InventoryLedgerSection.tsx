// =====================================================================
// InventoryLedgerSection
//
// The report-specific UI for RPT_INVENTORY_LEDGER. Why a dedicated
// component instead of the generic ReportTable?
//
//   - The generic ReportTable expects a known totalCount for page-based
//     pagination. The ledger RPC only exposes has_more (no total
//     count), so the pagination model is "load more" — a custom footer.
//   - "Group by item" toggle naturally belongs to this report (and not
//     to the per-item drilldown panel), so we render sectioned rows
//     here.
//   - Quick search: the RPC has no `q` parameter. We do client-side
//     filtering on the LOADED page; a chip reminds the user.
//
// Hall derivation:
//   The RPC returns source_type + source_id but NOT hall_id or
//   hall_numbers. For consumption-source rows (source_type =
//   'daily_voucher_line') we batch a tiny `.from('daily_voucher_lines
//   ').select('id, hall_numbers').in('id', [...])` on first render
//   and cache the Map<source_id, hall_numbers>. For non-voucher rows
//   we render "—".
//
// Drilldown:
//   Clicking a row opens ItemLedgerPanel (same component the
//   valuation report's row-click already uses) with the item details.
//   We pass the as-of date as the date_to so the panel shows the
//   historical ledger, exactly as the valuation report does.
//
// Future hooks the design consciously does NOT add yet:
//   * Search parameter (would need a new RPC + trigram index).
//   * Server-side group_by (would need a new RPC) — current grouping
//     is purely a render-time sort, since cross-item grouping needs
//     the same running-balance partitioning the per-item ledger has.
//
// All texts in Persian, RTL. Numbers use the existing toPersianDigits
// + toLocaleString('en-US') pattern from the valuation report.
// =====================================================================

import { memo, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ChevronLeft,
  Download,
  Filter,
  Inbox,
  Layers,
  Loader2,
  Package,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton as Sk } from '@/components/ui/Skeleton';
import { ItemLedgerPanel } from './ItemLedgerPanel';
import { cn } from '@/utils/cn';
import { toPersianDigits, toEnglishDigits } from '@/utils/persianNumbers';
import { gregorianToJalali } from '@/utils/jalaliDate';
import { supabase } from '@/lib/supabase';
import { triggerServerExport } from '@/lib/excelServer';
import {
  useInventoryLedgerReport,
  type UseInventoryLedgerReportParams,
} from '@/hooks/useInventoryLedgerReport';
import type { ItemLedgerRow } from '@/hooks/useItemLedger';
import { TXN_TYPE_LABELS, TXN_TYPE_COLORS, type TransactionType } from '@/types/inventory.types';
import { toast } from 'sonner';

interface InventoryLedgerSectionProps {
  filters: UseInventoryLedgerReportParams;
  /** ISO yyyy-MM-dd — used as the panel's date_to when the user drills in. */
  asOf: string;
}

// ---------------------------------------------------------------------------
// Keys for cache lookups.
const HALL_LOOKUP_TABLE = 'daily_voucher_lines';
const HALL_LOOKUP_COLS = 'id, hall_numbers';

const txnTypeKeys = Object.keys(TXN_TYPE_LABELS) as TransactionType[];

function InventoryLedgerSectionInner({ filters, asOf }: InventoryLedgerSectionProps) {
  // ===========================================================================
  // Live data hook. RPC keyset pagination + multi-type client-side post-filter.
  // ===========================================================================
  const { rows, isLoading, error, hasMore, loadNext } = useInventoryLedgerReport(filters);

  // ===========================================================================
  // Local UX state — owned by the section, NOT persisted to avoid saved-view
  // bloat. Toggles survive a same-shape-remount because they live in the
  // component, but reset on next report visit (intentional).
  // ===========================================================================
  const [query, setQuery] = useState<string>('');
  const [groupByItem, setGroupByItem] = useState<boolean>(false);
  const [drilldown, setDrilldown] = useState<{
    item_id: string;
    item_name: string;
    item_unit: string;
    item_category: string;
    farm_id: string;
    farm_name: string | null;
  } | null>(null);

  // ===========================================================================
  // Hall data cache — source_id (uuid) → hall_numbers (CSV string). Lazy
  // fetches daily_voucher_lines for the current page's voucher-source rows.
  // ===========================================================================
  const [hallCache, setHallCache] = useState<Map<string, string>>(new Map());
  const lastHallFetchKey = useRef<string>('');

  useEffect(() => {
    // Skip non-voucher source rows entirely.
    const sourceIds = Array.from(
      new Set(
        rows
          .filter((r) => r.source_type === 'daily_voucher_line' && r.source_id)
          .map((r) => String(r.source_id)),
      ),
    ).filter((id) => !hallCache.has(id));

    if (sourceIds.length === 0) return;
    const key = sourceIds.join(',');
    if (lastHallFetchKey.current === key) return;
    lastHallFetchKey.current = key;

    let cancelled = false;
    (async () => {
      try {
        const { data, error: rpcError } = await supabase
          .from(HALL_LOOKUP_TABLE)
          .select(HALL_LOOKUP_COLS)
          .in('id', sourceIds);
        if (cancelled || rpcError || !data) return;
        const next = new Map(hallCache);
        (data as Array<{ id: string; hall_numbers: string | null }>).forEach((row) => {
          next.set(row.id, row.hall_numbers ?? '');
        });
        setHallCache(next);
      } catch {
        // Soft-fail: rows render without hall info.
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // ===========================================================================
  // Quick search — client-side filter over LOADED rows only.
  //
  // Persian-digit normalization: normalize BOTH the haystack (every
  // search field) AND the query via toEnglishDigits before .includes()
  // so a user typing "خرید ۱" matches rows whose reference_no/txn_date
  // is "خرید 1". Audit MINOR #6 followup — closes the
  // Persian-digit asymmetry in the ledger quick search (and the
  // Pareto search, which got the same treatment).
  // ===========================================================================
  const normalizedQuery = toEnglishDigits(query.trim()).toLowerCase();
  const visibleRows = useMemo(() => {
    if (!normalizedQuery) return rows;
    return rows.filter((r) => {
      const haystack = toEnglishDigits(
        [
          r.item_name,
          r.farm_name,
          r.reference_no,
          r.notes,
          r.supplier_name,
          r.txn_type,
        ]
          .filter(Boolean)
          .join('\u0001'),
      ).toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [rows, normalizedQuery]);

  // ===========================================================================
  // Group by Item — when ON, sort by item_name ASC + txn_ts DESC, then emit
  // a section-start marker before each new item group. The visible display
  // still respects txn_ts DESC within a group, so reading order feels
  // natural.
  // ===========================================================================
  const groupedRows = useMemo(() => {
    if (!groupByItem) return null;
    const arr = [...visibleRows];
    arr.sort((a, b) => {
      const byItem = (a.item_name ?? '').localeCompare(b.item_name ?? '', 'fa', {
        numeric: true,
      });
      if (byItem !== 0) return byItem;
      // Within the same item, the most-recent activity first.
      const aTs = a.txn_ts ?? '';
      const bTs = b.txn_ts ?? '';
      return bTs.localeCompare(aTs);
    });
    // Build the section headers inline. The Renderer keys the section
    // header rows with a synthetic `__group_<item_id>` so React keeps
    // them stable across renders.
    type DisplayRow =
      | { kind: 'group'; key: string; item_id: string; label: string }
      | { kind: 'row'; row: ItemLedgerRow };
    const out: DisplayRow[] = [];
    let lastItemId: string | null = null;
    for (const r of arr) {
      if (r.item_id !== lastItemId) {
        out.push({
          kind: 'group',
          key: `__group_${r.item_id}`,
          item_id: r.item_id,
          label: `${r.item_name}${r.item_unit ? ` (${r.item_unit})` : ''}`,
        });
        lastItemId = r.item_id;
      }
      out.push({ kind: 'row', row: r });
    }
    return out;
  }, [visibleRows, groupByItem]);

  // ===========================================================================
  // Drilldown — open ItemLedgerPanel on row click.
  // ===========================================================================
  const handleRowClick = useCallback((row: ItemLedgerRow) => {
    setDrilldown({
      item_id: row.item_id,
      item_name: row.item_name,
      item_unit: row.item_unit,
      item_category: String(row.item_category ?? ''),
      farm_id: row.farm_id,
      farm_name: row.farm_name ?? null,
    });
  }, []);

  const closeDrilldown = useCallback(() => setDrilldown(null), []);

  // ===========================================================================
  // Export — server-side .xlsx via the BFF. Uses the exact hook params that
  // populate the table so the download and visible report share one filter set.
  // ===========================================================================
  const [exporting, setExporting] = useState(false);
  const onExportClick = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    const toastId = toast.loading('در حال ساخت فایل اکسل…');
    try {
      const { fileName, rowCount } = await triggerServerExport(
        'RPT_INVENTORY_LEDGER',
        {
          date_from: filters.date_from,
          date_to: filters.date_to,
          farm_id: filters.farm_id ?? null,
          item_id: filters.item_id ?? null,
          category: filters.category ?? null,
          txnTypes: filters.txnTypes ?? null,
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
  }, [exporting, filters]);

  // ===========================================================================
  // Render.
  // ===========================================================================
  return (
    <>
      {/* Search + group-by toolbar — ledger-specific controls. */}
      <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-[var(--c-card)] border border-[var(--c-border)] shadow-[var(--card-shadow)] px-3 py-2.5">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[var(--c-muted-fg)] pointer-events-none" />
          <input
            type="text"
            dir="rtl"
            placeholder="جستجو در ردیف‌های بارگذاری‌شده…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="جستجوی سریع"
            className="w-full bg-[var(--c-bg)] border border-[var(--c-border)] rounded-md h-9 pr-9 pl-3 text-sm placeholder:text-[var(--c-muted-fg)] focus:border-[var(--c-primary)] focus:outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[var(--c-muted-fg)]">
          <Filter className="w-3.5 h-3.5" />
          <span dir="ltr" className="font-semibold text-[var(--c-fg)]">
            {toPersianDigits(String(visibleRows.length))}
          </span>
          <span>از</span>
          <span dir="ltr" className="font-semibold text-[var(--c-fg)]">
            {toPersianDigits(String(rows.length))}
          </span>
          <span>ردیف بارگذاری‌شده</span>
        </div>
        <button
          type="button"
          onClick={() => setGroupByItem((v) => !v)}
          aria-pressed={groupByItem}
          aria-label="گروه‌بندی بر اساس کالا"
          className={cn(
            'inline-flex items-center gap-1.5 text-sm font-medium px-3 h-9 rounded-md border transition-colors',
            groupByItem
              ? 'bg-[var(--c-primary)] text-white border-[var(--c-primary)] shadow-[0_2px_6px_color-mix(in_srgb,var(--c-primary)_25%,transparent)]'
              : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-fg)] hover:bg-[var(--c-muted)]',
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          گروه‌بندی بر اساس کالا
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
            <Loader2 className="w-3.5 h-3.5 ml-1.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5 ml-1.5" />
          )}
          {exporting ? 'در حال ساخت…' : 'خروجی اکسل'}
        </Button>
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

      {/* Initial-load skeleton (empty rows + first-page fetching). */}
      {isLoading && rows.length === 0 ? (
        <LedgerSkeleton />
      ) : visibleRows.length === 0 ? (
        <EmptyLedger hasQuery={Boolean(normalizedQuery)} />
      ) : (
        <div className="mt-3">
          {groupByItem ? (
            <GroupedLedgerList
              rows={groupedRows ?? []}
              hallCache={hallCache}
              onRowClick={handleRowClick}
            />
          ) : (
            <FlatLedgerList
              rows={visibleRows}
              hallCache={hallCache}
              onRowClick={handleRowClick}
            />
          )}

          {/* Footer — running balance caption + load-more button. */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-[var(--c-card)] border border-[var(--c-border)] shadow-[var(--card-shadow)] px-4 py-3">
            <p className="text-xs text-[var(--c-muted-fg)]">
              {normalizedQuery
                ? `نمایش ${toPersianDigits(String(visibleRows.length))} ردیف منطبق با جستجو`
                : `نمایش ${toPersianDigits(String(rows.length))} تراکنش بارگذاری‌شده — صفحهٔ بعدی ۵۰ سطر دیگر`}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={loadNext}
              disabled={!hasMore || isLoading}
              title={hasMore ? 'بارگذاری ۵۰ تراکنش بعدی' : 'تمام تراکنش‌ها بارگذاری شد'}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 ml-1.5 animate-spin" />
                  در حال بارگذاری…
                </>
              ) : (
                <>
                  بارگذاری ۵۰ سطر بعدی
                  <ChevronLeft className="w-3.5 h-3.5 mr-1.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Drilldown. */}
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

interface ListProps {
  rows: ItemLedgerRow[];
  hallCache: Map<string, string>;
  onRowClick: (row: ItemLedgerRow) => void;
}

function FlatLedgerList({ rows, hallCache, onRowClick }: ListProps) {
  return (
    <div className="overflow-x-auto rounded-[14px] bg-[var(--c-card)] border border-[var(--c-border)] shadow-[var(--card-shadow)]">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-[var(--c-muted)] border-b-2 border-[var(--c-border)]">
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] w-12 sticky right-0 bg-[var(--c-muted)] z-10">#</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] whitespace-nowrap">تاریخ / ساعت</th>
            <th className="px-3 py-3 text-right font-semibold text-[var(--c-fg)]">کالا</th>
            <th className="px-3 py-3 text-right font-semibold text-[var(--c-fg)]">فارم</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)]">سالن</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)]">نوع</th>
            <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">ورودی</th>
            <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">خروجی</th>
            <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">قیمت واحد</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)]">مرجع</th>
            <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">موجودی لحظه‌ای</th>
            <th className="px-3 py-3 text-right font-semibold text-[var(--c-fg)]">یادداشت</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <FlatLedgerRow
              key={row.id}
              row={row}
              index={idx}
              hallCache={hallCache}
              onRowClick={onRowClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface FlatRowProps {
  row: ItemLedgerRow;
  index: number;
  hallCache: Map<string, string>;
  onRowClick: (row: ItemLedgerRow) => void;
}

function FlatLedgerRow({ row, index, hallCache, onRowClick }: FlatRowProps) {
  return (
    <tr
      className="border-b border-[var(--c-border)] cursor-pointer hover:bg-[var(--c-muted)]/60 transition-colors focus-within:bg-[var(--c-muted)]/70"
      onClick={() => onRowClick(row)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRowClick(row);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label="باز کردن گردش کالا"
    >
      <td className="px-3 py-2.5 text-center text-[var(--c-muted-fg)] sticky right-0 bg-[var(--c-card)] z-10 tabular-nums" dir="ltr">
        {toPersianDigits(index + 1)}
      </td>
      <td className="px-3 py-2.5 text-center">
        <span dir="ltr" className="tabular-nums text-[var(--c-fg)]">
          {toPersianDigits(gregorianToJalali(row.txn_date))}
        </span>
        {row.txn_ts && (
          <span className="block text-[10px] text-[var(--c-muted-fg)] tabular-nums" dir="ltr">
            {row.txn_ts.split('T')[1]?.slice(0, 5) ?? ''}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right text-[var(--c-fg)]">{row.item_name}</td>
      <td className="px-3 py-2.5 text-right text-[var(--c-fg)]">{row.farm_name ?? '—'}</td>
      <td className="px-3 py-2.5 text-center">
        <HallCell row={row} hallCache={hallCache} />
      </td>
      <td className="px-3 py-2.5 text-center">
        <TxnTypeBadge row={row} />
      </td>
      <td className="px-3 py-2.5 text-left tabular-nums font-bold text-green-700" dir="ltr">
        {row.qty_in > 0 ? `+${toPersianDigits(row.qty_in.toLocaleString('en-US'))}` : '—'}
      </td>
      <td className="px-3 py-2.5 text-left tabular-nums font-bold text-red-600" dir="ltr">
        {row.qty_out > 0 ? `-${toPersianDigits(row.qty_out.toLocaleString('en-US'))}` : '—'}
      </td>
      <td className="px-3 py-2.5 text-left text-[var(--c-fg)] tabular-nums" dir="ltr">
        {row.unit_price != null
          ? toPersianDigits(row.unit_price.toLocaleString('en-US'))
          : '—'}
      </td>
      <td className="px-3 py-2.5 text-center">
        {row.reference_no ? (
          <span
            className="font-mono text-xs text-[var(--c-fg)] bg-[var(--c-muted)]/50 px-1.5 py-0.5 rounded"
            title={row.reference_no}
          >
            {row.reference_no}
          </span>
        ) : (
          <span className="text-[var(--c-muted-fg)]">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-left font-semibold tabular-nums" dir="ltr">
        {toPersianDigits(row.running_balance.toLocaleString('en-US'))}
      </td>
      <td className="px-3 py-2.5 text-right text-xs text-[var(--c-muted-fg)] max-w-[240px]">
        {row.notes ? (
          <span title={row.notes} className="line-clamp-2 block">
            {row.notes}
          </span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}

interface GroupedProps {
  rows: Array<
    | { kind: 'group'; key: string; item_id: string; label: string }
    | { kind: 'row'; row: ItemLedgerRow }
  >;
  hallCache: Map<string, string>;
  onRowClick: (row: ItemLedgerRow) => void;
}

function GroupedLedgerList({ rows, hallCache, onRowClick }: GroupedProps) {
  return (
    <div className="space-y-3">
      {rows.map((entry, idx) =>
        entry.kind === 'group' ? (
          <div
            key={entry.key}
            className="rounded-[14px] bg-[var(--c-primary)]/8 border border-[var(--c-primary)]/30 px-4 py-2.5 flex items-center gap-3 shadow-[var(--card-shadow)]"
          >
            <Package className="w-4 h-4 text-[var(--c-primary)] shrink-0" />
            <p className="font-bold text-[var(--c-fg)] text-sm">{entry.label}</p>
            <span className="ms-auto text-xs text-[var(--c-muted-fg)]" dir="ltr">
              شمارهٔ گروه: {toPersianDigits(String(idx))}
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[14px] bg-[var(--c-card)] border border-[var(--c-border)] shadow-[var(--card-shadow)]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[var(--c-muted)] border-b-2 border-[var(--c-border)]">
                  <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] w-12">#</th>
                  <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] whitespace-nowrap">تاریخ / ساعت</th>
                  <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)]">سالن</th>
                  <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)]">نوع</th>
                  <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">ورودی</th>
                  <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">خروجی</th>
                  <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">قیمت واحد</th>
                  <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)]">مرجع</th>
                  <th className="px-3 py-3 text-left font-semibold text-[var(--c-fg)]">موجودی لحظه‌ای</th>
                </tr>
              </thead>
              <tbody>
                <FlatLedgerRow row={entry.row} index={idx} hallCache={hallCache} onRowClick={onRowClick} />
              </tbody>
            </table>
          </div>
        ),
      )}
    </div>
  );
}

function HallCell({ row, hallCache }: { row: ItemLedgerRow; hallCache: Map<string, string> }) {
  if (row.source_type !== 'daily_voucher_line' || !row.source_id) {
    return <span className="text-[var(--c-muted-fg)]">—</span>;
  }
  const halls = hallCache.get(row.source_id);
  if (halls === undefined) {
    return <span className="text-[var(--c-muted-fg)] animate-pulse">…</span>;
  }
  if (!halls) {
    return <span className="text-[var(--c-muted-fg)]">—</span>;
  }
  return <span className="text-xs text-[var(--c-fg)]" title={halls}>{halls}</span>;
}

function TxnTypeBadge({ row }: { row: ItemLedgerRow }) {
  const known = txnTypeKeys.includes(row.txn_type as TransactionType);
  if (!known) {
    return <Badge variant="secondary">{row.txn_type}</Badge>;
  }
  const colors = TXN_TYPE_COLORS[row.txn_type as TransactionType];
  const label = TXN_TYPE_LABELS[row.txn_type as TransactionType];
  return <Badge className={cn(colors.bg, colors.text)}>{label}</Badge>;
}

function LedgerSkeleton() {
  return (
    <div className="space-y-2 mt-3" aria-busy="true" aria-label="در حال بارگذاری تراکنش‌ها">
      {Array.from({ length: 8 }).map((_, i) => (
        <Sk key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

function EmptyLedger({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="text-center py-16 mt-3 rounded-[14px] border border-dashed border-[var(--c-border)] bg-[var(--c-card)]/40">
      <Inbox className="w-12 h-12 mx-auto mb-3 text-[var(--c-muted-fg)] opacity-60" />
      <p className="font-bold text-[var(--c-fg)] mb-1">
        {hasQuery ? 'نتیجه‌ای برای جستجوی فعلی یافت نشد' : 'هیچ تراکنشی برای فیلترهای فعلی وجود ندارد'}
      </p>
      <p className="text-sm text-[var(--c-muted-fg)] max-w-md mx-auto">
        {hasQuery
          ? 'جستجو فقط روی ردیف‌های بارگذاری‌شده اعمال می‌شود. برای یافتن موارد قدیمی‌تر، بارگذاری بعدی را بزنید.'
          : 'بازهٔ تاریخ یا فیلترها را تغییر دهید تا تراکنش‌ها نمایش داده شوند.'}
      </p>
    </div>
  );
}

export const InventoryLedgerSection = memo(InventoryLedgerSectionInner);
InventoryLedgerSection.displayName = 'InventoryLedgerSection';
