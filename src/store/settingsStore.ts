import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SystemSettings {
  // 1. عمومی و هویت فارم
  complexName: string;
  currency: 'rial' | 'toman';
  defaultWeightUnit: 'kg' | 'ton';
  numberFormat: 'persian' | 'english';
  calendarType: 'jalali' | 'gregorian';
  farmTaxId: string;
  supervisorPhone: string;

  // 2. عملیات و دان‌سازی
  defaultMixerWeight: number; // کیلوگرم
  maxAllowedWastePercent: number; // درصد مجاز پرت
  reorderAlertsEnabled: boolean;
  reorderBufferPercent: number; // درصد حاشیه اطمینان نقطه سفارش
  dailyVoucherAutoLockHour: number | null; // ساعت قفل خودکار حواله (مثلاً 23)
  requireVoucherNotesOnAdjustment: boolean;
  formulaTolerancePercent: number; // درصد تلرانس مجاز مغایرت فرمول دان

  // 3. استاندارد پرورش و گله طیور
  flockBreed: 'ross308' | 'cobb500' | 'arborAcres' | 'lohmann' | 'other';
  standardFlockPeriodDays: number; // طول دوره پرورش (روز)
  targetFcr: number; // ضریب تبدیل خوراک هدف (Target FCR)
  dailyMortalityAlertThresholdPercent: number; // آستانه هشدار تلفات روزانه (%)

  // 4. ایمنی انبار و حسابداری
  preventNegativeInventory: boolean; // جلوگیری از موجودی منفی
  inventoryCostingMethod: 'fifo' | 'weighted_average';
  allowPurchasesWithoutCost: boolean;

  // 5. امنیت و نشست‌ها
  sessionTimeoutMinutes: number; // 0 یعنی نامحدود
  requireStrongPassword: boolean;
  detailedActivityAudit: boolean;

  // 6. آفلاین و همگام‌سازی
  autoSyncIntervalSeconds: number;
  cacheReferenceDataOffline: boolean;
  preserveDraftVouchers: boolean;

  // 7. گزارشات، رابط کاربری و خروجی
  reportPageSize: number;
  reportFooterText: string;
  hideZeroStockItems: boolean;
  showLogoOnReports: boolean;
  enableAudioAlerts: boolean;
  enableDenseTableMode: boolean;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  // عمومی
  complexName: 'مجتمع پرورش طیور مروارید',
  currency: 'rial',
  defaultWeightUnit: 'kg',
  numberFormat: 'persian',
  calendarType: 'jalali',
  farmTaxId: '',
  supervisorPhone: '',

  // عملیات و دان‌سازی
  defaultMixerWeight: 3000,
  maxAllowedWastePercent: 2,
  reorderAlertsEnabled: true,
  reorderBufferPercent: 10,
  dailyVoucherAutoLockHour: 23,
  requireVoucherNotesOnAdjustment: true,
  formulaTolerancePercent: 5,

  // استاندارد پرورش و گله طیور
  flockBreed: 'ross308',
  standardFlockPeriodDays: 45,
  targetFcr: 1.65,
  dailyMortalityAlertThresholdPercent: 0.5,

  // ایمنی انبار و حسابداری
  preventNegativeInventory: true,
  inventoryCostingMethod: 'weighted_average',
  allowPurchasesWithoutCost: false,

  // امنیت
  sessionTimeoutMinutes: 60,
  requireStrongPassword: true,
  detailedActivityAudit: true,

  // آفلاین
  autoSyncIntervalSeconds: 30,
  cacheReferenceDataOffline: true,
  preserveDraftVouchers: true,

  // گزارشات و خروجی
  reportPageSize: 25,
  reportFooterText: 'سامانه یکپارچه مدیریت فارم‌های مرغداری مروارید',
  hideZeroStockItems: false,
  showLogoOnReports: true,
  enableAudioAlerts: false,
  enableDenseTableMode: false,
};

interface SettingsState {
  settings: SystemSettings;
  updateSettings: (newSettings: Partial<SystemSettings>) => void;
  resetSettings: () => void;
  exportSettingsJson: () => string;
  importSettingsJson: (jsonString: string) => boolean;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,

      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      resetSettings: () =>
        set({
          settings: DEFAULT_SETTINGS,
        }),

      exportSettingsJson: () => {
        return JSON.stringify(get().settings, null, 2);
      },

      importSettingsJson: (jsonString: string) => {
        try {
          const parsed = JSON.parse(jsonString);
          if (typeof parsed !== 'object' || parsed === null) return false;
          set((state) => ({
            settings: { ...state.settings, ...parsed },
          }));
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'morvarid_system_settings_v1',
    }
  )
);
