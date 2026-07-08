// =====================================================================
// ReportShell — composes the framework chrome around any report.
//
// It is purely presentational. The parent (ReportsHomePage) owns:
//   - filters / page / sort / visibleColumns state
//   - data fetching / pagination / sorting logic
//   - row mapping & per-row persistence
//
// The shell provides the affordances:
//   ┌── FilterBar ─────────────────────────────┐
//   │  Date preset + multi-selects + reset    │
//   └─────────────────────────────────────────┘
//   ┌── Toolbar ───────────────────────────────┐
//   │  ستون‌ها chooser · نماهای ذخیره‌شده      │
//   │  ذخیرهٔ نمای فعلی · خروجی اکسل          │
//   └─────────────────────────────────────────┘
//   ┌── ReportTable ───────────────────────────┐
//   │  sticky header · sort · pagination      │
//   │  empty / skeleton states                 │
//   └─────────────────────────────────────────┘
// =====================================================================

import { memo, useState } from 'react';
import { Bookmark, Download, FileText, Loader2 } from 'lucide-react';
import { ReportFilterBar } from './ReportFilterBar';
import { ReportTable } from './ReportTable';
import { ReportColumnChooser } from './ReportColumnChooser';
import { ReportSavedViews } from './ReportSavedViews';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/utils/cn';
import { toPersianDigits } from '@/utils/persianNumbers';
import type {
  ColumnDef,
  ReportFiltersState,
  SortState,
  SavedReportView,
  ReportCatalogEntry,
  ListOption,
} from '@/types/report.types';

interface ReportShellProps<T extends Record<string, unknown> = Record<string, unknown>> {
  report: ReportCatalogEntry;
  // Columns themselves don't need to know T — each ColumnDef.render
  // matches T at the call site.
  columns: ColumnDef[];
  rows: T[];
  totalCount: number;
  isLoading?: boolean;

  filters: ReportFiltersState;
  onFiltersChange: (next: ReportFiltersState) => void;
  onFiltersReset: () => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  sort: SortState | null;
  onSortChange: (sort: SortState | null) => void;
  visibleColumns: string[];
  onVisibleColumnsChange: (next: string[]) => void;

  farmOptions: ListOption[];
  hallOptions: ListOption[];
  itemOptions: ListOption[];
  supplierOptions: ListOption[];
  categoryOptions?: ListOption[];

  savedViews: SavedReportView[];
  onSaveCurrentAs: (name: string) => void;
  onLoadView: (view: SavedReportView) => void;
  onDeleteView: (viewId: string) => void;
  onRenameView: (viewId: string, name: string) => void;

  /** Optional row-click handler — forwarded to <ReportTable>. */
  onRowClick?: (row: Record<string, unknown>) => void;

  /** Optional transaction-type multi-select options (rendered in FilterBar). */
  txnTypeOptions?: ListOption[];

  /** Optional server-side Excel export action for reports using the generic shell. */
  onExportClick?: () => void | Promise<void>;
  isExporting?: boolean;

  className?: string;
}

export const PAGE_SIZE_DEFAULT = 15;

function ReportShellInner<T extends Record<string, unknown>>({
  report,
  columns,
  rows,
  totalCount,
  isLoading,
  filters,
  onFiltersChange,
  onFiltersReset,
  page,
  pageSize = PAGE_SIZE_DEFAULT,
  onPageChange,
  sort,
  onSortChange,
  visibleColumns,
  onVisibleColumnsChange,
  farmOptions,
  hallOptions,
  itemOptions,
  supplierOptions,
  categoryOptions,
  txnTypeOptions,
  savedViews,
  onSaveCurrentAs,
  onLoadView,
  onDeleteView,
  onRenameView,
  onRowClick,
  onExportClick,
  isExporting = false,
  className,
}: ReportShellProps<T>) {
  const [savedViewsOpen, setSavedViewsOpen] = useState(false);

  const noColumns = columns.length === 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className={cn('space-y-4', className)}>
      {/* Report header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-[var(--c-primary)]" />
            <h2 className="text-xl font-bold text-[var(--c-fg)]">{report.title}</h2>
          </div>
          <p className="text-sm text-[var(--c-muted-fg)] flex items-center gap-1.5" dir="ltr">
            <span>{report.subtitle}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono truncate inline-block max-w-[180px]" title={report.id}>
              {report.id}
            </span>
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <ReportFilterBar
        filters={filters}
        onChange={onFiltersChange}
        onReset={onFiltersReset}
        farmOptions={farmOptions}
        hallOptions={hallOptions}
        itemOptions={itemOptions}
        supplierOptions={supplierOptions}
        categoryOptions={categoryOptions}
        txnTypeOptions={txnTypeOptions}
      />

      {/* Toolbar: column chooser + saved views + export */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSavedViewsOpen(true)}
          >
            <Bookmark className="w-4 h-4 ml-1.5" />
            نماهای ذخیره‌شده
            {savedViews.length > 0 && (
              <span className="ms-2 text-xs font-mono text-[var(--c-muted-fg)]" dir="ltr">
                {toPersianDigits(String(savedViews.length))}
              </span>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSavedViewsOpen(true)}
          >
            <Bookmark className="w-4 h-4 ml-1.5" />
            ذخیرهٔ نمای فعلی
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {columns.length > 0 && (
            <ReportColumnChooser
              columns={columns}
              visibleColumns={visibleColumns}
              onChange={onVisibleColumnsChange}
            />
          )}
          <Button
            size="sm"
            variant="primary"
            onClick={onExportClick}
            disabled={!onExportClick || isExporting || noColumns}
            title={
              onExportClick
                ? isExporting
                  ? 'در حال ساخت فایل…'
                  : 'خروجی اکسل'
                : 'خروجی اکسل برای این گزارش فعال نیست'
            }
            aria-label="خروجی اکسل"
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

      {/* Table OR placeholder for stub reports */}
      {noColumns ? (
        <div
          className={cn(
            'rounded-[14px] border border-dashed border-[var(--c-border)] bg-[var(--c-card)]/40 p-12 text-center',
          )}
        >
          <FileText className="w-12 h-12 mx-auto mb-3 text-[var(--c-muted-fg)] opacity-60" />
          <p className="font-bold text-[var(--c-fg)] mb-2">ستون‌های این گزارش هنوز تعریف نشده‌اند</p>
          <p className="text-sm text-[var(--c-muted-fg)] max-w-md mx-auto">
            این گزارش در فاز بعدی پیاده‌سازی می‌شود. فیلترها و نماهای ذخیره‌شده برای همین گزارش در دسترس هستند.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-40" />
          </div>
        </div>
      ) : (
        <ReportTable
          columns={columns}
          rows={rows}
          visibleColumns={visibleColumns}
          isLoading={isLoading}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={onPageChange}
          sort={sort}
          onSortChange={onSortChange}
          onRowClick={onRowClick}
        />
      )}

      {/* Page footer summary when stub or empty */}
      {noColumns && totalPages === 1 && (
        <p className="text-xs text-center text-[var(--c-muted-fg)]">
          صفحهٔ ۱ از ۱
        </p>
      )}

      <ReportSavedViews
        isOpen={savedViewsOpen}
        onClose={() => setSavedViewsOpen(false)}
        views={savedViews}
        onLoad={onLoadView}
        onDelete={onDeleteView}
        onRename={onRenameView}
        onSaveAs={(name) => {
          onSaveCurrentAs(name);
          setSavedViewsOpen(false);
        }}
        reportTitle={report.title}
      />
    </div>
  );
}

// Memoize so the shell only re-renders when its explicit props change.
// Tip: keep the parent memo-friendly (pass references from useState freely).
export const ReportShell = memo(ReportShellInner) as typeof ReportShellInner;
