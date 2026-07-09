// =====================================================================
// ReportTable — generic, presentational, sortable, paginated table.
//
// Owner-of-state inside this component:
//   - none (all paging + sort + visibility come from the parent via props).
//
// Memoization:
//   - The row component is wrapped in React.memo and keyed by row[rowIdKey].
//   - Cells are NOT individually memoized: per-row memoization is enough
//     and avoids overhead for typical report widths (≤ 12 columns).
//
// RTL convention (matches DailySheetTable.tsx):
//   - The row-number column is sticky on the RIGHT edge of the table.
//   - LTR-aligned numeric values use `dir="ltr"` so the digits display
//     in English-then-Persian (consistent with the rest of the SPA).
// =====================================================================

import { memo, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { ReportColumnChooser } from './ReportColumnChooser';
import { cn } from '@/utils/cn';
import { toPersianDigits } from '@/utils/persianNumbers';
import { REPORT_EMPTY_MESSAGE } from '@/types/report.types';
import type { ColumnDef, SortState } from '@/types/report.types';

interface ReportTableProps<T extends Record<string, unknown> = Record<string, unknown>> {
  // Columns themselves don't need to know T — each ColumnDef.render
  // matches T at the call site. Widening to ColumnDef[] avoids the
  // generic-invariance issue when callers compose a generic column
  // array typed with a more specific T.
  columns: ColumnDef[];
  rows: T[];
  /** If omitted, all columns are visible. Order here is the user's preferred order. */
  visibleColumns?: string[];
  /**
   * Optional callback fired when the user toggles a column's visibility.
   * Currently a no-op forwarder — the actual column-visibility dropdown
   * UX is planned for Pass 3. The prop is already wired from all 6 v3
   * section files (Purchases / ReorderPoint / InventoryStock /
   * ConsumptionReport / SalesTransfers / Packaging) so when the UX
   * lands, no caller has to change.
   * (Pass 2 follow-through on 015_advisor_fixes.sql +
   * 014_reporting_v3_enhancements.sql.)
   */
  onVisibleColumnsChange?: (visibleColumns: string[]) => void;
  /** Defaults to 'id'. Used as the React key for memoized row components. */
  rowIdKey?: keyof T | string;
  isLoading?: boolean;
  page: number; // 1-indexed
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  sort: SortState | null;
  onSortChange: (sort: SortState | null) => void;
  emptyMessage?: string;
  className?: string;
  /**
   * Optional row-click handler. When provided, every data row becomes
   * clickable (cursor: pointer, keyboard-activatable with Enter / Space).
   * The parent (e.g. a report body) decides what to do with the row
   * — typically opens a drilldown side-panel.
   *
   * Typed as Record<string, unknown> so the value passes the cast that
   * memo(ReportTableInner) `as typeof ReportTableInner` applies at the
   * export. The row's actual type at the call site is still T; we just
   * don't propagate T into the prop's signature here.
   */
  onRowClick?: (row: Record<string, unknown>) => void;
}

const SKELETON_ROWS = 8;
const SKELETON_COLS = 6;

// Generic on the column's row type so it accepts `ColumnDef<T>` from the
// typed reportRow component without variance friction.
function defaultRender<R>(col: ColumnDef<R>, raw: unknown): React.ReactNode {
  if (raw === null || raw === undefined || raw === '') {
    return <span className="text-[var(--c-muted-fg)]">—</span>;
  }
  if (col.numeric) {
    // Display as Persian digits (numerals + thousands separator converted)
    // in left-to-right direction so values line up. We coerce to Number
    // first so PostgREST string-numerics still get the thousands grouping.
    const n = typeof raw === 'number' ? raw : Number(raw);
    const display = Number.isFinite(n) ? n.toLocaleString('en-US') : String(raw ?? '');
    return (
      <span dir="ltr" className="font-medium tabular-nums">
        {toPersianDigits(display)}
      </span>
    );
  }
  return String(raw);
}

// Memoized row component. Re-renders only when its own row or visibleCols change.
interface RowProps<T> {
  row: T;
  columns: ColumnDef<T>[];
  index: number;
  onRowClick?: (row: Record<string, unknown>) => void;
}
function reportRow<T extends Record<string, unknown>>({ row, columns, index, onRowClick }: RowProps<T>) {
  const clickable = typeof onRowClick === 'function';
  const handleClick = () => {
    if (onRowClick) onRowClick(row as Record<string, unknown>);
  };
  return (
    <tr
      className={cn(
        'border-b border-[var(--c-border)] transition-colors',
        clickable
          ? 'cursor-pointer hover:bg-[var(--c-muted)]/60 focus-within:bg-[var(--c-muted)]/70'
          : 'hover:bg-[var(--c-muted)]/50',
      )}
      onClick={clickable ? handleClick : undefined}
      tabIndex={clickable ? 0 : -1}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      role={clickable ? 'button' : undefined}
      aria-label={clickable ? 'باز کردن جزئیات کالا' : undefined}
    >
      <td className="px-3 py-2.5 text-center text-sm text-[var(--c-muted-fg)] sticky right-0 bg-[var(--c-card)] z-10">
        {toPersianDigits(index + 1)}
      </td>
      {columns.map((col) => {
        const raw = (row as Record<string, unknown>)[col.key];
        const node = col.render ? col.render(row, raw) : defaultRender(col, raw);
        const align =
          col.align ?? (col.numeric ? 'left' : 'right');
        return (
          <td
            key={col.key}
            className={cn(
              'px-3 py-2.5 text-sm',
              align === 'left' && 'text-left',
              align === 'center' && 'text-center',
              align === 'right' && 'text-right',
              col.numeric && 'tabular-nums',
            )}
          >
            {node}
          </td>
        );
      })}
    </tr>
  );
}

const MemoizedRow = memo(
  reportRow,
  (prev, next) => prev.row === next.row && prev.columns === next.columns && prev.index === next.index,
);

function ReportTableInner<T extends Record<string, unknown>>({
  columns,
  rows,
  visibleColumns,
  rowIdKey = 'id',
  isLoading,
  page,
  pageSize,
  totalCount,
  onPageChange,
  sort,
  onSortChange,
  onVisibleColumnsChange,
  emptyMessage,
  className,
  onRowClick,
}: ReportTableProps<T>) {
  // Filter columns the parent wants shown, preserving visible column order.
  const activeColumns = useMemo<ColumnDef[]>(() => {
    if (!visibleColumns) return columns;
    const byKey = new Map(columns.map((c) => [c.key, c]));
    return visibleColumns
      .map((k) => byKey.get(k))
      .filter((c): c is ColumnDef => Boolean(c));
  }, [columns, visibleColumns]);

  const chooserVisibleColumns = visibleColumns ?? columns.map((c) => c.key);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const firstIdx = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastIdx = Math.min(totalCount, page * pageSize);

  const handleSortClick = (col: ColumnDef) => {
    if (col.sortable === false) return;
    if (!sort || sort.columnKey !== col.key) {
      onSortChange({ columnKey: col.key, direction: col.defaultSort ?? 'asc' });
      return;
    }
    if (sort.direction === 'asc') {
      onSortChange({ columnKey: col.key, direction: 'desc' });
      return;
    }
    // Clicking the same column in desc clears the sort.
    onSortChange(null);
  };

  return (
    <div
      className={cn(
        'rounded-[14px] bg-[var(--c-card)] border border-[var(--c-border)] shadow-[var(--card-shadow)] overflow-hidden',
        className,
      )}
    >
      {onVisibleColumnsChange && columns.length > 0 && (
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-b border-[var(--c-border)] bg-[var(--c-card)]">
          <ReportColumnChooser
            columns={columns}
            visibleColumns={chooserVisibleColumns}
            onChange={onVisibleColumnsChange}
          />
        </div>
      )}

      <div className="overflow-x-auto max-w-full">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-[var(--c-muted)] border-b-2 border-[var(--c-border)]">
              <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] w-12 sticky right-0 bg-[var(--c-muted)] z-10">
                #
              </th>
              {activeColumns.map((col) => {
                const isSorted = sort?.columnKey === col.key;
                const sortable = col.sortable !== false;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    onClick={() => handleSortClick(col)}
                    className={cn(
                      'px-3 py-3 font-semibold text-[var(--c-fg)] select-none whitespace-nowrap',
                      col.align === 'left' && 'text-left',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right',
                      sortable && 'cursor-pointer hover:bg-[var(--c-border)]/60 transition-colors',
                      col.className,
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {isSorted &&
                        (sort?.direction === 'asc' ? (
                          <ChevronUp className="w-3.5 h-3.5 text-[var(--c-primary)]" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-[var(--c-primary)]" />
                        ))}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: SKELETON_ROWS }).map((_, rowIdx) => (
                <tr key={`sk-${rowIdx}`} className="border-b border-[var(--c-border)]">
                  <td className="px-3 py-2.5 sticky right-0 bg-[var(--c-card)] z-10">
                    <Skeleton className="h-4 w-8 mx-auto" />
                  </td>
                  {Array.from({ length: Math.min(activeColumns.length, SKELETON_COLS) }).map(
                    (_, colIdx) => (
                      <td key={`sk-${rowIdx}-${colIdx}`} className="px-3 py-2.5">
                        <Skeleton className="h-4 w-full max-w-[160px]" />
                      </td>
                    ),
                  )}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={activeColumns.length + 1}
                  className="px-6 py-12 text-center text-sm text-[var(--c-muted-fg)]"
                >
                  <Inbox className="w-10 h-10 mx-auto mb-3 text-[var(--c-muted-fg)] opacity-60" />
                  <p>{emptyMessage ?? REPORT_EMPTY_MESSAGE}</p>
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const id = (row as Record<string, unknown>)[rowIdKey as string];
                const key = id !== undefined && id !== null ? String(id) : `r-${idx}`;
                return (
                  <MemoizedRow
                    key={key}
                    row={row}
                    columns={activeColumns}
                    index={(page - 1) * pageSize + idx}
                    onRowClick={onRowClick}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--c-border)] bg-[var(--c-card)]">
          <p className="text-xs text-[var(--c-muted-fg)]">
            نمایش{' '}
            <span className="font-semibold text-[var(--c-fg)]" dir="ltr">
              {toPersianDigits(String(firstIdx))}
            </span>{' '}
            تا{' '}
            <span className="font-semibold text-[var(--c-fg)]" dir="ltr">
              {toPersianDigits(String(lastIdx))}
            </span>{' '}
            از{' '}
            <span className="font-semibold text-[var(--c-fg)]" dir="ltr">
              {toPersianDigits(String(totalCount))}
            </span>{' '}
            نتیجه
          </p>
          <div className="flex items-center gap-1">
            <PagBtn
              disabled={page === 1}
              onClick={() => onPageChange(page - 1)}
              ariaLabel="صفحه قبلی"
            >
              <ChevronRight className="w-4 h-4" />
            </PagBtn>
            {pageNumbers(totalPages, page).map((p, i) =>
              p === '…' ? (
                <span key={`dots-${i}`} className="px-1 text-[var(--c-muted-fg)]">
                  …
                </span>
              ) : (
                <PagBtn
                  key={p}
                  active={p === page}
                  onClick={() => onPageChange(p)}
                  ariaLabel={`صفحه ${p}`}
                >
                  {toPersianDigits(String(p))}
                </PagBtn>
              ),
            )}
            <PagBtn
              disabled={page === totalPages}
              onClick={() => onPageChange(page + 1)}
              ariaLabel="صفحه بعدی"
            >
              <ChevronLeft className="w-4 h-4" />
            </PagBtn>
          </div>
        </div>
      )}
    </div>
  );
}

interface PagBtnProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  ariaLabel: string;
}
function PagBtn({ children, onClick, disabled, active, ariaLabel }: PagBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'min-w-[32px] h-8 px-2 rounded-md text-sm font-medium border transition-colors',
        'flex items-center justify-center',
        active
          ? 'bg-[var(--c-primary)] text-white border-[var(--c-primary)] shadow-[0_2px_6px_color-mix(in_srgb,var(--c-primary)_25%,transparent)]'
          : 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-fg)] hover:bg-[var(--c-muted)]',
        disabled && 'opacity-40 cursor-not-allowed hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}

// Returns the array of page numbers to show — collapses long ranges with '…'.
function pageNumbers(totalPages: number, current: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const result: (number | '…')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) result.push('…');
  for (let i = start; i <= end; i++) result.push(i);
  if (end < totalPages - 1) result.push('…');
  result.push(totalPages);
  return result;
}

// Export with a generic-friendly wrapper so callers can preserve their T type.
export const ReportTable = memo(ReportTableInner) as typeof ReportTableInner;
