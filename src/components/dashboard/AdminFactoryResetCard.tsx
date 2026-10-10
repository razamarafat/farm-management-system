import { useState } from 'react';
import { AlertTriangle, RotateCcw, ShieldAlert, CheckCircle2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { rpc } from '@/utils/rpc';
import { purgeOfflineDb } from '@/lib/offline';

const CONFIRM_PHRASE = 'حذف تمام داده‌ها';

interface ResetStats {
  vouchers: number;
  voucher_lines: number;
  transactions: number;
  formulas: number;
  formula_items: number;
  items: number;
  halls: number;
  farms: number;
  suppliers: number;
  users: number;
  inputs: number;
  success: boolean;
}

export const AdminFactoryResetCard = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [deleteNonAdminUsers, setDeleteNonAdminUsers] = useState(true);
  const [resetInputsCatalog, setResetInputsCatalog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [completedStats, setCompletedStats] = useState<ResetStats | null>(null);

  const isConfirmed = confirmInput.trim() === CONFIRM_PHRASE;

  const handleOpen = () => {
    setConfirmInput('');
    setCompletedStats(null);
    setIsOpen(true);
  };

  const handleClose = () => {
    if (isLoading) return;
    setIsOpen(false);
    setConfirmInput('');
  };

  const executeReset = async () => {
    if (!isConfirmed || isLoading) return;

    setIsLoading(true);
    try {
      const { data, error } = await rpc<ResetStats>('admin_factory_reset', {
        p_keep_inputs: !resetInputsCatalog,
        p_delete_non_admin_users: deleteNonAdminUsers,
      });

      if (error) {
        throw new Error(error);
      }

      // Purge local client-side IndexedDB cache (RxDB)
      await purgeOfflineDb();

      // Clear any app-level localStorage cache keys
      try {
        const keysToRemove = ['morvarid_active_farm', 'offline_queue', 'daily_sheet_draft'];
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch {
        // ignore storage errors
      }

      setCompletedStats(data ?? null);
      toast.success('سامانه با موفقیت به تنظیمات اولیه کارخانه بازنشانی شد.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'خطای ناشناخته در بازنشانی داده‌ها';
      toast.error(`خطا در بازنشانی سامانه: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinishAndReload = () => {
    setIsOpen(false);
    window.location.href = '/admin';
  };

  return (
    <>
      <Card className="border-[var(--c-destructive)]/30 bg-[color-mix(in_srgb,var(--c-destructive)_3%,var(--c-card))] overflow-hidden shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-[var(--c-destructive)]/10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--c-destructive)]/10 flex items-center justify-center text-[var(--c-destructive)] shrink-0">
              <ShieldAlert size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg font-bold">
                  پاک‌سازی داده‌ها و بازنشانی کارخانه
                </CardTitle>
                <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
                  منطقه حساس
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-[var(--c-muted-fg)] mt-0.5">
                آماده‌سازی سامانه برای انتشار عمومی (Public Release) و حذف داده‌های آزمایشی
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-3 text-xs sm:text-sm text-[var(--c-muted-fg)] leading-relaxed">
          <p>
            با اجرای این عملیات، کلیه اطلاعات ثبت‌شده توسط کاربران (فارم‌ها، تراکنش‌های انبار، برگه‌های مصرف، فرمول‌های دان و کاربران آزمایشی) به صورت قطعی و اتمیک حذف شده و نرم‌افزار به حالت خام اولیه برمی‌گردد.
          </p>
          <div className="flex items-center gap-2 text-[var(--c-foreground)] text-xs font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            حساب کاربری مدیر سیستم (`admin`) جهت حفظ دسترسی محفوظ می‌ماند.
          </div>
        </CardContent>

        <CardFooter className="pt-3 pb-4 bg-[var(--c-destructive)]/5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--c-destructive)]/10">
          <span className="text-xs text-[var(--c-muted-fg)]">
            عملیات بر اساس استانداردهای نرم‌افزارهای تجاری و با تأیید دو‌مرحله‌ای امن انجام می‌شود.
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleOpen}
            className="gap-2"
          >
            <RotateCcw size={15} />
            بازنشانی داده‌های سیستم...
          </Button>
        </CardFooter>
      </Card>

      {/* Safety Confirmation Modal */}
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={completedStats ? 'گزارش پاک‌سازی سامانه' : 'تأیید بازنشانی کارخانه (Factory Reset)'}
        disableBackdropClose={isLoading}
        className="max-w-[560px]"
      >
        {completedStats ? (
          <div className="space-y-5 py-2">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 size={28} className="shrink-0 text-emerald-600" />
              <div>
                <h4 className="font-bold text-sm">سامانه با موفقیت به حالت خام بازنشانی شد</h4>
                <p className="text-xs opacity-90 mt-0.5">
                  تمام داده‌های انتخابی پاک شدند و دیتابیس آماده استقرار نهایی است.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-lg bg-[var(--c-muted)] flex flex-col">
                <span className="text-[var(--c-muted-fg)]">برگه‌های مصرف</span>
                <span className="text-base font-bold text-[var(--c-fg)] mt-1">
                  {completedStats.vouchers} برگه ({completedStats.voucher_lines} ردیف)
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[var(--c-muted)] flex flex-col">
                <span className="text-[var(--c-muted-fg)]">تراکنش‌های انبار</span>
                <span className="text-base font-bold text-[var(--c-fg)] mt-1">
                  {completedStats.transactions} تراکنش
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[var(--c-muted)] flex flex-col">
                <span className="text-[var(--c-muted-fg)]">فارم‌ها و سالن‌ها</span>
                <span className="text-base font-bold text-[var(--c-fg)] mt-1">
                  {completedStats.farms} فارم ({completedStats.halls} سالن)
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[var(--c-muted)] flex flex-col">
                <span className="text-[var(--c-muted-fg)]">اقلام و فرمول‌ها</span>
                <span className="text-base font-bold text-[var(--c-fg)] mt-1">
                  {completedStats.items} قلم ({completedStats.formulas} فرمول)
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[var(--c-muted)] flex flex-col">
                <span className="text-[var(--c-muted-fg)]">تأمین‌کنندگان</span>
                <span className="text-base font-bold text-[var(--c-fg)] mt-1">
                  {completedStats.suppliers} مورد
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[var(--c-muted)] flex flex-col">
                <span className="text-[var(--c-muted-fg)]">کاربران آزمایشی</span>
                <span className="text-base font-bold text-[var(--c-fg)] mt-1">
                  {completedStats.users} کاربر
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button variant="primary" onClick={handleFinishAndReload} className="w-full sm:w-auto">
                تأیید و به‌روزرسانی پنل
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Warning Banner */}
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[var(--c-destructive)]/10 border border-[var(--c-destructive)]/25 text-[var(--c-fg)] text-xs sm:text-sm">
              <AlertTriangle size={20} className="shrink-0 text-[var(--c-destructive)] mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-[var(--c-destructive)]">
                  هشدار امنیتی: این عملیات برگشت‌ناپذیر است!
                </div>
                <div className="text-xs text-[var(--c-muted-fg)] leading-relaxed">
                  تمامی رکوردهای عملیاتی ثبت‌شده به صورت دائم از سرور حذف خواهند شد. لطفاً در صورت نیاز قبل از تأیید، از نسخه پشتیبان اطمینان حاصل کنید.
                </div>
              </div>
            </div>

            {/* Scope Options */}
            <div className="space-y-2.5 text-xs sm:text-sm">
              <div className="font-semibold text-[var(--c-fg)]">دامنه پاک‌سازی:</div>
              <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-card)] cursor-not-allowed opacity-90">
                <input type="checkbox" checked disabled className="accent-[var(--c-destructive)] rounded" />
                <span className="text-[var(--c-fg)]">
                  پاک‌سازی کامل فارم‌ها، سالن‌ها، اقلام، موجودی انبار و برگه‌های مصرف (اجباری)
                </span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-card)] cursor-pointer hover:bg-[var(--c-muted)]/50 transition-colors">
                <input
                  type="checkbox"
                  checked={deleteNonAdminUsers}
                  onChange={(e) => setDeleteNonAdminUsers(e.target.checked)}
                  className="accent-[var(--c-destructive)] rounded"
                />
                <span className="text-[var(--c-fg)]">
                  حذف کاربران آزمایشی (اپراتورها و سرپرستان) — <strong>حساب مدیر سیستم حفظ می‌شود</strong>
                </span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-card)] cursor-pointer hover:bg-[var(--c-muted)]/50 transition-colors">
                <input
                  type="checkbox"
                  checked={resetInputsCatalog}
                  onChange={(e) => setResetInputsCatalog(e.target.checked)}
                  className="accent-[var(--c-destructive)] rounded"
                />
                <span className="text-[var(--c-fg)]">
                  پاک‌سازی فهرست نهاده‌های پایه (Inputs Catalog)
                </span>
              </label>
            </div>

            {/* Confirmation Phrase Input */}
            <div className="space-y-2 pt-2 border-t border-[var(--c-border)]">
              <label className="text-xs sm:text-sm font-medium text-[var(--c-fg)] block">
                جهت تأیید قطعی، عبارت <strong className="text-[var(--c-destructive)] font-bold">«{CONFIRM_PHRASE}»</strong> را در کادر زیر تایپ کنید:
              </label>
              <Input
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                disabled={isLoading}
                className="font-medium text-center"
                dir="rtl"
              />
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-end gap-3 border-t border-[var(--c-border)]">
              <Button
                variant="ghost"
                onClick={handleClose}
                disabled={isLoading}
              >
                انصراف
              </Button>
              <Button
                variant="destructive"
                disabled={!isConfirmed || isLoading}
                isLoading={isLoading}
                onClick={executeReset}
                className="gap-2"
              >
                <Trash2 size={16} />
                تأیید و اجرای پاک‌سازی کارخانه
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};
