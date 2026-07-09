// =====================================================================
// RPT_SALES_TRANSFERS — outbound sale + inter-farm/inter-hall transfers.
// =====================================================================
// Calls reporting_sales_transfers_v3 with p_txn_type = NULL (all).
// Note (Pass-2 honest gap): the 'sale' txn_type DOES NOT EXIST in
// inventory_transactions today — the sales entry screen is a Phase-2
// product feature that hasn't landed. When the report returns 0 rows
// for a given date range, we surface this honestly with an in-table
// banner so the operator understands why no sale rows appear.
// =====================================================================

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ReportTable } from './ReportTable';
import { getReportColumnsFromBff } from './reportColumns';
import { useReportSection } from '@/hooks/useReportSection';
import { triggerServerExport } from '@/lib/excelServer';
import { cn } from '@/utils/cn';
import { toPersianDigits } from '@/utils/persianNumbers';
import { REPORT_EMPTY_MESSAGE } from '@/types/report.types';
import type { ColumnDef, SortState } from '@/types/report.types';

interface SalesTransfersSectionProps {
  date_from: string;
  date_to: string;
  farm_id: string | null;
  item_id: string | null;
  txn_type: string | null;
}

type TransferRow = {
  txn_id: string;
  txn_date: string;
  txn_type: 'sale' | 'transfer_in' | 'transfer_out' | string;
  source_farm: string | null;
  dest_farm: string | null;
  customer_name: string | null;
  item_id: string;
  item_name: string;
  item_unit: string;
  qty: number;
  unit_price: number | null;
  amount: number | null;
  reference_no: string | null;
};

const PAGE_SIZE = 15;
const TXN_TYPE_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  sale:          { label: 'فروش',       bg: 'bg-purple-100', text: 'text-purple-700' },
  transfer_in:   { label: 'انتقال ورودی', bg: 'bg-blue-100',   text: 'text-blue-700' },
  transfer_out:  { label: 'انتقال خروجی', bg: 'bg-amber-100', text: 'text-amber-700' },
};

function sortRows<T extends Record<string, unknown>>(rows: T[], sort: SortState | null): T[] {
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const av = a[sort.columnKey];
    const bv = b[sort.columnKey];
    const an = typeof av === 'number' ? av : Number(av);
    const bn = typeof bv === 'number' ? bv : Number(bv);
    if (Number.isFinite(an) && Number.isFinite(bn)) {
      return sort.direction === 'asc' ? an - bn : bn - an;
    }
    return String(av ?? '').localeCompare(String(bv ?? ''), 'fa');
  });
}

export function SalesTransfersSection({
  date_from,
  date_to,
  farm_id,
  item_id,
  txn_type,
}: SalesTransfersSectionProps) {
  const { rows, totalCount, isLoading, error, refetch } = useReportSection<TransferRow>(
    'reporting_sales_transfers_v3',
    {
      p_date_from: date_from,
      p_date_to: date_to,
      p_farm_id: farm_id,
      p_item_id: item_id,
      p_txn_type: txn_type,
    },
  );

  const baseColumns = useMemo<ColumnDef[]>(
    () => getReportColumnsFromBff('RPT_SALES_TRANSFERS'),
    [],
  );

  // Custom render() for txn_type (Persian-chip + color) + null-fallback
  // for source_farm + dest_farm + reference_no so the table doesn't
  // render the literal string "null".
  const columns = useMemo<ColumnDef[]>(() => {
    return baseColumns.map((c): ColumnDef => {
      if (c.key === 'txn_type') {
        return {
          ...c,
          render: (_row, raw) => {
            const t = String(raw ?? '');
            const tone = TXN_TYPE_BADGE[t] ?? { label: t, bg: 'bg-zinc-100', text: 'text-zinc-700' };
            return <Badge className={cn(tone.bg, tone.text)}>{tone.label}</Badge>;
          },
        };
      }
      if (c.key === 'source_farm' || c.key === 'dest_farm' || c.key === 'reference_no' || c.key === 'unit_price') {
        return {
          ...c,
          render: (_row, raw) => {
            if (raw === null || raw === undefined || raw === '') {
              return <span className="text-[var(--c-muted-fg)]">—</span>;
            }
            return undefined;
          },
        };
      }
      return c;
    });
  }, [baseColumns]);

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    columns.map((c) => c.key),
  );
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [date_from, date_to, farm_id, item_id, txn_type]);

  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, page]);

  const totals = useMemo(
    () => ({
      qty:    rows.reduce((acc, r) => acc + (r.qty ?? 0), 0),
      amount: rows.reduce((acc, r) => acc + (r.amount ?? 0), 0),
      sale_count: rows.filter((r) => r.txn_type === 'sale').length,
    }),
    [rows],
  );

  const onExportClick = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const tid = toast.loading('در حال ساخت فایل اکسل فروش و انتقالات…');
    try {
      await triggerServerExport('RPT_SALES_TRANSFERS', {
        date_from,
        date_to,
        farm_id,
        item_id,
        txn_type,
      });
      toast.success('فایل اکسل آماده شد', { id: tid });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطای ناشناخته', { id: tid });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-sm text-[var(--c-muted-fg)] flex-wrap">
          <span>
            {isLoading
              ? 'در حال دریافت…'
              : `${toPersianDigits(String(totalCount))} ردیف فروش/انتقال`}
          </span>
          {!isLoading && (
            <span className="font-mono">
              · جمع مقدار: {toPersianDigits(totals.qty.toLocaleString('en-US'))} ·{' '}
              جمع مبلغ: {toPersianDigits(totals.amount.toLocaleString('en-US'))} ریال
              {totals.sale_count === 0 && ' · (هیچ فروشی در بازهٔ انتخابی ثبت نشده است)'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={refetch} disabled={isLoading}>
            تازه‌سازی
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={onExportClick}
            disabled={isExporting || rows.length === 0}
            aria-busy={isExporting}
          >
            {isExporting ? <Loader2 className="w-4 h-4 ml-1.5 animate-spin" /> : <Download className="w-4 h-4 ml-1.5" />}
            {isExporting ? 'در حال ساخت…' : 'خروجی اکسل'}
          </Button>
        </div>
      </div>

      {/* Honesty banner — even when 0 rows come back from SQL, surface
          the Pass-2 known-gap: the 'sale' txn_type doesn't exist yet
          because the sales entry screen hasn't landed. The transfer_out
          / transfer_in halves of the spec are real and live-driven. */}
      {!isLoading && rows.length === 0 && (
        <div className={cn(
          'flex items-start gap-2 rounded-[14px] border border-dashed',
          'border-amber-300 bg-amber-50 p-4 text-sm text-amber-800',
        )}>
          <Info className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-bold">این گزارش در حال حاضر فقط انتقالات بین فارم‌ها را نمایش می‌دهد</p>
            <p className="text-xs leading-6">
              ردیف «فروش» به‌صورت مستقل در این نسخه فعال نیست — هنوز فرم ثبت فروش برای کاربران ادمین/سرپرست
              اضافه نشده است. ردیف‌های انتقال (ورودی/خروجی) تا پایان بازهٔ انتخابی بالا فعال هستند.
              به محض فعال‌شدن صفحهٔ ثبت فروش، این گزارش بدون تغییر schema کار خواهد کرد.
            </p>
          </div>
        </div>
      )}

      {error ? (
        <div className={cn('rounded-[14px] border border-dashed border-red-300 bg-red-50 p-6 text-center text-sm text-red-700')}>
          <p className="font-bold mb-2">خطا در دریافت گزارش فروش/انتقالات</p>
          <p className="text-xs">{error}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={refetch}>تلاش مجدد</Button>
        </div>
      ) : (
        <ReportTable
          columns={columns}
          rows={pageRows}
          rowIdKey="txn_id"
          visibleColumns={visibleColumns}
          onVisibleColumnsChange={setVisibleColumns}
          isLoading={isLoading}
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
          onPageChange={setPage}
          sort={sort}
          onSortChange={setSort}
          emptyMessage={REPORT_EMPTY_MESSAGE}
        />
      )}
    </div>
  );
}
