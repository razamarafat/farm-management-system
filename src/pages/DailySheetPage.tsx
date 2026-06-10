import { motion } from 'framer-motion';
import {
  ArrowRight, Save, CheckCircle, AlertTriangle, Loader2,
  Beaker, Building2, Calculator, RotateCcw, FileSpreadsheet,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { JalaliDatePicker } from '@/components/ui/JalaliDatePicker';
import { toPersianDigits } from '@/utils/persianNumbers';
import { gregorianToJalali, jalaliToGregorian } from '@/utils/jalaliDate';
import {
  CATEGORY_LABELS, STATUS_LABELS, STATUS_COLORS, toNumber,
  type VoucherCategory,
} from '@/types/consumption.types';
import { useDailySheet } from '@/hooks/useDailySheet';
import DailySheetTable from '@/components/consumption/DailySheetTable';
import { toast } from 'sonner';

interface DailySheetPageProps {
  category: VoucherCategory;
}

export default function DailySheetPage({ category }: DailySheetPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuthStore();
  const [missingItems, setMissingItems] = useState<string[]>([]);
  const [showMissingDialog, setShowMissingDialog] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  const dateParam = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const farmParam = searchParams.get('farm');
  const farmId = profile?.role === 'admin' ? (farmParam || '') : (profile?.farm_id || '');
  const isReadOnly = profile?.role === 'supervisor';
  const isAdmin = profile?.role === 'admin';
  const isFeed = category === 'feed';

  const {
    data, isLoading, error, isSaving, saveStatus,
    hallConfigs, updateLine, selectFormula, updateHallConfigs,
    autoCalculate, submitSheet, revertSheet, refetch,
  } = useDailySheet({ farmId, date: dateParam, category, ignoreEditWindow: isAdmin });

  const jalaliDate = gregorianToJalali(dateParam);

  const goBack = () => {
    const basePath = profile?.role === 'admin' ? '/admin' : profile?.role === 'supervisor' ? '/supervisor' : '/operator';
    navigate(`${basePath}/consumption`);
  };

  const handleDateChange = (val: string) => {
    if (!val) return;
    const gregorian = jalaliToGregorian(val);
    const params = new URLSearchParams(searchParams);
    params.set('date', gregorian);
    if (farmParam) {
      params.set('farm', farmParam);
    }
    const basePath = profile?.role === 'admin' ? '/admin' : profile?.role === 'supervisor' ? '/supervisor' : '/operator';
    navigate(`${basePath}/consumption/${category}?${params.toString()}`);
  };

  const toggleHall = (hallNumber: number) => {
    const updated = hallConfigs.map(h =>
      h.hallNumber === hallNumber ? { ...h, isSelected: !h.isSelected } : h
    );
    updateHallConfigs(updated);
  };

  const handleSubmit = async () => {
    if (!data) return;
    const hasAnyValue = data.items.some(
      (item) => toNumber(item.consumed_qty) > 0 || toNumber(item.waste_qty) > 0
    );
    if (!hasAnyValue) {
      toast.error('ثبت حواله خالی مجاز نیست');
      return;
    }

    const missingStock = data.items.filter(
      (item) => !item.has_initial && item.today_purchase <= 0 && (toNumber(item.consumed_qty) > 0 || toNumber(item.waste_qty) > 0)
    );
    if (missingStock.length > 0) {
      toast.error(`برای ثبت مصرف، باید برای این اقلام موجودی اولیه یا خرید ثبت شده باشد: ${missingStock.map(i => i.name).join('، ')}`);
      return;
    }

    if (isFeed && data.formula) {
      const formulaItemIds = new Set(data.items.filter((i) => i.qty_per_mixer > 0).map((i) => i.id));
      const filledItemIds = new Set(
        data.items.filter((i) => toNumber(i.consumed_qty) > 0 || toNumber(i.waste_qty) > 0).map((i) => i.id)
      );
      const missing = Array.from(formulaItemIds).filter((id) => !filledItemIds.has(id));
      if (missing.length > 0) {
        const missingNames = data.items
          .filter((i) => missing.includes(i.id))
          .map((i) => i.name);
        setMissingItems(missingNames);
        setShowMissingDialog(true);
        return;
      }
    }

    setPendingSubmit(true);
  };

  const setHallMixerCount = (hallNumber: number, count: number) => {
    const updated = hallConfigs.map(h =>
      h.hallNumber === hallNumber ? { ...h, mixerCount: Math.max(1, count) } : h
    );
    updateHallConfigs(updated);
  };

  const selectAllHalls = () => {
    updateHallConfigs(hallConfigs.map(h => ({ ...h, isSelected: true })));
  };

  const deselectAllHalls = () => {
    updateHallConfigs(hallConfigs.map(h => ({ ...h, isSelected: false })));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full max-w-md" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-lg font-medium text-[var(--c-fg)] mb-2">خطا در دریافت اطلاعات</p>
        <p className="text-sm text-[var(--c-muted-fg)] mb-4">{error}</p>
        <Button onClick={() => refetch()}>تلاش مجدد</Button>
      </div>
    );
  }

  if (!data) return null;

  const { voucher, items, formulas, formula } = data;
  const isLocked = voucher.status === 'locked';
  const isSubmitted = voucher.status === 'submitted';
  const canEdit = (voucher.is_editable || isAdmin) && !isReadOnly;
  const selectedHalls = hallConfigs.filter(h => h.isSelected);
  const totalMixers = selectedHalls.reduce((s, h) => s + h.mixerCount, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={goBack} className="p-2">
            <ArrowRight className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-[var(--c-fg)]">
              {isReadOnly ? 'مشاهده' : 'ثبت'} حواله {CATEGORY_LABELS[category]}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-[var(--c-muted-fg)]">تاریخ:</span>
              <JalaliDatePicker
                value={jalaliDate}
                onChange={handleDateChange}
                placeholder="انتخاب تاریخ"
                className="min-w-[160px]"
                disabled={isReadOnly}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[voucher.status].bg} ${STATUS_COLORS[voucher.status].text}`}>
            {STATUS_LABELS[voucher.status]}
          </span>
          {saveStatus && saveStatus !== 'idle' && (
            <span className="flex items-center gap-1 text-sm">
              {saveStatus === 'saving' && (<><Loader2 className="w-4 h-4 animate-spin text-blue-500" /><span className="text-blue-600">در حال ذخیره...</span></>)}
              {saveStatus === 'saved' && (<><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-green-600">ذخیره شد</span></>)}
              {saveStatus === 'error' && (<><AlertTriangle className="w-4 h-4 text-red-500" /><span className="text-red-600">خطا در ذخیره</span></>)}
            </span>
          )}
        </div>
      </div>

      {/* Banners */}
      {isLocked && !isAdmin && (
        <Card className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200">این حواله قفل شده است و امکان ویرایش وجود ندارد.</p>
          </div>
        </Card>
      )}
      {isReadOnly && !isLocked && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <p className="text-sm text-blue-800 dark:text-blue-200">شما فقط امکان مشاهده این حواله را دارید.</p>
          </div>
        </Card>
      )}
      {isAdmin && isLocked && (
        <Card className="p-4 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <p className="text-sm text-purple-800 dark:text-purple-200">
              شما به عنوان مدیر می‌توانید بدون محدودیت این حواله را ویرایش کنید.
            </p>
          </div>
        </Card>
      )}

      {/* Formula & Halls Selector (Feed Only) */}
      {isFeed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Formula Selector */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Beaker className="w-5 h-5 text-purple-500" />
              <h3 className="font-semibold text-[var(--c-fg)]">انتخاب فرمول</h3>
            </div>
            {formulas.length > 0 ? (
              <div className="space-y-3">
                <select
                  className="w-full h-10 px-3 rounded-md border border-[var(--c-border)] bg-[var(--c-card)] text-[var(--c-fg)] text-sm"
                  value={formula?.id || ''}
                  onChange={(e) => selectFormula(e.target.value)}
                  disabled={!canEdit}
                >
                  {formulas.map(f => (
                    <option key={f.id} value={f.id}>
                      فرمول شماره {toPersianDigits(f.formula_no)} {f.name ? `- ${f.name}` : ''} (میکسر: {toPersianDigits(f.mixer_weight)} کیلوگرم)
                    </option>
                  ))}
                </select>
                {formula && (
                  <div className="text-xs text-[var(--c-muted-fg)]">
                    وزن هر میکسر: <span className="font-medium text-[var(--c-fg)]">{toPersianDigits(formula.mixer_weight)} کیلوگرم</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--c-muted-fg)]">
                هیچ فرمولی برای این فارم تعریف نشده. از بخش مدیریت فارم‌ها فرمول اضافه کنید.
              </p>
            )}
          </Card>

          {/* Hall Selector */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-teal-500" />
                <h3 className="font-semibold text-[var(--c-fg)]">انتخاب سالن‌ها</h3>
              </div>
              {hallConfigs.length > 0 && (
                <div className="flex gap-2">
                  <button onClick={selectAllHalls} className="text-xs text-blue-600 hover:underline">انتخاب همه</button>
                  <button onClick={deselectAllHalls} className="text-xs text-red-600 hover:underline">حذف همه</button>
                </div>
              )}
            </div>
            {hallConfigs.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {hallConfigs.map(hall => (
                    <div
                      key={hall.hallNumber}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                        hall.isSelected
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-[var(--c-border)] bg-[var(--c-card)] hover:border-gray-400'
                      }`}
                      onClick={() => canEdit && toggleHall(hall.hallNumber)}
                    >
                      <input
                        type="checkbox"
                        checked={hall.isSelected}
                        readOnly
                        className="w-4 h-4 accent-green-600"
                      />
                      <span className="text-sm font-medium text-[var(--c-fg)]">
                        {hall.hallName}
                      </span>
                      {hall.isSelected && (
                        <div className="mr-auto flex items-center gap-1">
                          <span className="text-xs text-[var(--c-muted-fg)]">×</span>
                          <input
                            type="number"
                            min={1}
                            value={hall.mixerCount}
                            onChange={(e) => {
                              e.stopPropagation();
                              setHallMixerCount(hall.hallNumber, parseInt(e.target.value) || 1);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-12 h-6 px-1 text-center text-xs rounded border border-[var(--c-border)] bg-[var(--c-card)] text-[var(--c-fg)]"
                            disabled={!canEdit}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Summary & Calculate Button */}
                {selectedHalls.length > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-[var(--c-border)]">
                    <div className="text-sm text-[var(--c-muted-fg)]">
                      <span className="font-medium text-[var(--c-fg)]">{toPersianDigits(selectedHalls.length)}</span> سالن |
                      <span className="font-medium text-[var(--c-fg)] mr-1">{toPersianDigits(totalMixers)}</span> میکسر
                    </div>
                    {canEdit && formula && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={autoCalculate}
                        className="flex items-center gap-1"
                      >
                        <Calculator className="w-4 h-4" />
                        محاسبه خودکار
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--c-muted-fg)]">
                هیچ سالنی برای این فارم تعریف نشده. از بخش مدیریت فارم‌ها سالن اضافه کنید.
              </p>
            )}
          </Card>
        </div>
      )}

      {/* Data Table */}
      <Card className="overflow-hidden">
        <DailySheetTable
          items={items}
          category={category}
          canEdit={canEdit}
          selectedHalls={selectedHalls}
          onUpdateLine={updateLine}
        />
      </Card>

      {/* Summary Row */}
      {items.length > 0 && (
        <Card className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-xs text-[var(--c-muted-fg)] mb-1">تعداد اقلام</p>
              <p className="text-lg font-bold text-[var(--c-fg)]">{toPersianDigits(items.length)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--c-muted-fg)] mb-1">مجموع مصرف</p>
              <p className="text-lg font-bold text-green-600">{toPersianDigits(items.reduce((s, i) => s + i.consumed_qty, 0).toFixed(2))}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--c-muted-fg)] mb-1">مجموع ضایعات</p>
              <p className="text-lg font-bold text-orange-600">{toPersianDigits(items.reduce((s, i) => s + i.waste_qty, 0).toFixed(2))}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--c-muted-fg)] mb-1">اقلام با کمبود</p>
              <p className="text-lg font-bold text-red-600">{toPersianDigits(items.filter(i => i.status === 'danger').length)}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Action Buttons */}
      {!isReadOnly && (
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <Button variant="outline" onClick={goBack} className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4" />
            بازگشت
          </Button>

          <div className="flex gap-3">
            {isSubmitted && canEdit && (
              <Button variant="outline" onClick={revertSheet} disabled={isSaving} className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                برگشت به پیش‌نویس
              </Button>
            )}

            <Button variant="outline" disabled className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              خروجی اکسل
            </Button>

            {(!isLocked || isAdmin) && (
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={isSaving || items.length === 0}
                className="flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                ثبت نهایی
              </Button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showMissingDialog}
        onClose={() => setShowMissingDialog(false)}
        title="اقلام ناقص"
        message={`برخی اقلام موجود در فرمول هنوز در حواله ثبت نشده‌اند:\n${missingItems.join('، ')}\nآیا مایل به ثبت نهایی هستید؟`}
        confirmLabel="ثبت نهایی"
        cancelLabel="لغو"
        onConfirm={async () => {
          setShowMissingDialog(false);
          setPendingSubmit(true);
        }}
        variant="destructive"
      />

      <ConfirmDialog
        isOpen={pendingSubmit}
        onClose={() => setPendingSubmit(false)}
        title="تایید ثبت حواله"
        message="آیا از ثبت نهایی این حواله اطمینان دارید؟"
        confirmLabel="ثبت نهایی"
        cancelLabel="انصراف"
        onConfirm={async () => {
          setPendingSubmit(false);
          await submitSheet();
        }}
      />
    </motion.div>
  );
}
