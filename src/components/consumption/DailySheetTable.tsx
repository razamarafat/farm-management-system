import { memo } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { type DailySheetRow, type VoucherCategory, type HallConfig, CATEGORY_LABELS, toNumber } from '@/types/consumption.types';
import { toPersianDigits } from '@/utils/persianNumbers';
import { Input } from '@/components/ui/Input';

interface DailySheetTableProps {
  items: DailySheetRow[];
  category: VoucherCategory;
  canEdit: boolean;
  selectedHalls: HallConfig[];
  onUpdateLine: (itemId: string, field: keyof DailySheetRow, value: string | number) => void;
}

const StatusIcon = memo(({ status }: { status: 'ok' | 'warning' | 'danger' }) => {
  switch (status) {
    case 'ok': return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    case 'danger': return <AlertCircle className="w-4 h-4 text-red-500" />;
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
  if (disabled || !onChange) {
    return (
      <span className={`text-sm font-medium ${highlight || 'text-[var(--c-fg)]'}`}>
        {displayVal > 0 ? toPersianDigits(displayVal.toFixed(2)) : '—'}
      </span>
    );
  }
  return (
    <Input
      type="number"
      value={displayVal || ''}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 text-sm text-left w-24"
      dir="ltr"
      min={0}
      step="0.01"
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
  const totalAdjustment = items.reduce((s, i) => s + i.adjustment_qty, 0);
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
              <th className="px-3 py-3 text-center font-semibold text-purple-700 dark:text-purple-400 w-28 bg-purple-50 dark:bg-purple-900/20">
                هر میکسر
              </th>
            )}

            <th className="px-3 py-3 text-center font-semibold text-green-700 dark:text-green-400 w-32 bg-green-50 dark:bg-green-900/10">
              جمع مصرف
            </th>
            <th className="px-3 py-3 text-center font-semibold text-blue-700 dark:text-blue-400 w-28">خرید امروز</th>
            <th className="px-3 py-3 text-center font-semibold text-orange-700 dark:text-orange-400 w-28">ضایعات</th>
            <th className="px-3 py-3 text-center font-semibold text-indigo-700 dark:text-indigo-400 w-28">تعدیل</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] w-32">مانده انبار</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] min-w-[140px]">توضیحات</th>
            <th className="px-3 py-3 text-center font-semibold text-[var(--c-fg)] w-12">🔔</th>
          </tr>
        </thead>

        <tbody>
          {items.map((item, index) => {
            const rowStatus = item.status || 'ok';
            const rowBg = rowStatus === 'danger'
              ? 'bg-red-50/50 dark:bg-red-900/5'
              : rowStatus === 'warning'
                ? 'bg-yellow-50/50 dark:bg-yellow-900/5'
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
                  <td className="px-3 py-2 text-center bg-purple-50/50 dark:bg-purple-900/10">
                    <span className="font-medium text-purple-700 dark:text-purple-400">
                      {item.qty_per_mixer > 0 ? toPersianDigits(item.qty_per_mixer.toFixed(2)) : '—'}
                    </span>
                  </td>
                )}

                {/* Total consumed */}
                <td className="px-3 py-2 text-center bg-green-50/30 dark:bg-green-900/5">
                  {!hasHalls && canEdit ? (
                    <NumericCell
                      value={item.consumed_qty}
                      onChange={(val) => onUpdateLine(item.id, 'consumed_qty', toNumber(val))}
                      disabled={!(item.has_initial || item.today_purchase > 0)}
                      highlight="text-green-700 dark:text-green-400"
                    />
                  ) : (
                    <span className="font-bold text-green-700 dark:text-green-400">
                      {item.consumed_qty > 0 ? toPersianDigits(item.consumed_qty.toFixed(2)) : '—'}
                    </span>
                  )}
                </td>

                {/* Today Purchase (read-only) */}
                <td className="px-3 py-2 text-center">
                  <span className="text-sm text-blue-600 dark:text-blue-400">
                    {item.today_purchase > 0 ? toPersianDigits(item.today_purchase.toFixed(2)) : '—'}
                  </span>
                </td>

                {/* Waste */}
                <td className="px-3 py-2 text-center">
                  <NumericCell
                    value={item.waste_qty}
                    onChange={(val) => onUpdateLine(item.id, 'waste_qty', toNumber(val))}
                    disabled={!canEdit}
                    highlight="text-orange-600 dark:text-orange-400"
                  />
                </td>

                {/* Adjustment */}
                <td className="px-3 py-2 text-center">
                  <NumericCell
                    value={item.adjustment_qty}
                    onChange={(val) => onUpdateLine(item.id, 'adjustment_qty', toNumber(val))}
                    disabled={!canEdit}
                    highlight="text-indigo-600 dark:text-indigo-400"
                  />
                </td>

                {/* Remaining Balance */}
                <td className="px-3 py-2 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className={`font-bold ${
                      item.remaining_preview < 0
                        ? 'text-red-600 dark:text-red-400'
                        : item.remaining_preview < item.reorder_point
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-[var(--c-fg)]'
                    }`}>
                      {toPersianDigits(item.remaining_preview.toFixed(2))}
                    </span>
                    {!item.has_initial && item.today_purchase <= 0 && (
                      <span className="text-[10px] text-purple-600 dark:text-purple-400">
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

            <td className="px-3 py-3 text-center text-green-700 dark:text-green-400">
              {toPersianDigits(totalConsumed.toFixed(2))}
            </td>
            <td className="px-3 py-3 text-center text-blue-600">
              {totalPurchase > 0 ? toPersianDigits(totalPurchase.toFixed(2)) : '—'}
            </td>
            <td className="px-3 py-3 text-center text-orange-600">
              {totalWaste > 0 ? toPersianDigits(totalWaste.toFixed(2)) : '—'}
            </td>
            <td className="px-3 py-3 text-center text-indigo-600">
              {totalAdjustment !== 0 ? toPersianDigits(totalAdjustment.toFixed(2)) : '—'}
            </td>
            <td className="px-3 py-3" colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default memo(DailySheetTable);
