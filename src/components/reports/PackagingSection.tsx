// =====================================================================
// RPT_PACKAGING — packaging-items consumption.
// =====================================================================
// Mirror shape of RPT_CONSUMPTION_REPORT but WITHOUT:
//   - the hall selector (packaging items do not track per-hall by
//     per the user mandate).
//   - the formula selector (no relationship with feed formulas).
// The category is hardcoded to 'packaging' — NOT a filter chip; the
// registry forces p_category='packaging' regardless of the caller's
// body. We surface this in the section header so the operator
// understands why the filter chips don't include "category".
// =====================================================================

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Package } from 'lucide-react';
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

interface PackagingSectionProps {
  date_from: string;
  date_to: string;
  farm_id: string | null;
}

type PackagingRow = {
  item_id: string;
  item_name: string;
  item_unit: string;
  consumed_qty: number;
  waste_qty: number;
  rial_value: number | null;
  closing_balance: number | null;
};

const PAGE_SIZE = 15;

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

export function PackagingSection({
  date_from,
  date_to,
  farm_id,
}: PackagingSectionProps) {
  const { rows, totalCount, isLoading, error, refetch } = useReportSection<PackagingRow>(
    'reporting_packaging_v3',
    {
      p_date_from: date_from,
      p_date_to: date_to,
      p_farm_id: farm_id,
      // category is HARDCODED by the BFF registry for this report —
      // packaging items only exist in the packaging category. We pass
      // it explicitly here for self-documentation; the BFF will
      // override regardless.
      p_category: 'packaging',
    },
  );

  const baseColumns = useMemo<ColumnDef[]>(
    () => getReportColumnsFromBff('RPT_PACKAGING'),
    [],
  );

  // Place '—' fallback for any null numeric (closing_balance + rial_value
  // are nullable when item is unpriced).
  const columns = useMemo<ColumnDef[]>(() => {
    return baseColumns.map((c): ColumnDef => {
      if (c.key === 'rial_value' || c.key === 'closing_balance') {
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
  }, [date_from, date_to, farm_id]);

  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, page]);

  const totals = useMemo(
    () => ({
      consumed_qty: rows.reduce((acc, r) => acc + (r.consumed_qty ?? 0), 0),
      waste_qty: rows.reduce((acc, r) => acc + (r.waste_qty ?? 0), 0),
      rial_value: rows.reduce((acc, r) => acc + (r.rial_value ?? 0), 0),
    }),
    [rows],
  );

  const onExportClick = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const tid = toast.loading('در حال ساخت فایل اکسل اقلام بسته‌بندی…');
    try {
      await triggerServerExport('RPT_PACKAGING', {
        date_from,
        date_to,
        farm_id,
      });
      toast.success('فایل اکسل اقلام بسته‌بندی آماده شد', { id: tid });
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
              : `${toPersianDigits(String(totalCount))} قلم بسته‌بندی در بازهٔ انتخابی`}
          </span>
          {!isLoading && (
            <span className="font-mono">
              · جمع مصرف: {toPersianDigits(totals.consumed_qty.toLocaleString('en-US'))} ·{' '}
              جمع ضایعات: {toPersianDigits(totals.waste_qty.toLocaleString('en-US'))} ·{' '}
              جمع ارزش ریالی: {toPersianDigits(totals.rial_value.toLocaleString('en-US'))} ریال
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

      <p className="text-xs text-[var(--c-muted-fg)] flex items-center gap-1.5">
        <Package className="w-3.5 h-3.5" />
        فقط اقلام دستهٔ «بسته‌بندی» نمایش داده می‌شوند — بدون فیلتر سالن (ردیابی در سطح فارم).
      </p>

      {error ? (
        <div className={cn('rounded-[14px] border border-dashed border-red-300 bg-red-50 p-6 text-center text-sm text-red-700')}>
          <p className="font-bold mb-2">خطا در دریافت گزارش اقلام بسته‌بندی</p>
          <p className="text-xs">{error}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={refetch}>تلاش مجدد</Button>
        </div>
      ) : (
        <ReportTable
          columns={columns}
          rows={pageRows}
          rowIdKey="item_id"
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
