// =====================================================================
// RPT_CONSUMPTION_REPORT — consumption by item/hall/formula in date range.
// =====================================================================
// Calls reporting_consumption_report_v3 (Pass 2 SQL cutover). The
// per-item grouping default mirrors the upstream registry.mjs. hallIds
// + formulaIds are forwarded as `p_hall_ids` / `p_formula_ids` (uuid[])
// SQL ANY arrays; the React side already collects individual
// selections in debouncedFilters. We treat empty arrays as "no filter"
// (i.e. the SQL sees an empty array and applies no constraint).
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
import { REPORT_EMPTY_MESSAGE } from '@/types/report.types';
import type { ColumnDef, SortState } from '@/types/report.types';
import { rpcError } from '@/utils/rpcError';

interface ConsumptionReportSectionProps {
  date_from: string;
  date_to: string;
  farm_id: string | null;
  category: string | null;
  hallIds: string[];
  formulaIds: string[];
  group_by: 'day' | 'item' | 'hall' | 'formula';
}

type ConsumptionRow = {
  group_key: string;
  group_label: string;
  item_category: string;
  hall_name: string | null;
  formula_name: string | null;
  consumed_qty: number;
  waste_qty: number;
  unit_price: number | null;
  rial_value: number | null;
  closing_balance: number | null;
  voucher_count: number;
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

export function ConsumptionReportSection({
  date_from,
  date_to,
  farm_id,
  category,
  hallIds,
  formulaIds,
  group_by,
}: ConsumptionReportSectionProps) {
  const hallKey = hallIds.join('|');
  const formulaKey = formulaIds.join('|');

  const { rows, totalCount, isLoading, error, refetch } = useReportSection<ConsumptionRow>(
    'reporting_consumption_report_v3',
    {
      p_date_from: date_from,
      p_date_to: date_to,
      p_farm_id: farm_id,
      p_category: category,
      p_group_by: group_by,
      // uuid[] — empty array = no filter, ANY-array = subset filter.
      p_hall_ids: hallIds ?? [],
      p_formula_ids: formulaIds ?? [],
    },
    !!farm_id,
  );

  const baseColumns = useMemo<ColumnDef[]>(
    () => getReportColumnsFromBff('RPT_CONSUMPTION_REPORT'),
    [],
  );

  // Place '—' fallback for null hall_name / formula_name columns so the
  // table doesn't show the literal "null" string.
  const columns = useMemo<ColumnDef[]>(() => {
    return baseColumns.map((c): ColumnDef => {
      if (c.key === 'hall_name' || c.key === 'formula_name' || c.key === 'unit_price') {
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
  }, [date_from, date_to, farm_id, category, hallKey, formulaKey, group_by]);

  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, page]);

  const onExportClick = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const tid = toast.loading('در حال ساخت فایل اکسل گزارش مصرف…');
    try {
      await triggerServerExport('RPT_CONSUMPTION_REPORT', {
        date_from,
        date_to,
        farm_id,
        category,
        group_by,
        hallIds,
        formulaIds,
      });
      toast.success('فایل اکسل گزارش مصرف آماده شد', { id: tid });
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
          <p className="font-bold mb-2">خطا در دریافت گزارش مصرف</p>
          <p className="text-xs">{error}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={refetch}>تلاش مجدد</Button>
        </div>
      ) : (
        <ReportTable
          columns={columns}
          rows={pageRows}
          rowIdKey="group_key"
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
