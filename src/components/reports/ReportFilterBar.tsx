// =====================================================================
// ReportFilterBar — generic filter panel for the Reports framework.
//
// Composes:
//   - Date range preset (Today / This Week / This Month / Custom)
//     When 'custom' is selected, two JalaliDatePickers surface for
//     p_date_from / p_date_to (Persian → Gregorian via existing util).
//   - Multi-select for farms / halls / items / suppliers.
//   - Optional categories (free-text chip list — 'feed' / 'packaging' /
//     any other label the report declares).
//
// The bar is purely presentational + collection of inputs. State lives
// in the parent (ReportShell). No mutation here means future reports
// can swap data sources without touching this bar.
// =====================================================================

import { memo } from 'react';
import { Filter, RotateCcw, Calendar } from 'lucide-react';
import { MultiSelectChips } from './MultiSelectChips';
import { JalaliDatePicker } from '@/components/ui/JalaliDatePicker';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { cn } from '@/utils/cn';
import { toPersianDigits } from '@/utils/persianNumbers';
import { getJalaliToday, jalaliToGregorian } from '@/utils/jalaliDate';
import type {
  ReportFiltersState,
  DateRangePreset,
  ListOption,
} from '@/types/report.types';
import { defaultReportFilters } from '@/types/report.types';

interface ReportFilterBarProps {
  filters: ReportFiltersState;
  onChange: (next: ReportFiltersState) => void;
  onReset?: () => void;
  farmOptions: ListOption[];
  hallOptions: ListOption[];
  itemOptions: ListOption[];
  supplierOptions: ListOption[];
  categoryOptions?: ListOption[];
  /** Optional txn-type multi-select. Rendered only when provided. */
  txnTypeOptions?: ListOption[];
  /** Optional formula multi-select. Rendered only when provided. */
  formulaOptions?: ListOption[];
  /** Optional consumption grouping select. */
  groupByOptions?: ListOption[];
  /** Optional ABC class select. */
  abcClassOptions?: ListOption[];
  /** Optional ABC basis select. */
  basisOptions?: ListOption[];
  /** Optional boolean toggle backed by filters.reorderNeededOnly. */
  booleanFilterLabel?: string;
  showDateFilter?: boolean;
  className?: string;
}

const presetLabel: Record<DateRangePreset, string> = {
  today: 'امروز',
  this_week: 'هفته جاری',
  this_month: 'ماه جاری',
  custom: 'دلخواه',
};

function buildGregorianRange(
  preset: DateRangePreset,
  customFrom: string | undefined,
  customTo: string | undefined,
): { from?: string; to?: string } {
  if (preset !== 'custom') return {};
  return {
    from: customFrom ? jalaliToGregorian(customFrom) : undefined,
    to: customTo ? jalaliToGregorian(customTo) : undefined,
  };
}

function ReportFilterBarInner({
  filters,
  onChange,
  onReset,
  farmOptions,
  hallOptions,
  itemOptions,
  supplierOptions,
  categoryOptions,
  txnTypeOptions,
  formulaOptions,
  groupByOptions,
  abcClassOptions,
  basisOptions,
  booleanFilterLabel,
  showDateFilter = true,
  className,
}: ReportFilterBarProps) {
  const { from, to } = buildGregorianRange(filters.datePreset, filters.dateFrom, filters.dateTo);
  const summary = `${presetLabel[filters.datePreset]}${
    filters.datePreset === 'custom' && (from || to)
      ? ` — ${toPersianDigits(from ?? '—')} تا ${toPersianDigits(to ?? '—')}`
      : ''
  }`;

  return (
    <div
      className={cn(
        'rounded-[14px] bg-[var(--c-card)] border border-[var(--c-border)] shadow-[var(--card-shadow)] p-4 sm:p-5',
        className,
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[var(--c-primary)]" />
          <span className="text-sm font-bold text-[var(--c-fg)]">فیلترها</span>
          <span className="text-xs text-[var(--c-muted-fg)] ms-2">{summary}</span>
        </div>
        {onReset && (
          <Button size="sm" variant="ghost" onClick={onReset}>
            <RotateCcw className="w-4 h-4 ml-1.5" />
            بازنشانی
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* Date preset */}
        {showDateFilter && (
          <div>
            <Select
              label="بازه زمانی"
              value={filters.datePreset}
              onChange={(e) =>
                onChange({ ...filters, datePreset: e.target.value as DateRangePreset })
              }
            >
              <option value="today">امروز</option>
              <option value="this_week">هفته جاری</option>
              <option value="this_month">ماه جاری</option>
              <option value="custom">دلخواه</option>
            </Select>
          </div>
        )}

        {/* Custom date pickers */}
        {showDateFilter && filters.datePreset === 'custom' && (
          <>
            <div>
              <label className="text-sm font-medium text-[var(--c-fg)] mb-1.5 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[var(--c-muted-fg)]" />
                از تاریخ
              </label>
              <JalaliDatePicker
                value={filters.dateFrom ?? ''}
                onChange={(v) => onChange({ ...filters, dateFrom: v })}
                placeholder="از تاریخ"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--c-fg)] mb-1.5 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[var(--c-muted-fg)]" />
                تا تاریخ
              </label>
              <JalaliDatePicker
                value={filters.dateTo ?? ''}
                onChange={(v) => onChange({ ...filters, dateTo: v })}
                placeholder="تا تاریخ"
              />
            </div>
          </>
        )}

        {/* Today helper */}
        {showDateFilter && filters.datePreset === 'custom' && (
          <div className="flex items-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                onChange({
                  ...filters,
                  dateFrom: getJalaliToday(),
                  dateTo: getJalaliToday(),
                })
              }
            >
              امروز
            </Button>
          </div>
        )}

        {groupByOptions && groupByOptions.length > 0 && (
          <div>
            <Select
              label="گروه‌بندی"
              value={filters.groupBy ?? 'item'}
              onChange={(e) =>
                onChange({
                  ...filters,
                  groupBy: e.target.value as ReportFiltersState['groupBy'],
                })
              }
            >
              {groupByOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Multi-selects */}
        {farmOptions.length > 0 && (
          <div>
            <label className="text-sm font-medium text-[var(--c-fg)] mb-1.5 block">
              فارم‌ها
            </label>
            <MultiSelectChips
              values={filters.farmIds}
              onChange={(farmIds) => onChange({ ...filters, farmIds })}
              options={farmOptions}
              placeholder="همه فارم‌ها"
            />
          </div>
        )}

        {hallOptions.length > 0 && (
          <div>
            <label className="text-sm font-medium text-[var(--c-fg)] mb-1.5 block">
              سالن‌ها
            </label>
            <MultiSelectChips
              values={filters.hallIds}
              onChange={(hallIds) => onChange({ ...filters, hallIds })}
              options={hallOptions}
              placeholder="همه سالن‌ها"
            />
          </div>
        )}

        {itemOptions.length > 0 && (
          <div>
            <label className="text-sm font-medium text-[var(--c-fg)] mb-1.5 block">
              اقلام
            </label>
            <MultiSelectChips
              values={filters.itemIds}
              onChange={(itemIds) => onChange({ ...filters, itemIds })}
              options={itemOptions}
              placeholder="همه اقلام"
            />
          </div>
        )}

        {supplierOptions.length > 0 && (
          <div>
            <label className="text-sm font-medium text-[var(--c-fg)] mb-1.5 block">
              تأمین‌کنندگان
            </label>
            <MultiSelectChips
              values={filters.supplierIds}
              onChange={(supplierIds) => onChange({ ...filters, supplierIds })}
              options={supplierOptions}
              placeholder="همه تأمین‌کنندگان"
            />
          </div>
        )}

        {categoryOptions && categoryOptions.length > 0 && (
          <div>
            <label className="text-sm font-medium text-[var(--c-fg)] mb-1.5 block">
              دسته‌ها
            </label>
            <MultiSelectChips
              values={filters.categories}
              onChange={(categories) => onChange({ ...filters, categories })}
              options={categoryOptions}
              placeholder="همه دسته‌ها"
            />
          </div>
        )}

        {txnTypeOptions && txnTypeOptions.length > 0 && (
          <div>
            <label className="text-sm font-medium text-[var(--c-fg)] mb-1.5 block">
              نوع تراکنش
            </label>
            <MultiSelectChips
              values={filters.txnTypes}
              onChange={(txnTypes) => onChange({ ...filters, txnTypes: txnTypes.slice(-1) })}
              options={txnTypeOptions}
              placeholder="همه انواع"
            />
            {/* Caption: explains the single-select server-side constraint.
                The chip UI is multi-select for symmetry with other filters,
                but the RPC consumes only one txn_type — when length > 1
                the hook silently disables the filter to preserve
                running_balance correctness. We surface that decision
                here so the user can see it instead of being misled. */}
            <p
              className={cn(
                'mt-1.5 text-[11px] leading-snug transition-colors',
                filters.txnTypes.length > 1
                  ? 'text-[var(--c-destructive)] font-semibold'
                  : 'text-[var(--c-muted-fg)]',
              )}
              title="برای حفظ صحت موجودی لحظه‌ای، فقط با انتخاب یک نوع، فیلتر اعمال می‌شود."
            >
              ۱ انتخاب — فیلتر اعمال می‌شود&nbsp;|&nbsp;۲+ انتخاب — فیلتر غیرفعال برای حفظ صحت موجودی لحظه‌ای
            </p>
          </div>
        )}

        {formulaOptions && formulaOptions.length > 0 && (
          <div>
            <label className="text-sm font-medium text-[var(--c-fg)] mb-1.5 block">
              فرمول‌ها
            </label>
            <MultiSelectChips
              values={filters.formulaIds}
              onChange={(formulaIds) => onChange({ ...filters, formulaIds })}
              options={formulaOptions}
              placeholder="همه فرمول‌ها"
            />
            <p
              className="mt-1.5 text-[11px] leading-snug text-[var(--c-muted-fg)]"
              title="هنگام گروه‌بندی بر اساس فرمول، فیلتر اعمال می‌شود؛ در سایر گروه‌بندی‌ها صرفاً محدودسازی است."
            >
              فیلتر در حالت «به تفکیک فرمول» اعمال می‌شود
            </p>
          </div>
        )}

        {abcClassOptions && abcClassOptions.length > 0 && (
          <div>
            <Select
              label="کلاس ABC"
              value={filters.abcClassFilter ?? ''}
              onChange={(e) =>
                onChange({
                  ...filters,
                  abcClassFilter: e.target.value
                    ? (e.target.value as NonNullable<ReportFiltersState['abcClassFilter']>)
                    : null,
                })
              }
            >
              <option value="">همه کلاس‌ها</option>
              {abcClassOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        {basisOptions && basisOptions.length > 0 && (
          <div>
            <Select
              label="مبنای ABC"
              value={filters.categoryBasis === 'quantity' ? 'quantity' : 'value'}
              onChange={(e) =>
                onChange({
                  ...filters,
                  categoryBasis: e.target.value as ReportFiltersState['categoryBasis'],
                })
              }
            >
              {basisOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        {booleanFilterLabel && (
          <div className="flex items-end">
            <div className="h-10 flex items-center">
              <Checkbox
                label={booleanFilterLabel}
                checked={filters.reorderNeededOnly === true}
                onChange={(e) =>
                  onChange({ ...filters, reorderNeededOnly: e.target.checked })
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const ReportFilterBar = memo(ReportFilterBarInner);
ReportFilterBar.displayName = 'ReportFilterBar';

export { defaultReportFilters };
