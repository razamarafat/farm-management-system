import { useState, useEffect } from 'react';
import {
  Building2,
  Sliders,
  ShieldCheck,
  Wifi,
  FileSpreadsheet,
  Server,
  Save,
  RotateCcw,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Layers,
  Database,
  Info,
  Scale,
  Bird,
  Volume2,
  Table,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSettingsStore, SystemSettings } from '@/store/settingsStore';
import { purgeOfflineDb, isOfflineDbReady } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { AdminFactoryResetCard } from '@/components/dashboard/AdminFactoryResetCard';
import { toPersianDigits } from '@/utils/persianNumbers';

type TabKey = 'general' | 'flock' | 'operations' | 'inventory' | 'offline' | 'reports' | 'system';

export const AdminSettingsPage = () => {
  const { settings, updateSettings, resetSettings, exportSettingsJson, importSettingsJson } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const [formState, setFormState] = useState<SystemSettings>({ ...settings });
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [purgeCacheConfirmOpen, setPurgeCacheConfirmOpen] = useState(false);
  const [isPurgingCache, setIsPurgingCache] = useState(false);

  // System Diagnostics state
  const [dbPingMs, setDbPingMs] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [isOfflineReady, setIsOfflineReady] = useState(false);

  useEffect(() => {
    setFormState({ ...settings });
  }, [settings]);

  useEffect(() => {
    isOfflineDbReady().then(setIsOfflineReady);
    checkServerLatency();
  }, []);

  const checkServerLatency = async () => {
    setIsPinging(true);
    const start = performance.now();
    try {
      const { error } = await supabase.from('farms').select('id', { count: 'exact', head: true });
      if (!error) {
        setDbPingMs(Math.round(performance.now() - start));
      } else {
        setDbPingMs(-1);
      }
    } catch {
      setDbPingMs(-1);
    } finally {
      setIsPinging(false);
    }
  };

  const handleFieldChange = <K extends keyof SystemSettings>(field: K, value: SystemSettings[K]) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    updateSettings(formState);
    toast.success('تنظیمات سامانه با موفقیت در حافظه مرورگر ذخیره شد.');
  };

  const handleResetToDefaults = () => {
    resetSettings();
    setResetConfirmOpen(false);
    toast.info('تنظیمات به مقادیر پیش‌فرض کارخانه بازگردانده شد.');
  };

  const handleExportJson = () => {
    const jsonStr = exportSettingsJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `morvarid-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('فایل تنظیمات با موفقیت دانلود شد.');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const success = importSettingsJson(content);
      if (success) {
        toast.success('تنظیمات جدید با موفقیت فراخوانی شد.');
      } else {
        toast.error('قالب فایل نامعتبر است.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePurgeLocalCache = async () => {
    setIsPurgingCache(true);
    try {
      await purgeOfflineDb();
      setIsOfflineReady(false);
      isOfflineDbReady().then(setIsOfflineReady);
      toast.success('حافظه کش محلی مرورگر (IndexedDB) با موفقیت پاک‌سازی شد.');
    } catch {
      toast.error('خطا در پاک‌سازی کش محلی');
    } finally {
      setIsPurgingCache(false);
      setPurgeCacheConfirmOpen(false);
    }
  };

  const tabs: { key: TabKey; label: string; icon: typeof Building2 }[] = [
    { key: 'general', label: 'عمومی و هویت', icon: Building2 },
    { key: 'flock', label: 'استاندارد گله و طیور', icon: Bird },
    { key: 'operations', label: 'دان‌سازی و مصرف', icon: Sliders },
    { key: 'inventory', label: 'ایمنی انبار و حسابداری', icon: Scale },
    { key: 'offline', label: 'آفلاین و داده‌ها', icon: Wifi },
    { key: 'reports', label: 'گزارشات و رابط کاربری', icon: FileSpreadsheet },
    { key: 'system', label: 'سلامت سرور و عیب‌یابی', icon: Server },
  ];

  return (
    <div className="space-y-6 w-full pb-12">
      {/* Header with Title and Global Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[var(--c-border)]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--c-fg)]">تنظیمات و پیکربندی سامانه</h2>
          <p className="text-sm text-[var(--c-muted-fg)] mt-1">
            مدیریت هویت مجتمع، استاندارد پرورش و دان‌سازی، ایمنی انبار، موتور آفلاین و سلامت سرور
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="file"
            id="import-settings-input"
            accept=".json"
            onChange={handleImportJson}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById('import-settings-input')?.click()}
            className="gap-1.5"
            title="فراخوانی از فایل JSON"
          >
            <Upload size={15} />
            <span className="hidden sm:inline">فراخوانی</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportJson}
            className="gap-1.5"
            title="خروجی فایل JSON"
          >
            <Download size={15} />
            <span className="hidden sm:inline">پشتیبان تنظیمات</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setResetConfirmOpen(true)}
            className="gap-1.5 text-[var(--c-muted-fg)] hover:text-[var(--c-destructive)]"
          >
            <RotateCcw size={15} />
            بازنشانی پیش‌فرض
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            className="gap-1.5 font-semibold shadow-sm"
          >
            <Save size={16} />
            ذخیره تنظیمات
          </Button>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-[var(--c-border)] scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                isActive
                  ? 'bg-[var(--c-primary)] text-[var(--c-primary-fg)] shadow-sm'
                  : 'text-[var(--c-muted-fg)] hover:text-[var(--c-fg)] hover:bg-[var(--c-muted)]/60'
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div className="space-y-6">
        {/* ==================== TAB 1: GENERAL ==================== */}
        {activeTab === 'general' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Building2 size={18} className="text-[var(--c-primary)]" />
                  هویت و مشخصات رسمی فارم
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">نام مجموعه / مجتمع پرورش طیور</label>
                  <Input
                    value={formState.complexName}
                    onChange={(e) => handleFieldChange('complexName', e.target.value)}
                    placeholder="مثال: مجتمع پرورش طیور مروارید"
                  />
                  <span className="text-[11px] text-[var(--c-muted-fg)]">
                    این نام در سربرگ فاکتورها، گزارش‌های رسمی و بالای داشبورد درج می‌شود.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">شناسه ملی / کد اقتصادی فارم</label>
                  <Input
                    value={formState.farmTaxId}
                    onChange={(e) => handleFieldChange('farmTaxId', e.target.value)}
                    placeholder="مثال: ۱۴۰۰۷۶۵۴۳۲۱"
                  />
                  <span className="text-[11px] text-[var(--c-muted-fg)]">
                    در فاکتورهای رسمی خرید و فروش و حواله‌های خروج انبار ثبت می‌گردد.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">شماره تماس پشتیبانی یا سرپرست فارم</label>
                  <Input
                    value={formState.supervisorPhone}
                    onChange={(e) => handleFieldChange('supervisorPhone', e.target.value)}
                    placeholder="مثال: ۰۹۱۲۳۴۵۶۷۸۹"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Layers size={18} className="text-[var(--c-primary)]" />
                  استانداردهای مالی و مقادیر
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">واحد پولی محاسبات و فاکتورها</label>
                  <Select
                    value={formState.currency}
                    onChange={(e) => handleFieldChange('currency', e.target.value as 'rial' | 'toman')}
                  >
                    <option value="rial">ریال ایران (IRR) — رسمی حسابداری</option>
                    <option value="toman">تومان (Toman) — معادل ۱۰ ریال</option>
                  </Select>
                  <div className="p-2.5 rounded-lg bg-[var(--c-muted)]/50 text-xs text-[var(--c-muted-fg)]">
                    پیش‌نمایش: یک میلیون ریال = {formState.currency === 'rial' ? '۱,۰۰۰,۰۰۰ ریال' : '۱۰۰,۰۰۰ تومان'}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">واحد پیش‌فرض اندازه‌گیری وزن</label>
                  <Select
                    value={formState.defaultWeightUnit}
                    onChange={(e) => handleFieldChange('defaultWeightUnit', e.target.value as 'kg' | 'ton')}
                  >
                    <option value="kg">کیلوگرم (Kg) — دان و مکمل‌ها</option>
                    <option value="ton">تُن (Ton) — خرید عمده نهاده</option>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">فرمت رسم‌الخط ارقام</label>
                  <Select
                    value={formState.numberFormat}
                    onChange={(e) => handleFieldChange('numberFormat', e.target.value as 'persian' | 'english')}
                  >
                    <option value="persian">ارقام فارسی (۱۲۳۴۵۶)</option>
                    <option value="english">ارقام لاتین (123456)</option>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">نوع گاه‌شمار پیش‌فرض</label>
                  <Select
                    value={formState.calendarType}
                    onChange={(e) => handleFieldChange('calendarType', e.target.value as 'jalali' | 'gregorian')}
                  >
                    <option value="jalali">هجری شمسی (جلالی) — رسمی</option>
                    <option value="gregorian">میلادی (Gregorian)</option>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== TAB 2: FLOCK STANDARDS ==================== */}
        {activeTab === 'flock' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Bird size={18} className="text-[var(--c-primary)]" />
                  مشخصات سویه و استاندارد پرورش
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">سویه و نژاد استاندارد طیور فارم</label>
                  <Select
                    value={formState.flockBreed}
                    onChange={(e) =>
                      handleFieldChange(
                        'flockBreed',
                        e.target.value as 'ross308' | 'cobb500' | 'arborAcres' | 'lohmann' | 'other'
                      )
                    }
                  >
                    <option value="ross308">راس ۳۰۸ (Ross 308) — گوشتی</option>
                    <option value="cobb500">کاب ۵۰۰ (Cobb 500) — گوشتی</option>
                    <option value="arborAcres">آربور ایکرز (Arbor Acres) — گوشتی</option>
                    <option value="lohmann">لوهمن (Lohmann) — تخم‌گذار</option>
                    <option value="other">سایر نژادها / سفارشی</option>
                  </Select>
                  <span className="text-[11px] text-[var(--c-muted-fg)]">
                    جدول رشد، منحنی وزن‌گیری و استاندارد احتیاجات دان متناسب با این نژاد کالیبره می‌شود.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">طول دوره استاندارد پرورش (روز)</label>
                  <Input
                    type="number"
                    value={formState.standardFlockPeriodDays}
                    onChange={(e) => handleFieldChange('standardFlockPeriodDays', Number(e.target.value) || 0)}
                    placeholder="45"
                  />
                  <span className="text-[11px] text-[var(--c-muted-fg)]">
                    تعداد روزهای پیش‌بینی شده از زمان جوجه‌ریزی تا پایان دوره و تخلیه سالن
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Sliders size={18} className="text-emerald-500" />
                  اهداف بهره‌وری و آستانه‌های حساس
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">
                    ضریب تبدیل خوراک هدف (Target FCR)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formState.targetFcr}
                    onChange={(e) => handleFieldChange('targetFcr', Number(e.target.value) || 0)}
                    placeholder="1.65"
                  />
                  <span className="text-[11px] text-[var(--c-muted-fg)]">
                    نسبت کیلوگرم دان مصرفی به کیلوگرم وزن زنده تولید شده (مثلاً ۱.۶۵)
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">
                    سقف هشدار تلفات روزانه سالن‌ها (درصد)
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formState.dailyMortalityAlertThresholdPercent}
                    onChange={(e) =>
                      handleFieldChange('dailyMortalityAlertThresholdPercent', Number(e.target.value) || 0)
                    }
                    placeholder="0.5"
                  />
                  <span className="text-[11px] text-[var(--c-muted-fg)]">
                    در صورتی که درصد تلفات در یک سالن از این مقدار عبور کند، هشدار وضعیت اضطراری ثبت می‌شود.
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== TAB 3: OPERATIONS & FEED ==================== */}
        {activeTab === 'operations' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Sliders size={18} className="text-[var(--c-primary)]" />
                  قوانین میکسر و بچ‌های دان‌سازی
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">
                    ظرفیت استاندارد هر بچ میکسر (کیلوگرم)
                  </label>
                  <Input
                    type="number"
                    value={formState.defaultMixerWeight}
                    onChange={(e) => handleFieldChange('defaultMixerWeight', Number(e.target.value) || 0)}
                    placeholder="3000"
                  />
                  <span className="text-[11px] text-[var(--c-muted-fg)]">
                    مبنای محاسبه در فرمول‌ساز و ثبت برگه‌های دان‌ریزی (پیش‌فرض: ۳,۰۰۰ کیلوگرم)
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">
                    سقف مجاز افت و پرت طبیعی دان (درصد)
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    value={formState.maxAllowedWastePercent}
                    onChange={(e) => handleFieldChange('maxAllowedWastePercent', Number(e.target.value) || 0)}
                    placeholder="2"
                  />
                  <span className="text-[11px] text-[var(--c-muted-fg)]">
                    در صورت ثبت پرت بالاتر از این مقدار، سیستم اپراتور را ملزم به درج یادداشت توجیهی می‌کند.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">
                    حداکثر تلرانس انحراف فرمول دان (درصد)
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    value={formState.formulaTolerancePercent}
                    onChange={(e) => handleFieldChange('formulaTolerancePercent', Number(e.target.value) || 0)}
                    placeholder="5"
                  />
                  <span className="text-[11px] text-[var(--c-muted-fg)]">
                    حداکثر درصد اختلاف مجاز در وزن اقلام ریزمغذی و کنسانتره در زمان ثبت بچ تولیدی
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Clock size={18} className="text-amber-500" />
                  قفل شبانه و انضباط ثبت مصرف
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">
                    ساعت قفل خودکار حواله‌های مصرف روزانه
                  </label>
                  <Select
                    value={
                      formState.dailyVoucherAutoLockHour !== null ? String(formState.dailyVoucherAutoLockHour) : 'none'
                    }
                    onChange={(e) =>
                      handleFieldChange(
                        'dailyVoucherAutoLockHour',
                        e.target.value === 'none' ? null : Number(e.target.value)
                      )
                    }
                  >
                    <option value="none">غیرفعال (قفل دستی توسط سرپرست)</option>
                    <option value="21">ساعت ۲۱:۰۰ شب</option>
                    <option value="22">ساعت ۲۲:۰۰ شب</option>
                    <option value="23">ساعت ۲۳:۰۰ شب (پایان شیفت کاری)</option>
                    <option value="24">ساعت ۲۴:۰۰ (بامداد روز بعد)</option>
                  </Select>
                  <span className="text-[11px] text-[var(--c-muted-fg)]">
                    پس از این ساعت، ویرایش حواله مصرف روزانه تنها با دسترسی مدیر ارشد امکان‌پذیر خواهد بود.
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)]">
                  <div>
                    <div className="text-xs font-semibold text-[var(--c-fg)]">
                      الزام ثبت توضیحات برای تعدیل موجودی
                    </div>
                    <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                      در زمان اصلاح انبار یا کسر/اضافه فیزیکی، درج علت اجباری باشد.
                    </div>
                  </div>
                  <Toggle
                    checked={formState.requireVoucherNotesOnAdjustment}
                    onChange={() =>
                      handleFieldChange('requireVoucherNotesOnAdjustment', !formState.requireVoucherNotesOnAdjustment)
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== TAB 4: INVENTORY SAFEGUARDS ==================== */}
        {activeTab === 'inventory' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <ShieldCheck size={18} className="text-emerald-500" />
                  حفاظت از یکپارچگی انبارداری
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)]">
                  <div>
                    <div className="text-xs font-semibold text-[var(--c-fg)]">
                      جلوگیری از منفی شدن موجودی انبار
                    </div>
                    <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                      مانع از صدور حواله خروج یا مصرف در صورت ناکافی بودن موجودی فیزیکی
                    </div>
                  </div>
                  <Toggle
                    checked={formState.preventNegativeInventory}
                    onChange={() =>
                      handleFieldChange('preventNegativeInventory', !formState.preventNegativeInventory)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">روش قیمت‌گذاری و ارزیابی انبار</label>
                  <Select
                    value={formState.inventoryCostingMethod}
                    onChange={(e) =>
                      handleFieldChange('inventoryCostingMethod', e.target.value as 'fifo' | 'weighted_average')
                    }
                  >
                    <option value="weighted_average">میانگین موزون متحرک (Weighted Average) — استاندارد مرغداری</option>
                    <option value="fifo">اولین صادره از اولین وارده (FIFO)</option>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)]">
                  <div>
                    <div className="text-xs font-semibold text-[var(--c-fg)]">
                      اجازه ثبت خرید بدون درج قیمت واحد
                    </div>
                    <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                      در شرایط ورود اضطراری بار قبل از وصول فاکتور مالی از تامین‌کننده
                    </div>
                  </div>
                  <Toggle
                    checked={formState.allowPurchasesWithoutCost}
                    onChange={() =>
                      handleFieldChange('allowPurchasesWithoutCost', !formState.allowPurchasesWithoutCost)
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <AlertTriangle size={18} className="text-amber-500" />
                  تنظیمات هوشمند نقطه سفارش کالا
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)]">
                  <div>
                    <div className="text-xs font-semibold text-[var(--c-fg)]">
                      فعال‌سازی نشانگر هشدارهای نقطه سفارش در داشبورد
                    </div>
                    <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                      نمایش بج قرمز تعداد کالاهای نیازمند خرید روی کاشی نقطه سفارش
                    </div>
                  </div>
                  <Toggle
                    checked={formState.reorderAlertsEnabled}
                    onChange={() => handleFieldChange('reorderAlertsEnabled', !formState.reorderAlertsEnabled)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">
                    حاشیه اطمینان هشدار نقطه سفارش (Buffer %)
                  </label>
                  <Input
                    type="number"
                    value={formState.reorderBufferPercent}
                    onChange={(e) => handleFieldChange('reorderBufferPercent', Number(e.target.value) || 0)}
                    placeholder="10"
                  />
                  <span className="text-[11px] text-[var(--c-muted-fg)]">
                    افزودن درصد احتیاط به حداقل موجودی پیش از صدور هشدار کمبود
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== TAB 5: OFFLINE & DATA ==================== */}
        {activeTab === 'offline' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Wifi size={18} className="text-[var(--c-primary)]" />
                  موتور آفلاین و همگام‌سازی سالن‌ها
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">
                    فاصله زمانی همگام‌سازی خودکار در پس‌زمینه (ثانیه)
                  </label>
                  <Input
                    type="number"
                    value={formState.autoSyncIntervalSeconds}
                    onChange={(e) => handleFieldChange('autoSyncIntervalSeconds', Number(e.target.value) || 10)}
                    placeholder="30"
                  />
                  <span className="text-[11px] text-[var(--c-muted-fg)]">
                    در شرایط اتصال پایدار، تراکنش‌های ثبت شده سالن هر چند ثانیه به سرور ارسال شوند.
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)]">
                  <div>
                    <div className="text-xs font-semibold text-[var(--c-fg)]">
                      ذخیره آفلاین اطلاعات پایه (فارم‌ها، سالن‌ها، اقلام)
                    </div>
                    <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                      امکان بارگذاری سریع فرم‌ها حتی در زمان قطعی کامل اینترنت مزرعه
                    </div>
                  </div>
                  <Toggle
                    checked={formState.cacheReferenceDataOffline}
                    onChange={() =>
                      handleFieldChange('cacheReferenceDataOffline', !formState.cacheReferenceDataOffline)
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)]">
                  <div>
                    <div className="text-xs font-semibold text-[var(--c-fg)]">
                      نگهداری خودکار پیش‌نویس حواله‌های ناقص
                    </div>
                    <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                      در صورت بسته شدن ناگهانی مرورگر، مقادیر وارد شده از بین نروند.
                    </div>
                  </div>
                  <Toggle
                    checked={formState.preserveDraftVouchers}
                    onChange={() => handleFieldChange('preserveDraftVouchers', !formState.preserveDraftVouchers)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Database size={18} className="text-sky-500" />
                  مدیریت پایگاه داده محلی (IndexedDB)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--c-muted)]/40 border border-[var(--c-border)]">
                  <div>
                    <div className="text-xs font-semibold text-[var(--c-fg)]">وضعیت موتور دیتابیس محلی</div>
                    <div className="text-[11px] text-[var(--c-muted-fg)]">کتابخانه Dexie / IndexedDB</div>
                  </div>
                  <Badge variant={isOfflineReady ? 'success' : 'warning'}>
                    {isOfflineReady ? 'فعال و آماده آفلاین' : 'در حال بارگذاری'}
                  </Badge>
                </div>

                <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-200 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Info size={16} />
                    پاک‌سازی کش موقت کلاینت
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    اگر تغییراتی در سرور داده‌اید که در مرورگر اپراتور به‌روز نشده است، با این عملیات حافظه محلی
                    مرورگر نوسازی می‌شود.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPurgeCacheConfirmOpen(true)}
                    className="w-full text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                  >
                    تخلیه حافظه کش آفلاین مرورگر
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== TAB 6: REPORTS & UI ==================== */}
        {activeTab === 'reports' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <FileSpreadsheet size={18} className="text-[var(--c-primary)]" />
                  تنظیمات چاپ و گزارشات رسمی
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">
                    تعداد ردیف پیش‌فرض در هر صفحه از جداول گزارش
                  </label>
                  <Select
                    value={String(formState.reportPageSize)}
                    onChange={(e) => handleFieldChange('reportPageSize', Number(e.target.value) || 25)}
                  >
                    <option value="15">۱۵ ردیف در صفحه</option>
                    <option value="25">۲۵ ردیف در صفحه (استاندارد)</option>
                    <option value="50">۵۰ ردیف در صفحه</option>
                    <option value="100">۱۰۰ ردیف در صفحه</option>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">متن پاورقی رسمی گزارشات و خروجی اکسل</label>
                  <Input
                    value={formState.reportFooterText}
                    onChange={(e) => handleFieldChange('reportFooterText', e.target.value)}
                    placeholder="سامانه یکپارچه مدیریت فارم‌های مرغداری مروارید"
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)]">
                  <div>
                    <div className="text-xs font-semibold text-[var(--c-fg)]">
                      مخفی‌سازی اقلام با موجودی صفر در گزارش موجودی انبار
                    </div>
                    <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                      فقط اقلامی که موجودی فیزیکی دارند در جدول نمایش داده شوند.
                    </div>
                  </div>
                  <Toggle
                    checked={formState.hideZeroStockItems}
                    onChange={() => handleFieldChange('hideZeroStockItems', !formState.hideZeroStockItems)}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)]">
                  <div>
                    <div className="text-xs font-semibold text-[var(--c-fg)]">
                      درج نشان رسمی فارم در برگه چاپ گزارش‌ها
                    </div>
                    <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                      لوگوی مجتمع در فایل خروجی PDF و چاپگر درج شود.
                    </div>
                  </div>
                  <Toggle
                    checked={formState.showLogoOnReports}
                    onChange={() => handleFieldChange('showLogoOnReports', !formState.showLogoOnReports)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Table size={18} className="text-indigo-500" />
                  تنظیمات کاربری و تجربه دیداری
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)]">
                  <div>
                    <div className="text-xs font-semibold text-[var(--c-fg)]">
                      پخش هشدار صوتی برای وقایع حیاتی
                    </div>
                    <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                      پخش صدای بیپ در زمان بروز خطای ثبت یا عبور از سقف مجاز تلفات
                    </div>
                  </div>
                  <Toggle
                    checked={formState.enableAudioAlerts}
                    onChange={() => handleFieldChange('enableAudioAlerts', !formState.enableAudioAlerts)}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)]">
                  <div>
                    <div className="text-xs font-semibold text-[var(--c-fg)]">
                      حالت فشرده جداول اطلاعاتی (Dense Table Mode)
                    </div>
                    <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                      کاهش فاصله ردیف‌ها برای نمایش حداکثر اطلاعات در صفحات با ابعاد کوچک‌تر
                    </div>
                  </div>
                  <Toggle
                    checked={formState.enableDenseTableMode}
                    onChange={() => handleFieldChange('enableDenseTableMode', !formState.enableDenseTableMode)}
                  />
                </div>

                <div className="p-3 rounded-xl bg-[var(--c-muted)]/40 border border-[var(--c-border)] text-xs text-[var(--c-muted-fg)]">
                  این تنظیمات تجربه دیداری اپراتورها و سرپرستان را ارتقا داده و عملکرد روی تبلت‌های سالن را بهبود می‌بخشد.
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== TAB 7: SYSTEM HEALTH & DANGER ZONE ==================== */}
        {activeTab === 'system' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Server size={18} className="text-[var(--c-primary)]" />
                  سلامت زیرساخت و آزمون اتصال سرور
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] flex flex-col justify-between">
                    <span className="text-xs text-[var(--c-muted-fg)] font-medium">وضعیت اتصال به Supabase</span>
                    <div className="flex items-center gap-2 mt-2">
                      {dbPingMs !== null && dbPingMs >= 0 ? (
                        <>
                          <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                            برقرار ({toPersianDigits(dbPingMs)} میلی‌ثانیه)
                          </span>
                        </>
                      ) : dbPingMs === -1 ? (
                        <>
                          <span className="h-3 w-3 rounded-full bg-red-500" />
                          <span className="text-sm font-bold text-red-600">قطع ارتباط</span>
                        </>
                      ) : (
                        <span className="text-sm text-[var(--c-muted-fg)]">در حال بررسی...</span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] flex flex-col justify-between">
                    <span className="text-xs text-[var(--c-muted-fg)] font-medium">پایگاه داده آفلاین مرورگر</span>
                    <div className="flex items-center gap-2 mt-2">
                      {isOfflineReady ? (
                        <>
                          <CheckCircle2 size={16} className="text-emerald-500" />
                          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">آماده و سالم</span>
                        </>
                      ) : (
                        <span className="text-sm text-[var(--c-muted-fg)]">در حال آماده‌سازی</span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] flex flex-col justify-between">
                    <span className="text-xs text-[var(--c-muted-fg)] font-medium">نسخه کلاینت سامانه</span>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-sm font-bold text-[var(--c-fg)]">v1.2.0 (Singlefile)</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={checkServerLatency}
                    isLoading={isPinging}
                    className="gap-1.5"
                  >
                    <RefreshCw size={14} className={isPinging ? 'animate-spin' : ''} />
                    تست مجدد اتصال به سرور
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Factory Reset Danger Zone Card */}
            <AdminFactoryResetCard />
          </div>
        )}
      </div>

      {/* Reset Confirmation Dialog */}
      <ConfirmDialog
        isOpen={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="بازنشانی تنظیمات به حالت اولیه"
        message="آیا مطمئن هستید که می‌خواهید کلیه تنظیمات این صفحه را به مقادیر پیش‌فرض بازگردانید؟ اطلاعات ثبت شده در پایگاه داده تغییری نخواهند کرد."
        confirmLabel="بازنشانی به پیش‌فرض"
        cancelLabel="انصراف"
        onConfirm={handleResetToDefaults}
      />

      {/* Purge Cache Confirmation Dialog */}
      <ConfirmDialog
        isOpen={purgeCacheConfirmOpen}
        onClose={() => setPurgeCacheConfirmOpen(false)}
        title="پاک‌سازی کش محلی مرورگر"
        message="این عملیات کش موقت IndexedDB در مرورگر فعلی را پاک می‌کند. داده‌های سرور دست‌نخورده باقی می‌مانند. آیا ادامه می‌دهید؟"
        confirmLabel="پاک‌سازی کش"
        cancelLabel="انصراف"
        onConfirm={handlePurgeLocalCache}
        isLoading={isPurgingCache}
        variant="destructive"
      />
    </div>
  );
};

export default AdminSettingsPage;
