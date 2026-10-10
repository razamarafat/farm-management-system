import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Building2,
  Scale,
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
  ShieldCheck,
  Bell,
  Table,
  Warehouse,
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
import { useFarms } from '@/hooks/useFarms';
import { supabase } from '@/lib/supabase';
import { toPersianDigits } from '@/utils/persianNumbers';
import { APP_VERSION } from '@/utils/constants';

type TabKey = 'general' | 'operations' | 'inventory' | 'offline' | 'reports' | 'system';

export const AdminQuickSettingsCard = () => {
  const { settings, updateSettings, resetSettings, exportSettingsJson, importSettingsJson } = useSettingsStore();
  const { farms, isLoading: isLoadingFarms } = useFarms({ search: '', status: 'active' });
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

  const handleFarmMixerWeightChange = (farmId: string, valStr: string) => {
    const parsed = parseFloat(valStr);
    setFormState((prev) => ({
      ...prev,
      farmMixerWeights: {
        ...(prev.farmMixerWeights || {}),
        [farmId]: isNaN(parsed) || parsed <= 0 ? 0 : parsed,
      },
    }));
  };

  const handleResetFarmMixer = (farmId: string) => {
    setFormState((prev) => {
      const next = { ...(prev.farmMixerWeights || {}) };
      delete next[farmId];
      return {
        ...prev,
        farmMixerWeights: next,
      };
    });
  };

  const handleSave = () => {
    updateSettings(formState);
    toast.success('تنظیمات سامانه با موفقیت ذخیره شد.');
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
    toast.success('فایل پشتیبان تنظیمات دانلود شد.');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const success = importSettingsJson(content);
      if (success) {
        toast.success('تنظیمات با موفقیت فراخوانی شد.');
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
    { key: 'general', label: 'عمومی و مالی', icon: Building2 },
    { key: 'operations', label: 'دان‌سازی و مصرف', icon: Sliders },
    { key: 'inventory', label: 'انبارداری و سفارش', icon: Scale },
    { key: 'offline', label: 'آفلاین و داده‌ها', icon: Wifi },
    { key: 'reports', label: 'گزارشات و رابط کاربری', icon: FileSpreadsheet },
    { key: 'system', label: 'سلامت سرور و اتصال', icon: Server },
  ];

  return (
    <Card id="settings-card" className="border-[var(--c-border)] shadow-sm overflow-hidden scroll-mt-6">
      {/* Header with Title and Global Actions */}
      <CardHeader className="bg-[var(--c-muted)]/30 border-b border-[var(--c-border)] pb-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--c-primary)]/10 text-[var(--c-primary)]">
              <Sliders size={20} />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-[var(--c-fg)]">
                تنظیمات و پیکربندی سامانه
              </CardTitle>
              <p className="text-xs text-[var(--c-muted-fg)] mt-0.5">
                مدیریت جامع هویت فارم، دان‌سازی، ایمنی انبار، موتور آفلاین و سلامت سرور
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="file"
              id="import-settings-card-input"
              accept=".json"
              onChange={handleImportJson}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('import-settings-card-input')?.click()}
              className="gap-1.5 text-xs h-8"
              title="فراخوانی از فایل JSON"
            >
              <Upload size={13} />
              <span>فراخوانی JSON</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportJson}
              className="gap-1.5 text-xs h-8"
              title="خروجی فایل JSON"
            >
              <Download size={13} />
              <span>پشتیبان JSON</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResetConfirmOpen(true)}
              className="gap-1 text-xs h-8 text-[var(--c-muted-fg)] hover:text-[var(--c-destructive)]"
            >
              <RotateCcw size={13} />
              <span>پیش‌فرض</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              className="gap-1.5 text-xs h-8 font-semibold shadow-sm"
            >
              <Save size={14} />
              <span>ذخیره تنظیمات</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-5">
        {/* Metric Overview Snapshot (4 clean metric cards) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] flex flex-col justify-between">
            <span className="text-[11px] text-[var(--c-muted-fg)] font-medium">نام مجتمع</span>
            <span className="text-xs font-bold text-[var(--c-fg)] mt-1 truncate" title={formState.complexName}>
              {formState.complexName || 'نامشخص'}
            </span>
          </div>

          <div className="p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] flex flex-col justify-between">
            <span className="text-[11px] text-[var(--c-muted-fg)] font-medium">ظرفیت پیش‌فرض میکسر</span>
            <span className="text-sm font-bold text-[var(--c-fg)] mt-1">
              {toPersianDigits(formState.defaultMixerWeight.toLocaleString())} کیلوگرم
            </span>
            <span className="text-[10px] text-[var(--c-muted-fg)] mt-0.5">
              {toPersianDigits(
                Object.values(formState.farmMixerWeights || {}).filter((w) => w > 0).length
              )}{' '}
              فارم با ظرفیت اختصاصی
            </span>
          </div>

          <div className="p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] flex flex-col justify-between">
            <span className="text-[11px] text-[var(--c-muted-fg)] font-medium">واحد مالی پایه</span>
            <span className="text-sm font-bold text-[var(--c-fg)] mt-1">
              {formState.currency === 'rial' ? 'ریال ایران (IRR)' : 'تومان (۱۰ ریال)'}
            </span>
          </div>

          <div className="p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] flex flex-col justify-between">
            <span className="text-[11px] text-[var(--c-muted-fg)] font-medium">قفل خودکار روزانه</span>
            <span className="text-sm font-bold text-[var(--c-fg)] mt-1 flex items-center gap-1">
              <Clock size={13} className="text-amber-500" />
              {formState.dailyVoucherAutoLockHour !== null
                ? `ساعت ${toPersianDigits(formState.dailyVoucherAutoLockHour)}:۰۰`
                : 'غیرفعال (دستی)'}
            </span>
          </div>
        </div>

        {/* Tab Navigation Buttons inside the Card */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-[var(--c-border)] scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? 'bg-[var(--c-primary)] text-[var(--c-primary-fg)] shadow-sm'
                    : 'text-[var(--c-muted-fg)] hover:text-[var(--c-fg)] hover:bg-[var(--c-muted)]/60'
                }`}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Panels */}
        <div className="pt-1">
          {/* ==================== TAB 1: GENERAL & FINANCE ==================== */}
          {activeTab === 'general' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--c-fg)]">
                  <Building2 size={16} className="text-[var(--c-primary)]" />
                  <span>هویت و مشخصات رسمی مجموعه</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">نام مجموعه / مجتمع پرورش طیور</label>
                  <Input
                    value={formState.complexName}
                    onChange={(e) => handleFieldChange('complexName', e.target.value)}
                    placeholder="مجتمع پرورش طیور مروارید"
                  />
                  <span className="text-[11px] text-[var(--c-muted-fg)]">
                    در سربرگ فاکتورها، گزارش‌های رسمی و بالای داشبورد درج می‌شود.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">شناسه ملی / کد اقتصادی</label>
                  <Input
                    value={formState.farmTaxId}
                    onChange={(e) => handleFieldChange('farmTaxId', e.target.value)}
                    placeholder="مثال: ۱۴۰۰۷۶۵۴۳۲۱"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">شماره تماس سرپرست یا پشتیبانی</label>
                  <Input
                    value={formState.supervisorPhone}
                    onChange={(e) => handleFieldChange('supervisorPhone', e.target.value)}
                    placeholder="مثال: ۰۹۱۲۳۴۵۶۷۸۹"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--c-fg)]">
                  <Layers size={16} className="text-[var(--c-primary)]" />
                  <span>استانداردهای مالی و مقادیر</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">واحد پولی محاسبات و فاکتورها</label>
                  <Select
                    value={formState.currency}
                    onChange={(e) => handleFieldChange('currency', e.target.value as 'rial' | 'toman')}
                  >
                    <option value="rial">ریال ایران (IRR) — رسمی حسابداری</option>
                    <option value="toman">تومان (Toman) — معادل ۱۰ ریال</option>
                  </Select>
                  <div className="p-2 rounded-lg bg-[var(--c-muted)]/50 text-[11px] text-[var(--c-muted-fg)]">
                    پیش‌نمایش: یک میلیون ریال = {formState.currency === 'rial' ? '۱,۰۰۰,۰۰۰ ریال' : '۱۰۰,۰۰۰ تومان'}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--c-fg)]">واحد پیش‌فرض وزن</label>
                  <Select
                    value={formState.defaultWeightUnit}
                    onChange={(e) => handleFieldChange('defaultWeightUnit', e.target.value as 'kg' | 'ton')}
                  >
                    <option value="kg">کیلوگرم (Kg) — دان و مکمل‌ها</option>
                    <option value="ton">تُن (Ton) — خرید عمده نهاده</option>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--c-fg)]">رسم‌الخط ارقام</label>
                    <Select
                      value={formState.numberFormat}
                      onChange={(e) => handleFieldChange('numberFormat', e.target.value as 'persian' | 'english')}
                    >
                      <option value="persian">فارسی (۱۲۳۴)</option>
                      <option value="english">لاتین (1234)</option>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--c-fg)]">گاه‌شمار</label>
                    <Select
                      value={formState.calendarType}
                      onChange={(e) => handleFieldChange('calendarType', e.target.value as 'jalali' | 'gregorian')}
                    >
                      <option value="jalali">شمسی</option>
                      <option value="gregorian">میلادی</option>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 2: OPERATIONS & FEED ==================== */}
          {activeTab === 'operations' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] space-y-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-[var(--c-fg)]">
                    <Sliders size={16} className="text-[var(--c-primary)]" />
                    <span>قوانین میکسر و استانداردهای دان‌سازی</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--c-fg)]">
                      ظرفیت پیش‌فرض سراسری هر بچ میکسر (کیلوگرم)
                    </label>
                    <Input
                      type="number"
                      value={formState.defaultMixerWeight}
                      onChange={(e) => handleFieldChange('defaultMixerWeight', Number(e.target.value) || 0)}
                      placeholder="3000"
                    />
                    <span className="text-[11px] text-[var(--c-muted-fg)]">
                      مبنای سراسری فرمول‌ساز در صورت عدم تعیین ظرفیت اختصاصی برای فارم (پیش‌فرض: ۳,۰۰۰ کیلوگرم)
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--c-fg)]">
                      طول دوره استاندارد پرورش گله (روز)
                    </label>
                    <Input
                      type="number"
                      value={formState.flockCycleStandardDays}
                      onChange={(e) => handleFieldChange('flockCycleStandardDays', Number(e.target.value) || 45)}
                      placeholder="45"
                    />
                    <span className="text-[11px] text-[var(--c-muted-fg)]">
                      مبنای منحنی‌های مصرف جیره استاندارد و پیش‌بینی تخلیه فارم (معمولاً ۴۲ تا ۴۹ روز)
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
                      حداکثر اختلاف مجاز در وزن اقلام ریزمغذی و کنسانتره در زمان ثبت بچ تولیدی
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] space-y-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-[var(--c-fg)]">
                    <Clock size={16} className="text-amber-500" />
                    <span>انضباط زمانی و قفل ثبت مصرف</span>
                  </div>

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

                  <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)] mt-2">
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
                </div>
              </div>

              {/* Dedicated Card for Per-Farm Mixer Batch Sizes */}
              <div className="p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--c-border)] pb-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-[var(--c-fg)]">
                    <Warehouse size={16} className="text-[var(--c-primary)]" />
                    <span>ظرفیت اختصاصی بچ میکسر به تفکیک فارم‌ها</span>
                  </div>
                  <span className="text-[11px] text-[var(--c-muted-fg)]">
                    دستگاه‌های میکسر در فارم‌های مختلف می‌توانند ظرفیت‌های متفاوتی (مثلاً ۲، ۳ یا ۴ تن) داشته باشند.
                  </span>
                </div>

                {isLoadingFarms ? (
                  <div className="p-6 text-center text-xs text-[var(--c-muted-fg)]">
                    در حال دریافت فهرست فارم‌ها از پایگاه داده...
                  </div>
                ) : farms.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--c-muted-fg)] border border-dashed border-[var(--c-border)] rounded-xl">
                    هیچ فارم فعالی در سامانه ثبت نشده است
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="border-b border-[var(--c-border)] text-[var(--c-muted-fg)]">
                          <th className="pb-2.5 font-semibold">نام و کد فارم</th>
                          <th className="pb-2.5 font-semibold">وضعیت تنظیم</th>
                          <th className="pb-2.5 font-semibold w-56">ظرفیت هر بچ (کیلوگرم)</th>
                          <th className="pb-2.5 font-semibold w-28 text-center">عملیات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--c-border)]">
                        {farms.map((farm) => {
                          const customWeight = formState.farmMixerWeights?.[farm.id];
                          const hasCustom = typeof customWeight === 'number' && customWeight > 0;
                          const effectiveWeight = hasCustom ? customWeight : formState.defaultMixerWeight;

                          return (
                            <tr key={farm.id} className="hover:bg-[var(--c-muted)]/30 transition-colors">
                              <td className="py-3 font-medium text-[var(--c-fg)]">
                                <div className="flex items-center gap-2">
                                  <Warehouse size={14} className="text-[var(--c-muted-fg)]" />
                                  <span>{farm.name}</span>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                                    کد {toPersianDigits(farm.code)}
                                  </Badge>
                                </div>
                              </td>

                              <td className="py-3">
                                {hasCustom ? (
                                  <Badge variant="success" className="text-[11px] gap-1">
                                    <CheckCircle2 size={12} />
                                    <span>اختصاصی ({toPersianDigits(effectiveWeight.toLocaleString())} کیلوگرم)</span>
                                  </Badge>
                                ) : (
                                  <Badge variant="neutral" className="text-[11px]">
                                    <span>پیروی از پیش‌فرض ({toPersianDigits(effectiveWeight.toLocaleString())} کیلوگرم)</span>
                                  </Badge>
                                )}
                              </td>

                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    value={hasCustom ? customWeight : ''}
                                    placeholder={`${toPersianDigits(formState.defaultMixerWeight)} (پیش‌فرض)`}
                                    onChange={(e) => handleFarmMixerWeightChange(farm.id, e.target.value)}
                                    className="h-8 text-xs font-mono"
                                  />
                                  <span className="text-[11px] text-[var(--c-muted-fg)] whitespace-nowrap">کیلوگرم</span>
                                </div>
                              </td>

                              <td className="py-3 text-center">
                                {hasCustom ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleResetFarmMixer(farm.id)}
                                    className="text-[11px] text-[var(--c-muted-fg)] hover:text-red-500 h-7 px-2"
                                    title="حذف مقدار اختصاصی و بازگشت به پیش‌فرض سراسری"
                                  >
                                    حذف اختصاصی
                                  </Button>
                                ) : (
                                  <span className="text-[11px] text-[var(--c-muted-fg)]">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-[var(--c-muted)]/40 border border-[var(--c-border)] text-[11px] text-[var(--c-muted-fg)] leading-relaxed">
                  نکته: در بخش مدیریت فرمول‌های دان و ثبت مصرف روزانه هر فارم، ظرفیت بچ میکسر اختصاصی آن فارم به صورت خودکار مبنای محاسبه قرار می‌گیرد.
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 3: INVENTORY & REORDER ==================== */}
          {activeTab === 'inventory' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--c-fg)]">
                  <ShieldCheck size={16} className="text-emerald-500" />
                  <span>حفاظت از یکپارچگی انبارداری</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)]">
                  <div>
                    <div className="text-xs font-semibold text-[var(--c-fg)]">
                      جلوگیری از منفی شدن موجودی انبار
                    </div>
                    <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                      مانع از صدور حواله خروج یا مصرف در صورت ناکافی بودن موجودی فیزیکی واقعی
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
                  <label className="text-xs font-semibold text-[var(--c-fg)]">روش ارزیابی و قیمت‌گذاری انبار</label>
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
              </div>

              <div className="p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--c-fg)]">
                  <Bell size={16} className="text-amber-500" />
                  <span>تنظیمات هوشمند نقطه سفارش کالا</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)]">
                  <div>
                    <div className="text-xs font-semibold text-[var(--c-fg)]">
                      فعال‌سازی نشانگر هشدارهای نقطه سفارش در داشبورد
                    </div>
                    <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                      نمایش بَج قرمز تعداد کالاهای نیازمند خرید روی کاشی نقطه سفارش
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
              </div>
            </div>
          )}

          {/* ==================== TAB 4: OFFLINE & DATA ==================== */}
          {activeTab === 'offline' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--c-fg)]">
                  <Wifi size={16} className="text-[var(--c-primary)]" />
                  <span>موتور آفلاین و همگام‌سازی سالن‌ها</span>
                </div>

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
              </div>

              <div className="p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--c-fg)]">
                  <Database size={16} className="text-sky-500" />
                  <span>مدیریت پایگاه داده محلی مرورگر (IndexedDB)</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--c-muted)]/40 border border-[var(--c-border)]">
                  <div>
                    <div className="text-xs font-semibold text-[var(--c-fg)]">وضعیت موتور دیتابیس محلی</div>
                    <div className="text-[11px] text-[var(--c-muted-fg)]">کتابخانه Dexie / IndexedDB</div>
                  </div>
                  <Badge variant={isOfflineReady ? 'success' : 'warning'}>
                    {isOfflineReady ? 'فعال و آماده آفلاین' : 'در حال بارگذاری'}
                  </Badge>
                </div>

                <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-200 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Info size={15} />
                    پاک‌سازی کش موقت کلاینت
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    اگر تغییراتی در سرور داده‌اید که در مرورگر فعلی به‌روز نشده است، با این عملیات حافظه محلی
                    مرورگر نوسازی می‌شود.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPurgeCacheConfirmOpen(true)}
                    className="w-full text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-xs"
                  >
                    تخلیه حافظه کش آفلاین مرورگر
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 5: REPORTS & UI ==================== */}
          {activeTab === 'reports' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--c-fg)]">
                  <FileSpreadsheet size={16} className="text-[var(--c-primary)]" />
                  <span>تنظیمات چاپ و گزارشات رسمی</span>
                </div>

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
                      فقط اقلام دارای موجودی فیزیکی در جدول نمایش داده شوند.
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
              </div>

              <div className="p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--c-fg)]">
                  <Table size={16} className="text-indigo-500" />
                  <span>تجربه کاربری و دیداری</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--c-border)]">
                  <div>
                    <div className="text-xs font-semibold text-[var(--c-fg)]">
                      پخش هشدار صوتی برای وقایع حیاتی
                    </div>
                    <div className="text-[11px] text-[var(--c-muted-fg)] mt-0.5">
                      پخش صدای بیپ در زمان بروز خطای ثبت یا کسری موجودی
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
                      کاهش فاصله ردیف‌ها برای نمایش حداکثر داده‌ها در صفحات با ابعاد کوچک‌تر
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
              </div>
            </div>
          )}

          {/* ==================== TAB 6: SYSTEM HEALTH ==================== */}
          {activeTab === 'system' && (
            <div className="p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--c-fg)]">
                <Server size={16} className="text-[var(--c-primary)]" />
                <span>سلامت زیرساخت و آزمون اتصال سرور</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] flex flex-col justify-between">
                  <span className="text-[11px] text-[var(--c-muted-fg)] font-medium">وضعیت اتصال به Supabase</span>
                  <div className="flex items-center gap-2 mt-2">
                    {dbPingMs !== null && dbPingMs >= 0 ? (
                      <>
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          برقرار ({toPersianDigits(dbPingMs)} میلی‌ثانیه)
                        </span>
                      </>
                    ) : dbPingMs === -1 ? (
                      <>
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                        <span className="text-xs font-bold text-red-600">قطع ارتباط</span>
                      </>
                    ) : (
                      <span className="text-xs text-[var(--c-muted-fg)]">در حال بررسی...</span>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] flex flex-col justify-between">
                  <span className="text-[11px] text-[var(--c-muted-fg)] font-medium">پایگاه داده آفلاین مرورگر</span>
                  <div className="flex items-center gap-2 mt-2">
                    {isOfflineReady ? (
                      <>
                        <CheckCircle2 size={15} className="text-emerald-500" />
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">آماده و سالم</span>
                      </>
                    ) : (
                      <span className="text-xs text-[var(--c-muted-fg)]">در حال آماده‌سازی</span>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] flex flex-col justify-between">
                  <span className="text-[11px] text-[var(--c-muted-fg)] font-medium">نسخه کلاینت سامانه</span>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs font-bold text-[var(--c-fg)]">v{APP_VERSION} (Singlefile)</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkServerLatency}
                  isLoading={isPinging}
                  className="gap-1.5 text-xs h-8"
                >
                  <RefreshCw size={13} className={isPinging ? 'animate-spin' : ''} />
                  تست مجدد اتصال به سرور
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>

      {/* Reset Confirmation Dialog */}
      <ConfirmDialog
        isOpen={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="بازنشانی تنظیمات به حالت اولیه"
        message="آیا مطمئن هستید که می‌خواهید کلیه تنظیمات این کارت را به مقادیر پیش‌فرض بازگردانید؟ اطلاعات ثبت شده در پایگاه داده تغییری نخواهند کرد."
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
    </Card>
  );
};

export default AdminQuickSettingsCard;
