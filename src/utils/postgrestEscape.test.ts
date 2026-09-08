// =====================================================================
// src/utils/postgrestEscape.test.ts
// Pure unit tests for the PostgREST search-term escapers. No DB, no
// browser, no network. Expected strings are derived from the
// implementation's escape ORDER (backslash first, then %/_ then the
// or() syntax characters), pinned explicitly.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { escapePostgrestLike, escapePostgrestOrValue } from './postgrestEscape';

describe('escapePostgrestOrValue', () => {
  it('leaves a plain term untouched', () => {
    expect(escapePostgrestOrValue('abc')).toBe('abc');
  });

  it('escapes commas so they cannot split the or() list', () => {
    expect(escapePostgrestOrValue('a,b')).toBe('a\\,b');
  });

  it('escapes LIKE wildcards % and _', () => {
    expect(escapePostgrestOrValue('100%_x')).toBe('100\\%\\_x');
  });

  it('escapes dots and parens inside the value', () => {
    expect(escapePostgrestOrValue('x,y(z)')).toBe('x\\,y\\(z\\)');
  });

  it('escapes backslash FIRST, then the percent (a \\% becomes 3 backslashes + %)', () => {
    expect(escapePostgrestOrValue('\\%')).toBe('\\\\\\%');
  });
});

describe('escapePostgrestLike', () => {
  it('leaves a plain term untouched', () => {
    expect(escapePostgrestLike('abc')).toBe('abc');
  });

  it('escapes LIKE wildcards % and _', () => {
    expect(escapePostgrestLike('100%_x')).toBe('100\\%\\_x');
  });

  it('escapes backslash FIRST, then the percent', () => {
    expect(escapePostgrestLike('\\%')).toBe('\\\\\\%');
  });

  it('does NOT escape or() syntax characters a plain ilike value tolerates', () => {
    expect(escapePostgrestLike('a,b(c)')).toBe('a,b(c)');
  });
});
