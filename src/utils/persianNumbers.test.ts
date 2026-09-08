// =====================================================================
// src/utils/persianNumbers.test.ts
// Pure unit tests for the Persian digit / Rial formatting helpers.
// No DB, no browser, no network. Characterization pins current
// behavior (including the known U+0660-9 gap) — the modules under
// test must never be edited to make these pass.
// =====================================================================

import { describe, expect, it } from 'vitest';
import {
  formatNumberWithSeparator,
  formatRial,
  persianNumbers,
  toEnglishDigits,
  toPersianDigits,
  toPersianNumbers,
} from './persianNumbers';

describe('toPersianDigits', () => {
  it('converts 0 to ۰', () => {
    expect(toPersianDigits(0)).toBe('۰');
  });

  it('converts a Jalali-style date string', () => {
    expect(toPersianDigits('1403/10/15')).toBe('۱۴۰۳/۱۰/۱۵');
  });

  it('maps empty string to empty string', () => {
    expect(toPersianDigits('')).toBe('');
  });

  it('maps null to empty string', () => {
    expect(toPersianDigits(null as unknown as string)).toBe('');
  });

  it('maps undefined to empty string', () => {
    expect(toPersianDigits(undefined as unknown as string)).toBe('');
  });

  it('leaves ASCII letters untouched', () => {
    expect(toPersianDigits('abc')).toBe('abc');
  });
});

describe('toPersianNumbers (byte-identical duplicate of toPersianDigits)', () => {
  it('agrees with toPersianDigits on 12345', () => {
    // The two exports are intentionally byte-identical duplicates; this
    // pins the duplication so a future dedupe lands as a deliberate diff.
    expect(toPersianNumbers('12345')).toBe(toPersianDigits('12345'));
  });
});

describe('toEnglishDigits', () => {
  it('converts extended Persian digits to ASCII', () => {
    expect(toEnglishDigits('۹۸۷۶۵۴۳۲۱۰')).toBe('9876543210');
  });

  it('converts mixed Persian digits and ASCII letters', () => {
    expect(toEnglishDigits('۱۲۳abc')).toBe('123abc');
  });

  it('maps empty string to empty string', () => {
    expect(toEnglishDigits('')).toBe('');
  });

  it('round-trips through toPersianDigits', () => {
    expect(toEnglishDigits(toPersianDigits('12345'))).toBe('12345');
  });

  it('KNOWN GAP: leaves Arabic-Indic U+0660-9 digits untouched', () => {
    // toEnglishDigits handles ONLY U+06F0-9 (Extended Arabic-Indic), not
    // U+0660-9 (Arabic-Indic). Asserted as current behavior — DO NOT FIX
    // the module to make this pass differently.
    expect(toEnglishDigits('٣')).toBe('٣');
  });
});

describe('formatNumberWithSeparator', () => {
  it('adds thousands separators', () => {
    expect(formatNumberWithSeparator('1234567')).toBe('1,234,567');
  });

  it('converts Persian digits then separates', () => {
    expect(formatNumberWithSeparator('۱۲۳۴')).toBe('1,234');
  });

  it('maps empty string to empty string', () => {
    expect(formatNumberWithSeparator('')).toBe('');
  });

  it('returns raw input on NaN', () => {
    expect(formatNumberWithSeparator('abc')).toBe('abc');
  });

  it('keeps an already-separated value stable', () => {
    expect(formatNumberWithSeparator('1,234')).toBe('1,234');
  });
});

describe('formatRial', () => {
  it('maps null to em-dash', () => {
    expect(formatRial(null)).toBe('—');
  });

  it('maps undefined to em-dash', () => {
    expect(formatRial(undefined)).toBe('—');
  });

  it('maps empty string to em-dash', () => {
    expect(formatRial('')).toBe('—');
  });

  it('formats 0 with the Rial suffix', () => {
    expect(formatRial(0)).toBe('۰ ریال');
  });

  it('formats 1234 with separator and suffix', () => {
    expect(formatRial(1234)).toBe('۱,۲۳۴ ریال');
  });

  it('rounds 1234.6 up', () => {
    expect(formatRial(1234.6)).toBe('۱,۲۳۵ ریال');
  });

  it('formats negatives with an ASCII hyphen', () => {
    expect(formatRial(-1500)).toBe('-۱,۵۰۰ ریال');
  });

  it('accepts Persian-digit strings', () => {
    expect(formatRial('۱۲۳۴')).toBe('۱,۲۳۴ ریال');
  });

  it('maps non-numeric strings to em-dash', () => {
    expect(formatRial('abc')).toBe('—');
  });

  it('maps +Infinity to em-dash', () => {
    expect(formatRial(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('maps NaN to em-dash', () => {
    expect(formatRial(Number.NaN)).toBe('—');
  });
});

describe('persianNumbers barrel', () => {
  it('exposes the same formatRial reference', () => {
    expect(persianNumbers.formatRial).toBe(formatRial);
  });
});
