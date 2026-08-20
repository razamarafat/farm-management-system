/**
 * Centralized Persian display-label mapping for every enum-like field used across reports.
 * Used to translate database values (e.g., 'feed', 'packaging', 'kg') into their Persian equivalent.
 */

export const CATEGORY_TRANSLATIONS: Record<string, string> = {
  feed: 'نهاده',
  packaging: 'بسته‌بندی',
};

export const TXN_TYPE_TRANSLATIONS: Record<string, string> = {
  initial: 'موجودی اولیه',
  purchase: 'خرید',
  consumption: 'مصرف',
  waste: 'ضایعات',
  transfer_in: 'انتقال ورودی',
  transfer_out: 'انتقال خروجی',
  adjustment: 'تعدیل',
  sale: 'فروش',
};

export const UNIT_TRANSLATIONS: Record<string, string> = {
  kg: 'کیلوگرم',
  kilogram: 'کیلوگرم',
  bag: 'کیسه',
  box: 'جعبه',
  liter: 'لیتر',
  litre: 'لیتر',
  pcs: 'عدد',
  piece: 'عدد',
};

export function translateCategory(value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '');
  return CATEGORY_TRANSLATIONS[value.toLowerCase().trim()] ?? value;
}

export function translateTxnType(value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '');
  return TXN_TYPE_TRANSLATIONS[value.toLowerCase().trim()] ?? value;
}

export function translateUnit(value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '');
  return UNIT_TRANSLATIONS[value.toLowerCase().trim()] ?? value;
}

/**
 * Automatically translates a value based on the column key.
 */
export function translateByColumnKey(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  
  const strVal = String(value);
  if (key === 'item_category' || key === 'category') {
    return translateCategory(strVal);
  }
  if (key === 'txn_type') {
    return translateTxnType(strVal);
  }
  if (key === 'item_unit' || key === 'unit') {
    return translateUnit(strVal);
  }
  return value;
}
