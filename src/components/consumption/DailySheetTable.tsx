import { memo, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { type DailySheetRow, type VoucherCategory, type HallConfig, CATEGORY_LABELS, toNumber } from '@/types/consumption.types';
import { toPersianDigits } from '@/utils/persianNumbers';
import { Input } from '@/components/ui/Input';
import { NumericInput } from '@/components/ui/NumericInput';

interface DailySheetTableProps {
  items: DailySheetRow[];
  category: VoucherCategory;
  canEdit: boolean;
  selectedHalls: HallConfig[];
  onUpdateLine: (itemId: string, field: keyof DailySheetRow, value: string | number) => void;
}

const StatusIcon = memo(({ status }: { status: 'ok' | 'warning' | 'danger' }) => {
  switch (status) {
    case 'ok': return <CheckCircle className="w-4 h-4 text-[var(--c-success)]" />;
    case 'warning': return <AlertTriangle className="w-4 h-4 text-[var(--c-warning)]" />;
    case 'danger': return <AlertCircle className="w-4 h-4 text-[var(--c-error)]" />;
    default: return null;
  }
});
StatusIcon.displayName = 'StatusIcon';

const NumericCell = memo(({
  value, onChange, disabled, highlight,
}: {
  value: number; onChange?: (val: string) => void; disabled: boolean; highlight?: string;
}) => {
  const displayVal = value || 0;
  const [localValue, setLocalValue] = useState(displayVal ? String(displayVal) : '');
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setLocalValue(displayVal ? String(displayVal) : '');
    }
  }, [displayVal]);

  if (disabled || !onChange) {
    return (
      <span className={`text-sm font-medium ${highlight || 'text-[var(--c-fg)]'}`}>
        {displayVal > 0 ? toPersianDigits(displayVal.toFixed(2)) : '—'}
      </span>
    );
  }
  return (
    <NumericInput
      value={localValue}
      onValueChange={(nextValue) => {
        const safeValue = nextValue.startsWith('-') ? '' : nextValue;
        setLocalValue(safeValue);
        onChange(safeValue);
      }}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => {
        focusedRef.current = false;
        setLocalValue(displayVal ? String(displayVal) : '');
      }}
      className="h-8 text-sm text-left w-24"
      dir="ltr"
    />
  );
});
NumericCell.displayName = 'NumericCell';

function DailySheetTable({ items, category, canEdit, selectedHalls, onUpdateLine }: DailySheetTableProps) {
  const isFeed = category === 'feed';
  const hasHalls = isFeed && selectedHalls.length > 0;

  if (items.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--c-muted-fg)]">
          هیچ {CATEGORY_LABELS[category]}ی برای این فارم تعریف نشده است.
        </p>
        <p className="text-xs text-[var(--c-muted-fg)] mt-2">
          ابتدا از بخش مدیریت فارم‌ها، اقلام مورد نیاز را اضافه کنید.
        </p>
      </div>
    );
  }

  // Calculate totals
  const totalConsumed = items.reduce((s, i) => s + i.consumed_qty, 0);
  const totalWaste = items.reduce((s, i) => s + i.waste_qty, 0);
  const totalPurchase = items.reduce((s, i) => s + i.today_purchase, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-[var(--c-muted)] border-b-2 border-[var(--c-border)]">
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] w-12 sticky right-0 bg-[var(--c-muted)] z-10">#</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] min-w-[160px] sticky right-12 bg-[var(--c-muted)] z-10">
              نام {isFeed ? 'نهاده' : 'قلم'}
            </th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] w-20">واحد</th>

            {/* Per-mixer qty from formula */}
            {isFeed && (
              <th className="px-3 py-3 text-center font-semibold text-[var(--c-accent)] w-28 bg-[color-mix(in_srgb,var(--c-accent)_12%,transparent)]">
                هر میکسر
              </th>
            )}

            <th className="px-3 py-3 text-center font-semibold text-[var(--c-success)] w-32 bg-[color-mix(in_srgb,var(--c-success)_10%,transparent)]">
              جمع مصرف
            </th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-info)] w-28">خرید امروز</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-accent)] w-28">ضایعات</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] w-32">مانده انبار</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] min-w-[140px]">توضیحات</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] w-12">🔔</th>
          </tr>
        </thead>

        <tbody>
          {items.map((item, index) => {
            const rowStatus = item.status || 'ok';
            const rowBg = rowStatus === 'danger'
              ? 'bg-[color-mix(in_srgb,var(--c-destructive)_6%,transparent)]'
              : rowStatus === 'warning'
                ? 'bg-[color-mix(in_srgb,var(--c-warning)_6%,transparent)]'
                : '';

            return (
              <tr
                key={item.id}
                className={`border-b border-[var(--c-border)] hover:bg-[var(--hover-bg)] transition-colors ${rowBg}`}
              >
                {/* Row # */}
                <td className="px-3 py-2 text-center text-[var(--c-muted-fg)] sticky right-0 bg-[var(--c-card)] z-10">
                  {toPersianDigits(index + 1)}
                </td>

                {/* Item Name */}
                <td className="px-3 py-2 text-center sticky right-12 bg-[var(--c-card)] z-10">
                  <span className="font-medium text-[var(--c-fg)]">{item.name}</span>
                </td>

                {/* Unit */}
                <td className="px-3 py-2 text-center text-xs text-[var(--c-muted-fg)]">{item.unit}</td>

                {/* Per-mixer from formula */}
                {isFeed && (
                  <td className="px-3 py-2 text-center bg-[color-mix(in_srgb,var(--c-accent)_6%,transparent)]">
                    <span className="font-medium text-[var(--c-accent)]">
                      {item.qty_per_mixer > 0 ? toPersianDigits(item.qty_per_mixer.toFixed(2)) : '—'}
                    </span>
                  </td>
                )}

                {/* Total consumed */}
                <td className="px-3 py-2 text-center bg-[color-mix(in_srgb,var(--c-success)_5%,transparent)]">
                  {!hasHalls && canEdit ? (
                    <NumericCell
                      value={item.consumed_qty}
                      onChange={(val) => onUpdateLine(item.id, 'consumed_qty', toNumber(val))}
                      disabled={!(item.has_initial || item.today_purchase > 0)}
                      highlight="text-[var(--c-success)]"
                    />
                  ) : (
                    <span className="font-bold text-[var(--c-success)]">
                      {item.consumed_qty > 0 ? toPersianDigits(item.consumed_qty.toFixed(2)) : '—'}
                    </span>
                  )}
                </td>

                {/* Today Purchase (read-only) */}
                <td className="px-3 py-2 text-center">
                  <span className="text-sm text-[var(--c-info)]">
                    {item.today_purchase > 0 ? toPersianDigits(item.today_purchase.toFixed(2)) : '—'}
                  </span>
                </td>

                {/* Waste */}
                <td className="px-3 py-2 text-center">
                  <NumericCell
                    value={item.waste_qty}
                    onChange={(val) => onUpdateLine(item.id, 'waste_qty', toNumber(val))}
                    disabled={!canEdit}
                    highlight="text-[var(--c-accent)]"
                  />
                </td>

                {/* Remaining Balance */}
                <td className="px-3 py-2 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className={`font-bold ${
                      item.remaining_preview < 0
                        ? 'text-[var(--c-error)]'
                        : item.remaining_preview < item.reorder_point
                          ? 'text-[var(--c-warning)]'
                          : 'text-[var(--c-fg)]'
                    }`}>
                      {toPersianDigits(item.remaining_preview.toFixed(2))}
                    </span>
                    {!item.has_initial && item.today_purchase <= 0 && (
                      <span className="text-[10px] text-[var(--c-accent)]">
                        بدون موجودی اولیه/خرید
                      </span>
                    )}
                  </div>
                </td>

                {/* Notes */}
                <td className="px-3 py-2 text-center">
                  {canEdit ? (
                    <Input
                      value={item.notes}
                      onChange={(e) => onUpdateLine(item.id, 'notes', e.target.value)}
                      className="h-7 text-xs w-full text-right"
                      placeholder="..."
                    />
                  ) : (
                    <span className="text-xs text-[var(--c-muted-fg)]">{item.notes || '—'}</span>
                  )}
                </td>

                {/* Status */}
                <td className="px-3 py-2 text-center">
                  <StatusIcon status={rowStatus} />
                </td>
              </tr>
            );
          })}
        </tbody>

        {/* Footer totals */}
        <tfoot>
          <tr className="bg-[var(--c-muted)] border-t-2 border-[var(--c-border)] font-bold">
            <td className="px-3 py-3 text-center sticky right-0 bg-[var(--c-muted)] z-10" colSpan={isFeed ? 4 : 3}>
              <span className="text-[var(--c-fg)]">جمع کل</span>
            </td>

            <td className="px-3 py-3 text-center text-[var(--c-success)]">
              {toPersianDigits(totalConsumed.toFixed(2))}
            </td>
            <td className="px-3 py-3 text-center text-[var(--c-info)]">
              {totalPurchase > 0 ? toPersianDigits(totalPurchase.toFixed(2)) : '—'}
            </td>
            <td className="px-3 py-3 text-center text-[var(--c-accent)]">
              {totalWaste > 0 ? toPersianDigits(totalWaste.toFixed(2)) : '—'}
            </td>
            <td className="px-3 py-3" colSpan={3}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default memo(DailySheetTable);
