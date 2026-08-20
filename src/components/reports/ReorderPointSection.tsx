// =====================================================================
// RPT_REORDER_POINT — on-hand × ABC class × reorder recommendation.
//
// Calls reporting_reorder_point_v3 (server-side inline ABC via
// window functions over a 90-day moving window; the SPA passes
// `p_basis=quantity|value` based on the operator's categoryBasis filter
// chip).
//
// UI shape:
//   - One row per (farm, item, basis).
//   - abc_class rendered as a colored chip (A=red, B=amber, C=neutral).
//   - reorder_recommended rendered as a Yes/No badge (red when TRUE).
//   - Footer count "X اقلام نیازمند سفارش" — non-numeric summary; the
//     spec calls out that the SQL contract deliberately returns
//     totalsColumns=[] for this report so the SPA owns the badge counts.
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

interface ReorderPointSectionProps {
  farm_id: string | null;
  abcClass: 'A' | 'B' | 'C' | null;
  reorderNeededOnly: boolean;
  basis: 'value' | 'quantity';
}

type ReorderRow = {
  item_id: string;
  item_name: string;
  farm_id: string;
  farm_name: string | null;
  item_unit: string;
  item_category: string;
  on_hand_qty: number;
  reorder_point: number;
  avg_daily_consumption: number | null;
  abc_class: 'A' | 'B' | 'C' | null;
  reorder_recommended: boolean;
  basis: string;
  period_from: string | null;
  period_to: string | null;
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
    // Priortize A-class when sorting by abc_class regardless of direction
    if (sort.columnKey === 'abc_class') {
      const rank = { A: 0, B: 1, C: 2 } as const;
      const aRank = av ? rank[av as 'A' | 'B' | 'C'] ?? 99 : 99;
      const bRank = bv ? rank[bv as 'A' | 'B' | 'C'] ?? 99 : 99;
      return sort.direction === 'asc' ? aRank - bRank : bRank - aRank;
    }
    // reorder_recommended: TRUE-first on desc / FALSE-first on asc.
    if (sort.columnKey === 'reorder_recommended') {
      return sort.direction === 'asc'
        ? Number(av) - Number(bv)
        : Number(bv) - Number(av);
    }
    const an = typeof av === 'number' ? av : Number(av);
    const bn = typeof bv === 'number' ? bv : Number(bv);
    if (Number.isFinite(an) && Number.isFinite(bn)) {
      return sort.direction === 'asc' ? an - bn : bn - an;
    }
    return String(av ?? '').localeCompare(String(bv ?? ''), 'fa');
  });
}

const ABC_BADGE: Record<'A' | 'B' | 'C', { label: string; bg: string; text: string }> = {
  A: { label: 'A', bg: 'bg-[color-mix(in_srgb,var(--c-destructive)_16%,transparent)]', text: 'text-[var(--c-error)]' },
  B: { label: 'B', bg: 'bg-[color-mix(in_srgb,var(--c-warning)_16%,transparent)]',  text: 'text-[var(--c-warning)]' },
  C: { label: 'C', bg: 'bg-[var(--c-muted)]',   text: 'text-[var(--c-muted-fg)]' },
};

export function ReorderPointSection({
  farm_id,
  abcClass,
  reorderNeededOnly,
  basis,
}: ReorderPointSectionProps) {
  const { rows, totalCount, isLoading, error, refetch } = useReportSection<ReorderRow>(
    'reporting_reorder_point_v3',
    {
      p_farm_id: farm_id,
      p_basis: basis,
      p_abc_class: abcClass,
      p_reorder_needed_only: reorderNeededOnly,
    },
    !!farm_id,
  );

  const baseColumns = useMemo<ColumnDef[]>(
    () => getReportColumnsFromBff('RPT_REORDER_POINT'),
    [],
  );

  // Inject custom render() on abc_class + reorder_recommended so the
  // table shows chips/badges instead of raw text.
  const columns = useMemo<ColumnDef[]>(() => {
    return baseColumns.map((c): ColumnDef => {
      if (c.key === 'abc_class') {
        return {
          ...c,
          render: (_row, raw) => {
            const cls = raw as 'A' | 'B' | 'C' | null;
            if (!cls) return <span className="text-[var(--c-muted-fg)]">—</span>;
            const tone = ABC_BADGE[cls];
            return (
              <Badge className={cn('inline-flex w-7 h-7 items-center justify-center rounded-full font-bold', tone.bg, tone.text)}>
                {tone.label}
              </Badge>
            );
          },
        };
      }
      if (c.key === 'reorder_recommended') {
        return {
          ...c,
          render: (_row, raw) => {
            const rec = raw === true;
            return rec ? (
              <Badge className="bg-[color-mix(in_srgb,var(--c-destructive)_16%,transparent)] text-[var(--c-error)]">نیازمند سفارش</Badge>
            ) : (
              <Badge className="bg-[color-mix(in_srgb,var(--c-success)_16%,transparent)] text-[var(--c-success)]">کافی</Badge>
            );
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
  }, [farm_id, abcClass, reorderNeededOnly, basis]);

  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, page]);

  const onExportClick = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const tid = toast.loading('در حال ساخت فایل اکسل نقطه سفارش…');
    try {
      await triggerServerExport('RPT_REORDER_POINT', {
        farm_id,
        basis,
        abcClass,
        reorderNeededOnly,
      });
      toast.success('فایل اکسل نقطه سفارش آماده شد', { id: tid });
    } catch (e) {
      toast.error(
        rpcError(e) ?? 'خطای ناشناخته در ساخت فایل',
        { id: tid },
      );
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
          <Button
            size="sm"
            variant="ghost"
            onClick={refetch}
            disabled={isLoading}
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
            'rounded-[14px] border border-dashed border-[color-mix(in_srgb,var(--c-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--c-destructive)_10%,transparent)]',
            'p-6 text-center text-sm text-[var(--c-error)]',
          )}
        >
          <p className="font-bold mb-2">خطا در دریافت گزارش نقطه سفارش</p>
          <p className="text-xs">{error}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={refetch}>
            تلاش مجدد
          </Button>
        </div>
      ) : (          <ReportTable
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
