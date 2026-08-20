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
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ReportTable } from './ReportTable';
import { getReportColumnsFromBff } from './reportColumns';
import { useReportSection } from '@/hooks/useReportSection';
import { triggerServerExport } from '@/lib/excelServer';
import { cn } from '@/utils/cn';
import { REPORT_EMPTY_MESSAGE } from '@/types/report.types';
import type { ColumnDef, SortState } from '@/types/report.types';
import { rpcError } from '@/utils/rpcError';

interface SalesTransfersSectionProps {
  date_from: string;
  date_to: string;
  farm_id: string | null;
  item_ids: string[];
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
  sale:          { label: 'فروش',       bg: 'bg-[color-mix(in_srgb,var(--c-accent)_16%,transparent)]', text: 'text-[var(--c-accent)]' },
  transfer_in:   { label: 'انتقال ورودی', bg: 'bg-[color-mix(in_srgb,var(--c-info)_16%,transparent)]',   text: 'text-[var(--c-info)]' },
  transfer_out:  { label: 'انتقال خروجی', bg: 'bg-[color-mix(in_srgb,var(--c-warning)_16%,transparent)]', text: 'text-[var(--c-warning)]' },
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
  item_ids,
  txn_type,
}: SalesTransfersSectionProps) {
  const { rows: rawRows, isLoading, error, refetch } = useReportSection<TransferRow>(
    'reporting_sales_transfers_v3',
    {
      p_date_from: date_from,
      p_date_to: date_to,
      p_farm_id: farm_id,
      p_item_id: null,
      p_txn_type: txn_type,
    },
    !!farm_id,
  );

  const rows = useMemo(() => {
    if (!item_ids || item_ids.length === 0) return rawRows;
    return rawRows.filter((r) => item_ids.includes(r.item_id));
  }, [rawRows, item_ids]);

  const totalCount = rows.length;

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
            const tone = TXN_TYPE_BADGE[t] ?? { label: t, bg: 'bg-[var(--c-muted)]', text: 'text-[var(--c-muted-fg)]' };
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
  }, [date_from, date_to, farm_id, item_ids, txn_type]);

  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, page]);

  const onExportClick = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const tid = toast.loading('در حال ساخت فایل اکسل فروش و انتقالات…');
    try {
      await triggerServerExport('RPT_SALES_TRANSFERS', {
        date_from,
        date_to,
        farm_id,
        item_id: item_ids[0] ?? null,
        txn_type,
      });
      toast.success('فایل اکسل آماده شد', { id: tid });
    } catch (e) {
      toast.error(rpcError(e) ?? 'خطای ناشناخته', { id: tid });
    } finally {
      setIsExporting(false);
    }
  };

  if (!farm_id) {
    return (
      <div className="rounded-[14px] border border-dashed border-[var(--c-border)] bg-[var(--c-card)]/40 p-12 text-center text-sm text-[var(--c-muted-fg)]">
        <p className="font-medium text-[var(--c-fg)]">لطفاً ابتدا یک فارم انتخاب کنید</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-sm text-[var(--c-muted-fg)] flex-wrap">
          {isLoading && <span>در حال دریافت…</span>}
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

      {error ? (
        <div className={cn('rounded-[14px] border border-dashed border-[color-mix(in_srgb,var(--c-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--c-destructive)_10%,transparent)] p-6 text-center text-sm text-[var(--c-error)]')}>
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
