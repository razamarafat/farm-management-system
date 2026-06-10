// =============================================================================
// CONSUMPTION MODULE TYPES
// =============================================================================

export type VoucherCategory = 'feed' | 'packaging';
export type VoucherStatus = 'draft' | 'submitted' | 'locked' | 'reverted';
export type TransactionType = 'purchase' | 'consumption' | 'waste' | 'transfer_in' | 'transfer_out' | 'adjustment' | 'initial';

// --------------------------------------------
// Database Models
// --------------------------------------------
export interface FarmItem {
  id: string;
  farm_id: string;
  category: VoucherCategory;
  name: string;
  unit: string;
  priority: number;
  reorder_point: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FarmHall {
  id: string;
  farm_id: string;
  hall_number: number;
  name: string | null;
  is_active: boolean;
}

export interface FarmFeedFormula {
  id: string;
  farm_id: string;
  formula_no: number;
  name: string | null;
  mixer_weight: number;
  is_active: boolean;
  created_at: string;
}

export interface FormulaItem {
  id: string;
  formula_id: string;
  item_id: string;
  qty_per_mixer: number;
}

export interface DailyVoucher {
  id: string;
  farm_id: string;
  voucher_date: string;
  category: VoucherCategory;
  status: VoucherStatus;
  created_by: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  locked_at: string | null;
  reverted_at: string | null;
  reverted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyVoucherLine {
  id: string;
  voucher_id: string;
  item_id: string;
  formula_no: string | null;
  mixer_count: number | null;
  hall_numbers: string | null;
  consumed_qty: number;
  waste_qty: number;
  notes: string | null;
  hall_consumed: Record<string, number>;
  formula_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransaction {
  id: string;
  farm_id: string;
  item_id: string;
  txn_date: string;
  txn_ts: string;
  txn_type: TransactionType;
  qty_in: number;
  qty_out: number;
  source_type: string | null;
  source_id: string | null;
  created_by: string | null;
  created_at: string;
}

// --------------------------------------------
// UI Models
// --------------------------------------------
export interface HallConfig {
  hallNumber: number;
  hallName: string;
  mixerCount: number;
  isSelected: boolean;
}

export interface DailySheetRow {
  id: string;
  name: string;
  unit: string;
  priority: number;
  reorder_point: number;
  line_id: string | null;
  formula_no: string;
  mixer_count: number;
  hall_numbers: string;
  consumed_qty: number;
  waste_qty: number;
  notes: string;
  current_balance: number;
  today_purchase: number;
  remaining_preview: number;
  qty_per_mixer: number;
  hall_consumed: Record<string, number>;
  total_consumed: number;
  has_initial: boolean;
  has_stock_source?: boolean;
  isDirty?: boolean;
  status?: 'ok' | 'warning' | 'danger';
}

export interface DailySheetVoucher {
  id: string;
  farm_id: string;
  voucher_date: string;
  category: VoucherCategory;
  status: VoucherStatus;
  created_at: string;
  submitted_at: string | null;
  is_editable: boolean;
}

export interface DailySheetData {
  voucher: DailySheetVoucher;
  items: DailySheetRow[];
  halls: HallConfig[];
  formula: FarmFeedFormula | null;
  formulas: FarmFeedFormula[];
}

// --------------------------------------------
// RPC Payloads
// --------------------------------------------
export interface GetDailySheetParams {
  p_farm_id: string;
  p_date: string;
  p_category: VoucherCategory;
}

export interface SaveDailySheetLinePayload {
  item_id: string;
  formula_no: string;
  mixer_count: number;
  hall_numbers: string;
  consumed_qty: number;
  waste_qty: number;
  notes: string;
  hall_consumed?: Record<string, number>;
}

export interface NegativeStockItem {
  item_id: string;
  item_name: string;
  unit: string;
  current_balance: number;
  needed: number;
  shortage: number;
}

// --------------------------------------------
// Constants
// --------------------------------------------
export const CATEGORY_LABELS: Record<VoucherCategory, string> = {
  feed: 'نهاده‌ها',
  packaging: 'اقلام بسته‌بندی',
};

export const STATUS_LABELS: Record<VoucherStatus, string> = {
  draft: 'پیش‌نویس',
  submitted: 'ثبت شده',
  locked: 'قفل شده',
  reverted: 'برگشت خورده',
};

export const STATUS_COLORS: Record<VoucherStatus, { bg: string; text: string }> = {
  draft: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400' },
  submitted: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
  locked: { bg: 'bg-gray-100 dark:bg-gray-900/30', text: 'text-gray-700 dark:text-gray-400' },
  reverted: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
};

export const TXN_TYPE_LABELS: Record<TransactionType, string> = {
  purchase: 'خرید', consumption: 'مصرف', waste: 'ضایعات',
  transfer_in: 'انتقال ورودی', transfer_out: 'انتقال خروجی',
  adjustment: 'تعدیل', initial: 'موجودی اولیه',
};

export const DEFAULT_UNITS = ['کیلوگرم', 'گرم', 'تن', 'لیتر', 'عدد', 'بسته', 'کارتن', 'متر', 'رول'];

export type NumericString = string | number;

export function toNumber(value: NumericString | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? 0 : num;
}

export function formatQty(value: number, decimals: number = 2): string {
  return value.toLocaleString('fa-IR', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}
