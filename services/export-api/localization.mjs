// =====================================================================
// services/export-api/localization.mjs
//
// Server-side mirror of src/utils/localization.ts + the Jalali date
// converter. The export API must never emit Latin enum values
// (feed/packaging/...) or Gregorian ISO dates (2026-02-24) into a
// .xlsx — the operator-facing archive is Persian-only.
//
// Self-contained: no date-fns-jalali dependency. The gregorian→jalali
// algorithm below is the standard Birashk-free civil conversion used
// across Persian-calendar libraries.
// =====================================================================

const CATEGORY_TRANSLATIONS = {
  feed:      'نهاده',
  packaging: 'بسته‌بندی',
  medicine:  'دارو',
  bedding:   'بستر',
  other:     'سایر',
};

const TXN_TYPE_TRANSLATIONS = {
  initial:      'موجودی اولیه',
  purchase:     'خرید',
  consumption:  'مصرف',
  waste:        'ضایعات',
  transfer_in:  'انتقال ورودی',
  transfer_out: 'انتقال خروجی',
  adjustment:   'تعدیل',
  sale:         'فروش',
};

const UNIT_TRANSLATIONS = {
  kg: 'کیلوگرم', kilogram: 'کیلوگرم',
  bag: 'کیسه',
  box: 'جعبه',
  liter: 'لیتر', litre: 'لیتر', l: 'لیتر',
  pcs: 'عدد', piece: 'عدد',
};

function translateFrom(map, value) {
  if (typeof value !== 'string') return value;
  return map[value.toLowerCase().trim()] ?? value;
}

export function translateCategory(v) { return translateFrom(CATEGORY_TRANSLATIONS, v); }
export function translateTxnType(v)  { return translateFrom(TXN_TYPE_TRANSLATIONS, v); }
export function translateUnit(v)     { return translateFrom(UNIT_TRANSLATIONS, v); }

// ---------------------------------------------------------------------
// Gregorian ISO (YYYY-MM-DD) → Jalali display (YYYY/MM/DD, Persian digits)
// ---------------------------------------------------------------------
function div(a, b) { return Math.floor(a / b); }

function gregorianToJalaliParts(gy, gm, gd) {
  const gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  let gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100)
    + div(gy2 + 399, 400) + gd;
  for (let i = 0; i < gm - 1; i++) days += gDaysInMonth[i];
  if (gm > 2 && ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0)) days += 1;
  let jy = -1595 + 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    jy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  let jm, jd;
  if (days < 186) {
    jm = 1 + div(days, 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + div(days - 186, 30);
    jd = 1 + ((days - 186) % 30);
  }
  void jDaysInMonth;
  return { jy, jm, jd };
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
export function toPersianDigits(input) {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Convert a Gregorian ISO date (or Date, or ISO datetime) to a Jalali
 * display string with Persian digits: ۱۴۰۵/۰۲/۲۴. Non-date strings and
 * already-Jalali (slash-separated) strings pass through unchanged.
 */
export function toJalaliDisplay(value) {
  if (value === null || value === undefined || value === '') return '';
  let iso;
  if (value instanceof Date) {
    iso = value.toISOString().slice(0, 10);
  } else if (typeof value === 'string') {
    const m = value.match(ISO_DATE_RE);
    if (!m) return value; // not an ISO date — leave as-is
    iso = `${m[1]}-${m[2]}-${m[3]}`;
  } else {
    return String(value);
  }
  const [gy, gm, gd] = iso.split('-').map(Number);
  const { jy, jm, jd } = gregorianToJalaliParts(gy, gm, gd);
  const pad = (n) => String(n).padStart(2, '0');
  return toPersianDigits(`${jy}/${pad(jm)}/${pad(jd)}`);
}

/**
 * Localize a display VALUE (not number/date-typed) based on its column
 * key. Only enum-like string columns are translated; everything else
 * is returned untouched.
 */
export function localizeByColumnKey(key, value) {
  if (value === null || value === undefined) return value;
  if (key === 'item_category' || key === 'category') return translateCategory(value);
  if (key === 'txn_type')                            return translateTxnType(value);
  if (key === 'item_unit' || key === 'unit')         return translateUnit(value);
  return value;
}
