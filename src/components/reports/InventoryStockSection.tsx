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
import { Download, Loader2, History, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ReportTable } from './ReportTable';
import { getReportColumnsFromBff } from './reportColumns';
import { useReportSection } from '@/hooks/useReportSection';
import { useAuthStore } from '@/store/authStore';
import { triggerServerExport } from '@/lib/excelServer';
import { cn } from '@/utils/cn';
import { toPersianDigits } from '@/utils/persianNumbers';
import { REPORT_EMPTY_MESSAGE } from '@/types/report.types';
import type { ColumnDef, SortState } from '@/types/report.types';

interface InventoryStockSectionProps {
  asOf: string;
  farm_id: string | null;
  category: string | null;
  deadStockOnly: boolean;
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

export function InventoryStockSection({
  asOf,
  farm_id,
  category,
  deadStockOnly,
}: InventoryStockSectionProps) {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role ?? 'operator';
  const basePath = role === 'admin' ? '/admin' : role === 'supervisor' ? '/supervisor' : '/operator';

  const { rows, totalCount, isLoading, error, refetch } = useReportSection<StockRow>(
    'reporting_inventory_stock',
    {
      p_as_of: asOf,
      p_farm_id: farm_id,
      p_category: category,
      p_dead_stock_only: deadStockOnly,
    },
  );

  const baseColumns = useMemo<ColumnDef[]>(() => getReportColumnsFromBff('RPT_INVENTORY_STOCK'), []);

  // Custom render() on days_since_last_movement + is_dead_stock so the
  // operator can scan dead stock at a glance.
  const columns = useMemo<ColumnDef[]>(() => {
    return baseColumns.map((c): ColumnDef => {
      if (c.key === 'is_dead_stock') {
        return {
          ...c,
          render: (_row, raw) => {
            const isDead = raw === true;
            return isDead ? (
              <Badge className="bg-red-100 text-red-700">راکد</Badge>
            ) : (
              <span className="text-[var(--c-muted-fg)]">عادی</span>
            );
          },
        };
      }
      if (c.key === 'days_since_last_movement') {
        return {
          ...c,
          render: (_row, raw) => {
            const days = typeof raw === 'number' ? raw : Number(raw);
            if (!Number.isFinite(days)) return <span className="text-[var(--c-muted-fg)]">—</span>;
            const isOld = days >= 60;
            const display = toPersianDigits(String(days));
            return isOld ? (
              <span className="font-semibold text-red-600 tabular-nums">{display}</span>
            ) : (
              <span className="tabular-nums">{display}</span>
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
  }, [asOf, farm_id, category, deadStockOnly]);

  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, page]);

  const totals = useMemo(
    () => ({
      on_hand_qty: rows.reduce((acc, r) => acc + (r.on_hand_qty ?? 0), 0),
      value_rial: rows.reduce((acc, r) => acc + (r.value_rial ?? 0), 0),
      dead_stock_count: rows.filter((r) => r.is_dead_stock).length,
    }),
    [rows],
  );

  const onRowClick = (row: Record<string, unknown>) => {
    const itemId = String(row.item_id ?? '');
    if (!itemId) return;
    // Admin/supervisor/operator all land on the per-item movement history.
    // InventoryItemHistoryPage uses only the URL :itemId param; farm
    // scoping is implicit via RLS (the user's JWT scopes the query).
    // Followed code-reviewer-minimax-m3 follow-up: dropped the
    // `?farm=${farmId}` suffix — InventoryItemHistoryPage doesn't read
    // it; URL stays clean.
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
      });
      toast.success('فایل اکسل موجودی انبار آماده شد', { id: tid });
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
              : `${toPersianDigits(String(totalCount))} قلم در تاریخ ${toPersianDigits(asOf)}`}
          </span>
          {!isLoading && (
            <span className="font-mono inline-flex items-center gap-3">
              <span>· جمع موجودی: {toPersianDigits(String(totals.on_hand_qty))}</span>
              <span>· جمع ارزش: {toPersianDigits(totals.value_rial.toLocaleString('en-US'))} ریال</span>
              {totals.dead_stock_count > 0 && (
                <span className="inline-flex items-center gap-1 text-red-600">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  اقلام راکد: {toPersianDigits(String(totals.dead_stock_count))}
                </span>
              )}
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
        <History className="w-3.5 h-3.5" />
        کلیک روی هر ردیف، گردش ۹۰ روز اخیر همان کالا را باز می‌کند.
      </p>

      {error ? (
        <div className={cn('rounded-[14px] border border-dashed border-red-300 bg-red-50 p-6 text-center text-sm text-red-700')}>
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
          totalCount={totalCount}
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
