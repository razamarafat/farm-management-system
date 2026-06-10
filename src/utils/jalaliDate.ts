import { format, addDays, parse } from 'date-fns-jalali';
import { toPersianDigits, toEnglishDigits } from './persianNumbers';

export function getJalaliDate(date: Date = new Date()): string {
  const d = format(date, 'yyyy/MM/dd');
  return toPersianDigits(d);
}

export function getJalaliDateTime(date: Date = new Date()): string {
  const d = format(date, 'yyyy/MM/dd HH:mm');
  return toPersianDigits(d);
}

export function getRelativeTime(date: Date): string {
  // Simple relative time implementation
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'همین الان';
  if (minutes < 60) return `${toPersianDigits(minutes)} دقیقه پیش`;
  if (hours < 24) return `${toPersianDigits(hours)} ساعت پیش`;
  return `${toPersianDigits(days)} روز پیش`;
}

// Get today's date in Jalali format (yyyy/MM/dd)
export function getJalaliToday(): string {
  return format(new Date(), 'yyyy/MM/dd');
}

// Format a Jalali date string for display
export function formatJalaliDate(jalaliDate: string): string {
  // Input: "1403/10/15" (with English or Persian digits)
  // Output: "1403/10/15" (always English for internal use)
  const english = toEnglishDigits(jalaliDate);
  return english;
}

// Add days to a Jalali date string
export function addDaysToJalali(jalaliDate: string, days: number): string {
  const english = toEnglishDigits(jalaliDate);
  try {
    const date = parse(english, 'yyyy/MM/dd', new Date());
    const newDate = addDays(date, days);
    return format(newDate, 'yyyy/MM/dd');
  } catch {
    return jalaliDate;
  }
}

// Convert Jalali date string to Gregorian ISO format (yyyy-MM-dd)
export function jalaliToGregorian(jalaliDate: string): string {
  const english = toEnglishDigits(jalaliDate);
  try {
    const date = parse(english, 'yyyy/MM/dd', new Date());
    // Format as ISO date
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

// Convert Gregorian ISO date to Jalali
export function gregorianToJalali(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return format(date, 'yyyy/MM/dd');
  } catch {
    return getJalaliToday();
  }
}

// Format Jalali date for display (with Persian digits and weekday)
export function formatJalaliDateFull(date: Date = new Date()): string {
  const d = format(date, 'EEEE d MMMM yyyy');
  return toPersianDigits(d);
}
