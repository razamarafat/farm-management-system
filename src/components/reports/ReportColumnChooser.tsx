// =====================================================================
// ReportColumnChooser — popover with checkbox list for column toggle.
//
// Trigger button shows "ستون‌ها (n/total)" badge so the user always
// knows how many columns are visible. Popover is sticky-search +
// scrollable checkbox list. All-on / Reset-link are obvious affordances.
//
// The visible-order is preserved by the parent (we send back the
// ordered key array). This component itself only flips visibility;
// ordering is implicit in the parent's column array, so toggling
// 'off' a column just removes it from the visible list.
// =====================================================================

import { memo, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Settings2, Check, Search } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { ColumnDef } from '@/types/report.types';

interface ReportColumnChooserProps {
  columns: ColumnDef[];
  visibleColumns: string[];
  onChange: (next: string[]) => void;
  className?: string;
}

function ReportColumnChooserInner({ columns, visibleColumns, onChange, className }: ReportColumnChooserProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleSet = useMemo(() => new Set(visibleColumns), [visibleColumns]);

  const toggle = useCallback(
    (key: string) => {
      const next = new Set(visibleSet);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // Preserve column declaration order in the returned array.
      const ordered = columns.map((c) => c.key).filter((k) => next.has(k));
      onChange(ordered);
    },
    [visibleSet, columns, onChange],
  );

  const showAll = useCallback(() => {
    onChange(columns.map((c) => c.key));
  }, [columns, onChange]);

  // Close on Escape / click-outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return columns;
    return columns.filter((c) => c.header.toLowerCase().includes(q));
  }, [columns, search]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'h-10 px-3 rounded-md border bg-[var(--c-bg)] text-[var(--c-fg)]',
          'flex items-center gap-2 text-sm transition-colors',
          'border-[var(--c-border)] hover:bg-[var(--c-muted)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--c-primary)] focus:ring-offset-2',
          open && 'ring-2 ring-[var(--c-primary)]',
        )}
      >
        <Settings2 className="w-4 h-4 text-[var(--c-muted-fg)]" />
        <span className="text-[var(--c-fg)] font-medium">ستون‌ها</span>
        <span className="text-xs text-[var(--c-muted-fg)]">
          {visibleColumns.length}/{columns.length}
        </span>
      </button>

      {open && (
        <div className="absolute end-0 mt-1 w-64 z-50 bg-[var(--c-card)] border border-[var(--c-border)] rounded-md shadow-[var(--modal-shadow)] overflow-hidden">
          <div className="p-2 border-b border-[var(--c-border)]">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-muted-fg)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجوی ستون‌ها..."
                className="w-full pr-8 pl-2 py-1.5 text-sm rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--c-primary)]"
              />
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-sm text-[var(--c-muted-fg)]">ستونی یافت نشد</div>
            ) : (
              filtered.map((col) => {
                const isVisible = visibleSet.has(col.key);
                return (
                  <label
                    key={col.key}
                    className={cn(
                      'w-full px-3 py-2 flex items-center justify-between gap-2 cursor-pointer text-sm',
                      'hover:bg-[var(--c-muted)] transition-colors',
                    )}
                  >
                    <span className={cn('text-right', isVisible && 'font-semibold text-[var(--c-fg)]')}>
                      {col.header}
                    </span>
                    <span
                      role="checkbox"
                      tabIndex={0}
                      aria-checked={isVisible}
                      onClick={(e) => {
                        e.preventDefault();
                        toggle(col.key);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          toggle(col.key);
                        }
                      }}
                      className={cn(
                        'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                        isVisible
                          ? 'bg-[var(--c-primary)] border-[var(--c-primary)] text-white'
                          : 'border-[var(--c-border)] text-transparent',
                      )}
                    >
                      <Check className="w-3 h-3" />
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <div className="px-3 py-2 border-t border-[var(--c-border)] flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={showAll}
              className="text-[var(--c-primary)] font-medium hover:underline"
            >
              همهٔ ستون‌ها
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[var(--c-muted-fg)] hover:text-[var(--c-fg)]"
            >
              بستن
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const ReportColumnChooser = memo(ReportColumnChooserInner);
ReportColumnChooser.displayName = 'ReportColumnChooser';
