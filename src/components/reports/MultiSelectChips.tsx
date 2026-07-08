// =====================================================================
// MultiSelectChips — generic multi-select with toggle-pill chips.
//
// Pattern:
//   1. Trigger button shows the count + chevron-down.
//   2. Selected values render as inline pills with X buttons.
//   3. The trigger opens a popover with a search input + checkable list.
//   4. Click outside / Escape closes.
//
// Persisted state and the actual data-fetching of options both live
// in the parent component. This component is purely presentational.
// =====================================================================

import { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, ChevronDown, X, Check } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { ListOption } from '@/types/report.types';

interface MultiSelectChipsProps {
  values: string[];
  onChange: (next: string[]) => void;
  options: ListOption[];
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  /** Right-aligned (RTL default) or full-width below pills. */
  variant?: 'inline' | 'block';
}

const EMPTY: ListOption[] = [];

function MultiSelectChipsInner({
  values,
  onChange,
  options,
  placeholder = 'انتخاب...',
  emptyText = 'موردی یافت نشد',
  searchPlaceholder = 'جستجو...',
  disabled,
  className,
  variant = 'block',
}: MultiSelectChipsProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use the same EMPTY constant in deps so we don't churn on parent re-renders.
  const safeOptions = useMemo(() => options ?? EMPTY, [options]);

  const selectedSet = useMemo(() => new Set(values), [values]);
  const selectedPills = useMemo(
    () => safeOptions.filter((o) => selectedSet.has(o.value)),
    [safeOptions, selectedSet],
  );

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return safeOptions;
    return safeOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [safeOptions, search]);

  const toggleValue = useCallback(
    (v: string) => {
      if (disabled) return;
      const set = new Set(values);
      if (set.has(v)) set.delete(v);
      else set.add(v);
      onChange(Array.from(set));
    },
    [values, onChange, disabled],
  );

  const removePill = useCallback(
    (v: string) => {
      if (disabled) return;
      onChange(values.filter((x) => x !== v));
    },
    [values, onChange, disabled],
  );

  const handleOpen = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [disabled]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSearch('');
  }, []);

  // Escape / click-outside to close popover.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) handleClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, handleClose]);

  return (
    <div
      ref={containerRef}
      className={cn('relative', variant === 'block' ? 'w-full' : '', className)}
    >
      {/* Pills row (rendered even when closed, so user sees current selection) */}
      {selectedPills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedPills.map((pill) => (
            <span
              key={pill.value}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--c-primary)]/15 text-[var(--c-primary)] text-xs font-medium border border-[var(--c-primary)]/30"
            >
              <span className="max-w-[160px] truncate">{pill.label}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePill(pill.value);
                  }}
                  className="w-4 h-4 rounded-full hover:bg-[var(--c-primary)]/25 flex items-center justify-center transition-colors"
                  aria-label={`حذف ${pill.label}`}
                >
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={open ? handleClose : handleOpen}
        disabled={disabled}
        className={cn(
          'w-full h-10 px-3 rounded-md border bg-[var(--c-bg)] text-[var(--c-fg)]',
          'flex items-center justify-between gap-2 text-sm transition-colors',
          'border-[var(--c-border)] focus:outline-none focus:ring-2 focus:ring-[var(--c-primary)] focus:ring-offset-2',
          disabled && 'opacity-50 cursor-not-allowed',
          open && 'ring-2 ring-[var(--c-primary)]',
        )}
      >
        <span className="text-[var(--c-muted-fg)] truncate">
          {values.length > 0
            ? `${values.length} مورد انتخاب شد`
            : placeholder}
        </span>
        <ChevronDown
          className={cn('w-4 h-4 transition-transform text-[var(--c-muted-fg)]', open && 'rotate-180')}
        />
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[var(--c-card)] border border-[var(--c-border)] rounded-md shadow-[var(--modal-shadow)] overflow-hidden">
          <div className="p-2 border-b border-[var(--c-border)]">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-muted-fg)]" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pr-8 pl-2 py-1.5 text-sm rounded border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--c-primary)]"
              />
            </div>
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-sm text-[var(--c-muted-fg)]">{emptyText}</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedSet.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleValue(opt.value)}
                    disabled={opt.disabled}
                    className={cn(
                      'w-full px-3 py-2 text-right text-sm hover:bg-[var(--c-muted)]',
                      'flex items-center justify-between gap-2 transition-colors',
                      opt.disabled && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <span className={cn(isSelected && 'font-semibold text-[var(--c-primary)]')}>
                      {opt.label}
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-[var(--c-primary)] shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
          {values.length > 0 && (
            <div className="px-3 py-2 border-t border-[var(--c-border)] flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[var(--c-muted-fg)] hover:text-[var(--c-destructive)] transition-colors"
              >
                پاک کردن همه
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="text-[var(--c-primary)] font-medium hover:underline"
              >
                تأیید
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const MultiSelectChips = memo(MultiSelectChipsInner);
MultiSelectChips.displayName = 'MultiSelectChips';
