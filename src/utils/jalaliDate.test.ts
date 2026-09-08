// =====================================================================
// src/utils/jalaliDate.test.ts
// Pure unit tests for the Jalali/Gregorian conversion helpers (clock
// frozen to 2026-08-29 local). No DB, no browser, no network.
// Characterization pins current behavior — including two known
// jalaliDate defects asserted as passing-today cases for a future fix
// plan. The module under test must never be edited to make these pass.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDaysToJalali,
  formatJalaliDate,
  getJalaliToday,
  gregorianToJalali,
  jalaliToGregorian,
} from './jalaliDate';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 29, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('round-trips', () => {
  it('gregorianToJalali inverts jalaliToGregorian', () => {
    expect(gregorianToJalali(jalaliToGregorian('1403/05/12'))).toBe('1403/05/12');
  });

  it('jalaliToGregorian inverts gregorianToJalali', () => {
    expect(jalaliToGregorian(gregorianToJalali('2025-06-15'))).toBe('2025-06-15');
  });

  it('addDaysToJalali +1 then -1 returns to start', () => {
    expect(addDaysToJalali(addDaysToJalali('1403/05/12', 1), -1)).toBe('1403/05/12');
  });

  it('addDaysToJalali crosses the year boundary forward', () => {
    expect(addDaysToJalali('1403/12/29', 5)).toBe('1404/01/04');
  });

  it('addDaysToJalali crosses the year boundary backward', () => {
    expect(addDaysToJalali('1403/12/29', -5)).toBe('1403/12/24');
  });
});

describe('gregorianToJalali anchors', () => {
  // Characterization anchors: values observed from date-fns-jalali at
  // runtime (see plan step 5), hard-coded to catch library drift — not
  // independent calendar proofs.
  it('maps 2025-06-15 to the observed Jalali date', () => {
    expect(gregorianToJalali('2025-06-15')).toBe('1404/03/25');
  });

  it('maps 2026-01-01 to the observed Jalali date', () => {
    expect(gregorianToJalali('2026-01-01')).toBe('1404/10/11');
  });
});

describe('digit handling and passthrough', () => {
  it('treats Persian-digit Jalali input like ASCII input', () => {
    expect(jalaliToGregorian('۱۴۰۳/۰۵/۱۲')).toBe(jalaliToGregorian('1403/05/12'));
  });

  it('formatJalaliDate normalizes Persian digits to English', () => {
    expect(formatJalaliDate('۱۴۰۳/۱۰/۱۵')).toBe('1403/10/15');
  });

  it('jalaliToGregorian passes ISO input through unchanged', () => {
    expect(jalaliToGregorian('2025-06-15')).toBe('2025-06-15');
  });
});

describe('fallback defects', () => {
  it('KNOWN DEFECT (plan 015): jalaliToGregorian falls back to today on garbage', () => {
    // Wrong-day silent fallback: unparseable input returns getTodayIso()
    // ('2026-08-29' under the frozen clock) instead of signaling invalid.
    expect(jalaliToGregorian('garbage')).toBe('2026-08-29');
  });

  it('KNOWN DEFECT (plan 015): jalaliToGregorian falls back to today on empty string', () => {
    // Wrong-day silent fallback: see above.
    expect(jalaliToGregorian('')).toBe('2026-08-29');
  });

  it('KNOWN DEFECT (plan 015): jalaliToGregorian falls back to today on impossible date', () => {
    // Wrong-day silent fallback: month 13 / day 45 is not a real Jalali
    // date yet still resolves to today instead of signaling invalid.
    expect(jalaliToGregorian('1403/13/45')).toBe('2026-08-29');
  });

  it('KNOWN DEFECT (plan 015): gregorianToJalali falls back to today on garbage', () => {
    // Wrong-day silent fallback: returns getJalaliToday() instead of
    // signaling invalid.
    expect(gregorianToJalali('not-a-date')).toBe(getJalaliToday());
  });

  it('KNOWN DEFECT (plan 015): addDaysToJalali echoes garbage input back', () => {
    // Silent echo: unparseable input is returned unchanged, so a typo
    // propagates downstream as if it were a valid date.
    expect(addDaysToJalali('garbage', 5)).toBe('garbage');
  });

  it('KNOWN DEFECT (plan 015): jalaliToGregorian leaves dash-separated Jalali unconverted', () => {
    // Dash inputs are checked against the ISO regex first and pass
    // straight through, so '1403-05-12' is never converted.
    expect(jalaliToGregorian('1403-05-12')).toBe('1403-05-12');
  });

  it('KNOWN DEFECT (plan 015): dash vs slash Jalali inputs disagree', () => {
    // Same calendar day, different separators, different results.
    expect(jalaliToGregorian('1403-05-12')).not.toBe(jalaliToGregorian('1403/05/12'));
  });

  it('KNOWN DEFECT (plan 015): addDaysToJalali normalizes dashes to slashes', () => {
    // parseValidJalali normalizes '-' to '/' while jalaliToGregorian
    // does not, so the two helpers disagree on dash input.
    expect(addDaysToJalali('1403-05-12', 0)).toBe('1403/05/12');
  });
});
