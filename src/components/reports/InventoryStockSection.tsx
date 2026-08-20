// =====================================================================
// RPT_INVENTORY_STOCK — current on-hand balance + value + dead-stock flag.
//
// Calls reporting_inventory_stock (SECURITY INVOKER, RLS-scoped,
// SECURITY INVOKER conversion in 015_advisor_fixes.sql) and renders
// the rows in <ReportTable>.
// =====================================================================
// Drilldown: each row carries farm_id + item_id. Clicking a row
// navigates to the existing /:role/inventory/:itemId route
// (InventoryItemHistoryPage.tsx). We compute the role basePath from
// useAuthStore so admin/supervisor/operator each land on their own
// scoped list page when they hit "مشاهده".
// =====================================================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { ReportTable } from './ReportTable';
import { getReportColumnsFromBff } from './reportColumns';
import { useReportSection } from '@/hooks/useReportSection';
import { useAuthStore } from '@/store/authStore';
import { triggerServerExport } from '@/lib/excelServer';
import { cn } from '@/utils/cn';
import { toPersianDigits } from '@/utils/persianNumbers';
import { rpcError } from '@/utils/rpcError';
import { REPORT_EMPTY_MESSAGE } from '@/types/report.types';
import type { ColumnDef, SortState } from '@/types/report.types';
import { supabase } from '@/lib/supabase';

interface InventoryStockSectionProps {
  asOf: string;
  farm_id: string | null;
  category: string | null;
  deadStockOnly: boolean;
  item_ids?: string[];
}

type StockRow = {
  farm_id: string;
  farm_name: string;
  item_id: string;
  item_name: string;
  item_category: string;
  item_unit: string;
  on_hand_qty: number;
  unit_cost: number | null;
  value_rial: number | null;
  last_movement_date: string | null;
  days_since_last_movement: number | null;
  age_bucket: string | null;
  is_dead_stock: boolean;
  as_of_date: string;
  reorder_point?: number;
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

function getStockColor(onHand: number, reorderPoint: number): string {
  if (reorderPoint <= 0) {
    return 'text-[var(--c-fg)]';
  }
  if (onHand >= reorderPoint) {
    return 'text-[var(--c-success)] font-semibold';
  }
  if (onHand <= 0) {
    return 'text-[var(--c-error)] font-bold';
  }
  const ratio = onHand / reorderPoint;
  if (ratio <= 0.1) {
    return 'text-[var(--c-error)] font-bold animate-pulse';
  }
  if (ratio <= 0.5) {
    return 'text-[var(--c-error)] font-semibold';
  }
  return 'text-[var(--c-warning)] font-medium';
}

export function InventoryStockSection({
  asOf,
  farm_id,
  category,
  deadStockOnly,
  item_ids,
}: InventoryStockSectionProps) {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role ?? 'operator';
  const basePath = role === 'admin' ? '/admin' : role === 'supervisor' ? '/supervisor' : '/operator';

  const { rows, isLoading, error, refetch } = useReportSection<StockRow>(
    'reporting_inventory_stock',
    {
      p_as_of: asOf,
      p_farm_id: farm_id,
      p_category: category,
      p_dead_stock_only: deadStockOnly,
    },
    !!farm_id,
  );

  const baseColumns = useMemo<ColumnDef[]>(() => getReportColumnsFromBff('RPT_INVENTORY_STOCK'), []);

  const columns = useMemo<ColumnDef[]>(() => {
    return baseColumns.map((c): ColumnDef => {
      if (c.key === 'on_hand_qty') {
        return {
          ...c,
          render: (row, raw) => {
            const qty = typeof raw === 'number' ? raw : Number(raw);
            const rPoint = Number((row as unknown as StockRow).reorder_point ?? 0);
            const colorClass = getStockColor(qty, rPoint);
            const display = Number.isFinite(qty) ? qty.toLocaleString('en-US') : String(raw ?? '');
            return (
              <span dir="ltr" className={cn("tabular-nums font-medium", colorClass)}>
                {toPersianDigits(display)}
              </span>
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
  const [reorderPoints, setReorderPoints] = useState<Record<string, number>>({});

  useEffect(() => {
    setPage(1);
  }, [asOf, farm_id, category, deadStockOnly, item_ids]);

  useEffect(() => {
    if (!farm_id) {
      setReorderPoints({});
      return;
    }
    let cancelled = false;
    async function loadReorderPoints() {
      try {
        const { data, error: rpErr } = await supabase
          .from('farm_items')
          .select('id, reorder_point')
          .eq('farm_id', farm_id as string)
          .eq('is_active', true);
        if (rpErr) throw rpErr;
        if (!cancelled && data) {
          const map: Record<string, number> = {};
          data.forEach((item) => {
            map[item.id] = Number(item.reorder_point ?? 0);
          });
          setReorderPoints(map);
        }
      } catch (err) {
        console.error('Error fetching reorder points:', err);
      }
    }
    loadReorderPoints();
    return () => {
      cancelled = true;
    };
  }, [farm_id]);

  const mergedRows = useMemo(() => {
    let list = rows.map((row) => ({
      ...row,
      reorder_point: reorderPoints[row.item_id] ?? 0,
    }));

    if (item_ids && item_ids.length > 0) {
      const selectedSet = new Set(item_ids);
      list = list.filter((row) => selectedSet.has(row.item_id));
    }

    return list;
  }, [rows, reorderPoints, item_ids]);

  const sortedRows = useMemo(() => sortRows(mergedRows, sort), [mergedRows, sort]);
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, page]);

  const onRowClick = (row: Record<string, unknown>) => {
    const itemId = String(row.item_id ?? '');
    if (!itemId) return;
    navigate(`${basePath}/inventory/${itemId}`);
  };

  const onExportClick = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const tid = toast.loading('در حال ساخت فایل اکسل موجودی انبار…');
    try {
      await triggerServerExport('RPT_INVENTORY_STOCK', {
        asOf,
        farm_id,
        category,
        deadStockOnly,
        item_ids,
      });
      toast.success('فایل اکسل موجودی انبار آماده شد', { id: tid });
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
            disabled={isExporting || mergedRows.length === 0}
            aria-busy={isExporting}
          >
            {isExporting ? <Loader2 className="w-4 h-4 ml-1.5 animate-spin" /> : <Download className="w-4 h-4 ml-1.5" />}
            {isExporting ? 'در حال ساخت…' : 'خروجی اکسل'}
          </Button>
        </div>
      </div>

      {error ? (
        <div className={cn('rounded-[14px] border border-dashed border-[color-mix(in_srgb,var(--c-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--c-destructive)_10%,transparent)] p-6 text-center text-sm text-[var(--c-error)]')}>
          <p className="font-bold mb-2">خطا در دریافت گزارش موجودی انبار</p>
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
          totalCount={mergedRows.length}
          onPageChange={setPage}
          sort={sort}
          onSortChange={setSort}
          onRowClick={onRowClick}
          emptyMessage={REPORT_EMPTY_MESSAGE}
        />
      )}
    </div>
  );
}
