import { format, addDays, parse, isValid } from 'date-fns-jalali';
import { toPersianDigits, toEnglishDigits } from './persianNumbers';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatGregorianIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  return (
    Number.isFinite(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function parseValidJalali(value: string): Date | null {
  const english = toEnglishDigits(value).trim();
  if (!english) return null;
  const normalized = english.replace(/-/g, '/');
  const date = parse(normalized, 'yyyy/MM/dd', new Date());
  return isValid(date) ? date : null;
}

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
  const date = parseValidJalali(jalaliDate);
  if (!date) return jalaliDate;
  const newDate = addDays(date, days);
  return isValid(newDate) ? format(newDate, 'yyyy/MM/dd') : jalaliDate;
}

// Convert Jalali date string to Gregorian ISO format (yyyy-MM-dd)
export function jalaliToGregorian(jalaliDate: string): string {
  const english = toEnglishDigits(jalaliDate).trim();
  if (isValidIsoDate(english)) return english;

  const date = parseValidJalali(english);
  return date ? formatGregorianIso(date) : getTodayIso();
}

// Convert Gregorian ISO date to Jalali
export function gregorianToJalali(isoDate: string): string {
  if (!isValidIsoDate(isoDate)) return getJalaliToday();
  const [year, month, day] = isoDate.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  return format(date, 'yyyy/MM/dd');
}

// Format Jalali date for display (with Persian digits and weekday)
export function formatJalaliDateFull(date: Date = new Date()): string {
  const d = format(date, 'EEEE d MMMM yyyy');
  return toPersianDigits(d);
}
