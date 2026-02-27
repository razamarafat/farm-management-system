export function toPersianDigits(n: string | number): string {
  if (n === null || n === undefined) return '';
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return n.toString().replace(/\d/g, (x: string) => farsiDigits[parseInt(x)]);
}

export const toPersianNumbers = toPersianDigits;

export function toEnglishDigits(n: string): string {
  if (n === null || n === undefined) return '';
  const englishDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return n.replace(/[۰-۹]/g, (w: string) => englishDigits[farsiDigits.indexOf(w)]);
}

// Format number with separator (e.g., 355000000 → 355/000/000)
export function formatNumberWithSeparator(value: string | number): string {
  if (!value) return '';
  // Convert to string and remove any existing separators
  const cleanValue = value.toString().replace(/[/\s]/g, '');
  
  // Return if not a valid number
  if (!/^\d+$/.test(cleanValue)) return value.toString();
  
  // Add separators every 3 digits from the right
  return cleanValue.replace(/\B(?=(\d{3})+(?!\d))/g, '/');
}

export const persianNumbers = {
  toPersianDigits,
  toPersianNumbers,
  toEnglishDigits,
  formatNumberWithSeparator
};
