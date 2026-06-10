export function toPersianNumbers(n: string | number): string {
  if (n === null || n === undefined) return '';
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return n.toString().replace(/\d/g, (x) => farsiDigits[parseInt(x)]);
}

export function toPersianDigits(n: string | number): string {
  if (n === null || n === undefined) return '';
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return n.toString().replace(/\d/g, (x) => farsiDigits[parseInt(x)]);
}

export function toEnglishDigits(n: string): string {
  if (n === null || n === undefined) return '';
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return n.replace(/[۰-۹]/g, (w) => farsiDigits.indexOf(w).toString());
}

/** Format a number string with thousands separators (English digits) */
export function formatNumberWithSeparator(raw: string): string {
  if (!raw) return '';
  const cleaned = raw.replace(/[^\d۰-۹.-]/g, '');
  const english = toEnglishDigits(cleaned);
  const num = parseFloat(english);
  if (isNaN(num)) return raw;
  return num.toLocaleString('en-US');
}

export function formatRial(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';

  const numeric = typeof value === 'number' ? value : Number(toEnglishDigits(String(value).replace(/[\/\s,]/g, '')));
  if (!Number.isFinite(numeric)) return '—';

  const rounded = Math.round(numeric);
  const separated = formatNumberWithSeparator(String(Math.abs(rounded)));
  const withSign = rounded < 0 ? `-${separated}` : separated;
  return `${toPersianDigits(withSign)} ریال`;
}

export const persianNumbers = {
  toPersianDigits,
  toPersianNumbers,
  toEnglishDigits,
  formatNumberWithSeparator,
  formatRial
};
