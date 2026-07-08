// =====================================================================
// ItemLedgerPanel
//
// Drilldown for RPT_INVENTORY_VALUATION_SUMMARY. Opens inside the
// left-anchored SidePanel and lists the ledger of ONE item.
//
// Date window:
//   date_from = as_of − 90d
//   date_to   = as_of
//
// Pagination is FORWARD-ONLY via useItemLedger (keyset cursor). We do
// not surface a previous-page button because the RPC keyset supports
// only forward traversal — a previous-page would need to re-query
// page 1 with a narrower window, which is out of scope for v0.1.
// =====================================================================

import { memo, useMemo } from 'react';
import { History, Package, ChevronLeft, Loader2 } from 'lucide-react';
import { SidePanel } from '@/components/ui/SidePanel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/utils/cn';
import { toPersianDigits } from '@/utils/persianNumbers';
import { gregorianToJalali } from '@/utils/jalaliDate';
import { useItemLedger, type ItemLedgerRow } from '@/hooks/useItemLedger';
import { TXN_TYPE_LABELS, TXN_TYPE_COLORS, type TransactionType } from '@/types/inventory.types';

interface ItemLedgerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Required for fetching — null disables the hook. */
  itemId: string | null;
  itemName: string | null;
  itemUnit: string | null;
  itemCategory: string | null;
  farmId: string | null;
  /** ISO yyyy-MM-dd — the as_of date the user pivoted on in the report. */
  asOf: string;
}

// Local helper — only valid TransactionType keys appear; safe to cast.
const txnTypeKeys = Object.keys(TXN_TYPE_LABELS) as TransactionType[];

function ItemLedgerPanelInner({
  isOpen,
  onClose,
  itemId,
  itemName,
  itemUnit,
  itemCategory,
  farmId,
  asOf,
}: ItemLedgerPanelProps) {
  // Compute the 90-day window once per (as_of) change. We keep inclusive
  // boundaries so "exactly 90 days ago" still appears in the list.
  const { dateFrom, dateTo } = useMemo(() => {
    if (!asOf) return { dateFrom: '', dateTo: '' };
    const end = new Date(`${asOf}T00:00:00Z`);
    const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { dateFrom: fmt(start), dateTo: fmt(end) };
  }, [asOf]);

  const { rows, isLoading, error, hasMore, loadNext } = useItemLedger({
    item_id: itemId,
    farm_id: farmId,
    date_from: dateFrom,
    date_to: dateTo,
    pageSize: 20,
  });

  const subtitle = [
    itemName ?? '—',
    itemUnit ? `(${itemUnit})` : null,
    itemCategory === 'feed'
      ? 'نهاده'
      : itemCategory === 'packaging'
      ? 'بسته‌بندی'
      : null,
    asOf ? `تا ${gregorianToJalali(asOf)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title="گردش کالا در ۹۰ روز اخیر"
      subtitle={subtitle}
      widthClass="max-w-[640px]"
    >
      <div className="space-y-3">
        {/* Header summary — on-hand end-of-window is the LAST row's running_balance. */}
        {rows.length > 0 ? (
          <div className="rounded-[10px] bg-[var(--c-muted)]/40 border border-[var(--c-border)] px-3 py-2.5 flex items-center gap-3">
            <Package className="w-4 h-4 text-[var(--c-primary)] shrink-0" />
            <p className="text-sm text-[var(--c-fg)]">
              <span className="text-[var(--c-muted-fg)]">موجودی در پایان بازه</span>{' '}
              <span className="font-bold tabular-nums" dir="ltr">
                {toPersianDigits(rows[rows.length - 1].running_balance.toLocaleString('en-US'))}
              </span>
              {itemUnit && (
                <span className="text-[var(--c-muted-fg)] ms-1">{itemUnit}</span>
              )}
            </p>
          </div>
        ) : null}

        {error && (
          <div className="rounded-[10px] border border-[var(--c-destructive)]/30 bg-[var(--c-destructive)]/10 px-3 py-2.5 text-sm text-[var(--c-destructive)]">
            {error}
          </div>
        )}

        {/* Skeleton during initial load (rows are empty AND not paginating) */}
        {isLoading && rows.length === 0 ? (
          <div className="space-y-2" aria-busy="true" aria-label="در حال بارگذاری تراکنش‌ها">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyLedger />
        ) : (
          <>
            <ul className="divide-y divide-[var(--c-border)] rounded-[10px] border border-[var(--c-border)] bg-[var(--c-card)] overflow-hidden">
              {rows.map((row) => (
                <li key={row.id}>
                  <LedgerRowView row={row} />
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-[var(--c-muted-fg)]">
                نمایش{' '}
                <span dir="ltr" className="font-semibold">
                  {toPersianDigits(String(rows.length))}
                </span>{' '}
                تراکنش
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={loadNext}
                disabled={!hasMore || isLoading}
                title={hasMore ? 'صفحهٔ بعد' : 'تراکنش دیگری وجود ندارد'}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 ml-1.5 animate-spin" />
                    در حال بارگذاری…
                  </>
                ) : (
                  <>
                    صفحهٔ بعدی
                    <ChevronLeft className="w-3.5 h-3.5 mr-1.5" />
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </SidePanel>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LedgerRowView({ row }: { row: ItemLedgerRow }) {
  const isKnownType = txnTypeKeys.includes(row.txn_type as TransactionType);
  const label = isKnownType
    ? TXN_TYPE_LABELS[row.txn_type as TransactionType]
    : row.txn_type;
  const colors = isKnownType ? TXN_TYPE_COLORS[row.txn_type as TransactionType] : null;

  return (
    <div className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-[var(--c-fg)] font-medium min-w-[88px]" dir="ltr">
        {toPersianDigits(gregorianToJalali(row.txn_date))}
      </span>
      {colors ? (
        <Badge className={cn(colors.bg, colors.text, 'shrink-0')}>{label}</Badge>
      ) : (
        <Badge variant="secondary" className="shrink-0">{label}</Badge>
      )}
      <span className="font-bold text-green-600 tabular-nums" dir="ltr">
        {row.qty_in > 0 ? `+${toPersianDigits(row.qty_in.toLocaleString('en-US'))}` : '—'}
      </span>
      <span className="font-bold text-red-500 tabular-nums" dir="ltr">
        {row.qty_out > 0 ? `-${toPersianDigits(row.qty_out.toLocaleString('en-US'))}` : '—'}
      </span>
      <span className="ms-auto text-[var(--c-muted-fg)] tabular-nums" dir="ltr">
        موجودی:{' '}
        <span className="text-[var(--c-fg)] font-semibold">
          {toPersianDigits(row.running_balance.toLocaleString('en-US'))}
        </span>
      </span>
      {row.notes && (
        <p className="basis-full text-xs text-[var(--c-muted-fg)] truncate" title={row.notes}>
          {row.notes}
        </p>
      )}
    </div>
  );
}

function EmptyLedger() {
  return (
    <div className="text-center py-10">
      <History className="w-12 h-12 mx-auto mb-3 text-[var(--c-muted-fg)] opacity-60" />
      <p className="font-bold text-[var(--c-fg)] mb-1">تراکنشی یافت نشد</p>
      <p className="text-sm text-[var(--c-muted-fg)]">
        در ۹۰ روز منتهی به تاریخ گزارش هیچ تراکنشی برای این کالا ثبت نشده است.
      </p>
    </div>
  );
}

export const ItemLedgerPanel = memo(ItemLedgerPanelInner);
ItemLedgerPanel.displayName = 'ItemLedgerPanel';
