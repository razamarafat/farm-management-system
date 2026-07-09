// =====================================================================
// RPT_PURCHASES — list of purchase-side inventory_transactions.
//
// Props arrive from ReportBody's dispatcher. The section owns:
//   - data fetch (useReportSection → reporting_purchases_v3)
//   - column visibility / sort / page + an inline totals row.
//   - Excel export via triggerServerExport → /api/export/RPT_PURCHASES.
//   - empty-state, error-state, loading-state UI.
//
// The section DOES NOT just render <UnderDevelopment/> — it is the
// real Pass-2 implementation. The structure mirrors
// useInventoryTransactions/usePaginatedTransactions so future Pass 3
// polish (URL-driven sort/persist, virtualized list) lands cleanly.
// =====================================================================

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { ReportTable } from './ReportTable';
import { getReportColumnsFromBff } from './reportColumns';
import { useReportSection } from '@/hooks/useReportSection';
import { triggerServerExport } from '@/lib/excelServer';
import { cn } from '@/utils/cn';
import { toPersianDigits } from '@/utils/persianNumbers';
import { REPORT_EMPTY_MESSAGE } from '@/types/report.types';
import type { ColumnDef, SortState } from '@/types/report.types';

interface PurchasesSectionProps {
  date_from: string;
  date_to: string;
  farm_id: string | null;
  supplier_id: string | null;
  item_id: string | null;
}

type PurchaseRow = {
  txn_id: string;
  txn_date: string;
  supplier_id: string | null;
  supplier_name: string | null;
  item_id: string;
  item_name: string;
  item_unit: string;
  qty: number;
  unit_price: number | null;
  total_amount: number | null;
  reference_no: string | null;
};

const PAGE_SIZE = 15;

// ---- helpers ----------------------------------------------------------
function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  sort: SortState | null,
): T[] {
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const av = a[sort.columnKey];
    const bv = b[sort.columnKey];
    const an = typeof av === 'number' ? av : Number(av);
    const bn = typeof bv === 'number' ? bv : Number(bv);
    const aValid = Number.isFinite(an);
    const bValid = Number.isFinite(bn);
    if (aValid && bValid) return sort.direction === 'asc' ? an - bn : bn - an;
    return String(av ?? '').localeCompare(String(bv ?? ''), 'fa');
  });
}

function sumColumn(rows: PurchaseRow[], key: keyof PurchaseRow): number {
  return rows.reduce(
    (acc, r) => acc + (typeof r[key] === 'number' ? (r[key] as number) : 0),
    0,
  );
}

export function PurchasesSection({
  date_from,
  date_to,
  farm_id,
  supplier_id,
  item_id,
}: PurchasesSectionProps) {
  const { rows, totalCount, isLoading, error, refetch } = useReportSection<PurchaseRow>(
    'reporting_purchases_v3',
    {
      p_date_from: date_from,
      p_date_to: date_to,
      p_farm_id: farm_id,
      p_supplier_id: supplier_id,
      p_item_id: item_id,
    },
  );

  const columns = useMemo<ColumnDef[]>(
    () => getReportColumnsFromBff('RPT_PURCHASES'),
    [],
  );

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    columns.map((c) => c.key),
  );
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [date_from, date_to, farm_id, supplier_id, item_id]);

  // Client-side pagination + sort across the FULL result of the
  // current RPC call. The v3 RPC returns the unfiltered set; the SPA
  // owns paging so we don't need server-side limit/offset for the
  // first cut. Future Pass 3: move paging into the SQL RPC if a
  // farm produces >5k purchase rows per 30-day window.
  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, page]);

  // Totals footer — sums qty + total_amount across the full row set
  // (not the current page slice) so the operator sees the unfiltered
  // window total. Matches the BFF registry's totalsColumns hints.
  const totals = useMemo(
    () => ({
      qty: sumColumn(rows, 'qty'),
      total_amount: sumColumn(rows, 'total_amount'),
    }),
    [rows],
  );

  const onExportClick = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const tid = toast.loading('در حال ساخت فایل اکسل خریدها…');
    try {
      await triggerServerExport('RPT_PURCHASES', {
        date_from,
        date_to,
        farm_id,
        supplier_id,
        item_id,
      });
      toast.success('فایل اکسل خریدها آماده شد', { id: tid });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'خطای ناشناخته در ساخت فایل',
        { id: tid },
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-sm text-[var(--c-muted-fg)]">
          <span>
            {isLoading
              ? 'در حال دریافت…'
              : `${toPersianDigits(String(totalCount))} خرید در بازهٔ انتخابی`}
          </span>
          {!isLoading && rows.length > 0 && (
            <span className="font-mono">
              · جمع مقدار: {toPersianDigits(String(totals.qty))} · جمع مبلغ:{' '}
              {toPersianDigits(totals.total_amount.toLocaleString('en-US'))} ریال
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={refetch}
            disabled={isLoading}
            title="بارگذاری مجدد"
          >
            تازه‌سازی
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={onExportClick}
            disabled={isExporting || rows.length === 0}
            aria-busy={isExporting}
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 ml-1.5 animate-spin" />
            ) : (
              <Download className="w-4 h-4 ml-1.5" />
            )}
            {isExporting ? 'در حال ساخت…' : 'خروجی اکسل'}
          </Button>
        </div>
      </div>

      {error ? (
        <div
          className={cn(
            'rounded-[14px] border border-dashed border-red-300 bg-red-50',
            'p-6 text-center text-sm text-red-700',
          )}
        >
          <p className="font-bold mb-2">خطا در دریافت گزارش خریدها</p>
          <p className="text-xs">{error}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={refetch}
          >
            تلاش مجدد
          </Button>
        </div>
      ) : (          <ReportTable
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
