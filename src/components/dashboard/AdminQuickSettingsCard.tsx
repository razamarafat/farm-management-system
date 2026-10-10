import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sliders,
  Settings,
  ShieldCheck,
  Bell,
  Clock,
  Wifi,
  Download,
  CheckCircle2,
  ExternalLink,
  Bird,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { useSettingsStore } from '@/store/settingsStore';
import { toPersianDigits } from '@/utils/persianNumbers';

export const AdminQuickSettingsCard = () => {
  const { settings, updateSettings, exportSettingsJson } = useSettingsStore();
  const [isExporting, setIsExporting] = useState(false);

  const breedLabels: Record<string, string> = {
    ross308: 'راس ۳۰۸ (Ross)',
    cobb500: 'کاب ۵۰۰ (Cobb)',
    arborAcres: 'آربور ایکرز',
    lohmann: 'لوهمن',
    other: 'سایر',
  };

  const handleExportJson = () => {
    setIsExporting(true);
    try {
      const jsonStr = exportSettingsJson();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `morvarid-settings-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('فایل پشتیبان تنظیمات ذخیره شد.');
    } catch {
      toast.error('خطا در صدور فایل تنظیمات');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card className="border-[var(--c-border)] shadow-sm overflow-hidden">
      <CardHeader className="bg-[var(--c-muted)]/30 border-b border-[var(--c-border)] pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--c-primary)]/10 text-[var(--c-primary)]">
              <Sliders size={20} />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-[var(--c-fg)]">
                کنترل سریع و تنظیمات سامانه
              </CardTitle>
              <p className="text-xs text-[var(--c-muted-fg)] mt-0.5">
                پیکربندی هوشمند سیاست‌های تولید، ایمنی انبار و رفتار عملیاتی برنامه
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportJson}
              isLoading={isExporting}
              className="gap-1.5 text-xs h-8"
              title="پشتیبان‌گیری پیکربندی"
            >
              <Download size={14} />
              <span className="hidden sm:inline">پشتیبان JSON</span>
            </Button>

            <Link to="/admin/settings">
              <Button variant="primary" size="sm" className="gap-1.5 text-xs h-8 font-semibold">
                <Settings size={14} />
                <span>صفحه جامع تنظیمات</span>
                <ExternalLink size={12} />
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-5">
        {/* Metric badges snapshot */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] flex flex-col justify-between">
            <span className="text-[11px] text-[var(--c-muted-fg)] font-medium">سویه فعال گله</span>
            <span className="text-sm font-bold text-[var(--c-fg)] mt-1 flex items-center gap-1.5">
              <Bird size={14} className="text-[var(--c-primary)]" />
              {breedLabels[settings.flockBreed] || settings.flockBreed}
            </span>
          </div>

          <div className="p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] flex flex-col justify-between">
            <span className="text-[11px] text-[var(--c-muted-fg)] font-medium">ظرفیت بچ میکسر</span>
            <span className="text-sm font-bold text-[var(--c-fg)] mt-1">
              {toPersianDigits(settings.defaultMixerWeight.toLocaleString())} کیلوگرم
            </span>
          </div>

          <div className="p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] flex flex-col justify-between">
            <span className="text-[11px] text-[var(--c-muted-fg)] font-medium">واحد مالی پایه</span>
            <span className="text-sm font-bold text-[var(--c-fg)] mt-1">
              {settings.currency === 'rial' ? 'ریال ایران (IRR)' : 'تومان (۱۰ ریال)'}
            </span>
          </div>

          <div className="p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] flex flex-col justify-between">
            <span className="text-[11px] text-[var(--c-muted-fg)] font-medium">قفل خودکار روزانه</span>
            <span className="text-sm font-bold text-[var(--c-fg)] mt-1 flex items-center gap-1">
              <Clock size={13} className="text-amber-500" />
              {settings.dailyVoucherAutoLockHour !== null
                ? `ساعت ${toPersianDigits(settings.dailyVoucherAutoLockHour)}:۰۰`
                : 'غیرفعال (دستی)'}
            </span>
          </div>
        </div>

        {/* Quick Toggles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
          {/* Toggle 1: Prevent Negative Inventory */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] hover:border-[var(--c-primary)]/40 transition-colors">
            <div className="flex items-start gap-2.5 ml-2">
              <div className="mt-0.5 p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck size={16} />
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--c-fg)]">
                  جلوگیری از منفی شدن انبار
                </div>
                <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                  مانع از ثبت حواله خروج بیش از موجودی فیزیکی واقعی
                </div>
              </div>
            </div>
            <Toggle
              checked={settings.preventNegativeInventory}
              onChange={() => {
                const nextVal = !settings.preventNegativeInventory;
                updateSettings({ preventNegativeInventory: nextVal });
                toast.success(nextVal ? 'کنترل عدم موجودی منفی فعال شد' : 'کنترل عدم موجودی منفی غیرفعال شد');
              }}
              label="جلوگیری از منفی شدن انبار"
            />
          </div>

          {/* Toggle 2: Reorder Alerts */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] hover:border-[var(--c-primary)]/40 transition-colors">
            <div className="flex items-start gap-2.5 ml-2">
              <div className="mt-0.5 p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Bell size={16} />
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--c-fg)]">
                  هشدارهای نقطه سفارش در داشبورد
                </div>
                <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                  نمایش بَج قرمز اقلام نیازمند خرید با حاشیه {toPersianDigits(settings.reorderBufferPercent)}٪
                </div>
              </div>
            </div>
            <Toggle
              checked={settings.reorderAlertsEnabled}
              onChange={() => {
                const nextVal = !settings.reorderAlertsEnabled;
                updateSettings({ reorderAlertsEnabled: nextVal });
                toast.success(nextVal ? 'هشدارهای نقطه سفارش فعال شد' : 'هشدارهای نقطه سفارش غیرفعال شد');
              }}
              label="هشدارهای نقطه سفارش در داشبورد"
            />
          </div>

          {/* Toggle 3: Offline Reference Cache */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] hover:border-[var(--c-primary)]/40 transition-colors">
            <div className="flex items-start gap-2.5 ml-2">
              <div className="mt-0.5 p-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Wifi size={16} />
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--c-fg)]">
                  کش آفلاین داده‌های پایه فارم
                </div>
                <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                  بارگذاری فرم‌ها بدون نیاز به اینترنت با موتور IndexedDB
                </div>
              </div>
            </div>
            <Toggle
              checked={settings.cacheReferenceDataOffline}
              onChange={() => {
                const nextVal = !settings.cacheReferenceDataOffline;
                updateSettings({ cacheReferenceDataOffline: nextVal });
                toast.success(nextVal ? 'کش آفلاین فعال شد' : 'کش آفلاین غیرفعال شد');
              }}
              label="کش آفلاین داده‌های پایه فارم"
            />
          </div>

          {/* Toggle 4: Notes on Adjustment */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] hover:border-[var(--c-primary)]/40 transition-colors">
            <div className="flex items-start gap-2.5 ml-2">
              <div className="mt-0.5 p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <CheckCircle2 size={16} />
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--c-fg)]">
                  الزام درج علت در تعدیل انبار
                </div>
                <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                  ثبت توضیحات توجیهی در اصلاحات دستی موجودی الزامی باشد
                </div>
              </div>
            </div>
            <Toggle
              checked={settings.requireVoucherNotesOnAdjustment}
              onChange={() => {
                const nextVal = !settings.requireVoucherNotesOnAdjustment;
                updateSettings({ requireVoucherNotesOnAdjustment: nextVal });
                toast.success(nextVal ? 'الزام درج علت تعدیل فعال شد' : 'الزام درج علت تعدیل غیرفعال شد');
              }}
              label="الزام درج علت در تعدیل انبار"
            />
          </div>
        </div>

        {/* Footer Link */}
        <div className="pt-1 flex items-center justify-between text-xs border-t border-[var(--c-border)] text-[var(--c-muted-fg)]">
          <span>
            برای تنظیمات امنیتی، ضرایب FCR گله، چاپ فاکتورها و عیب‌یابی سرور:
          </span>
          <Link
            to="/admin/settings"
            className="text-[var(--c-primary)] font-semibold hover:underline flex items-center gap-1"
          >
            مشاهده کلیه ۷ بخش تنظیمات
            <span dir="ltr">→</span>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminQuickSettingsCard;
