// =====================================================================
// src/utils/rpcError.test.ts
// Pure unit tests for the rpcError mapper (raw Postgres internals must
// never reach operators). No DB, no browser, no network. console.error
// is silenced with a spy. Persian literals below are copied from
// src/utils/rpcError.ts — never retype them. The module under test
// must never be edited to make these pass.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rpcError } from './rpcError';

const GENERIC = 'خطای غیرمنتظره‌ای رخ داد';
const NETWORK = 'خطا در اتصال به سرور. اتصال اینترنت خود را بررسی کنید';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('empty input', () => {
  it('maps null to null', () => {
    expect(rpcError(null)).toBeNull();
  });

  it('maps undefined to null', () => {
    expect(rpcError(undefined)).toBeNull();
  });

  it('maps empty string to null', () => {
    expect(rpcError('')).toBeNull();
  });

  it('maps whitespace-only string to null', () => {
    expect(rpcError('   ')).toBeNull();
  });
});

describe('console logging', () => {
  it('logs the technical detail for every mapped call', () => {
    rpcError('Failed to fetch');
    expect(console.error).toHaveBeenCalledWith('[rpcError] technical detail:', 'Failed to fetch');
  });
});

describe('rule 1: network failures', () => {
  it('maps Failed to fetch', () => {
    expect(rpcError('Failed to fetch')).toBe(NETWORK);
  });

  it('maps NetworkError variants', () => {
    expect(rpcError('NetworkError when attempting to fetch resource.')).toBe(NETWORK);
  });

  it('maps socket hang up', () => {
    expect(rpcError('socket hang up')).toBe(NETWORK);
  });

  it('maps ECONNREFUSED', () => {
    expect(rpcError('connect ECONNREFUSED 127.0.0.1:5432')).toBe(NETWORK);
  });

  it('maps timeouts', () => {
    expect(rpcError('request timed out after 5000ms')).toBe(NETWORK);
  });

  it('maps browser offline errors', () => {
    expect(rpcError('net::ERR_INTERNET_DISCONNECTED')).toBe(NETWORK);
  });
});

describe('rule 2: already-Persian passthrough', () => {
  it('passes Persian text through verbatim', () => {
    expect(rpcError('این حواله قفل شده است')).toBe('این حواله قفل شده است');
  });

  it('rejects Persian mixed with ASCII letters', () => {
    expect(rpcError('خطا در OK')).toBe(GENERIC);
  });
});

describe('rule 3: known exact English strings', () => {
  it('maps Forbidden', () => {
    expect(rpcError('Forbidden')).toBe('دسترسی غیرمجاز');
  });

  it('maps the admin-role variant', () => {
    expect(rpcError('forbidden: admin role required')).toBe('دسترسی غیرمجاز');
  });

  it('maps invalid login credentials', () => {
    expect(rpcError('Invalid login credentials')).toBe('نام کاربری یا رمز عبور اشتباه است');
  });

  it('maps duplicate input name', () => {
    expect(rpcError('duplicate input name')).toBe('نام نهاده قبلاً ثبت شده است');
  });
});

describe('rule 4: known English prefixes', () => {
  it('maps the group-by prefix', () => {
    expect(rpcError('p_group_by must be one of day, farm, hall')).toBe('مقدار گروه‌بندی نامعتبر است');
  });

  it('maps the formula-exists prefix', () => {
    expect(rpcError('formula_no 12 already exists')).toBe('شماره فرمول قبلاً وجود دارد');
  });

  it('maps the unit-type prefix', () => {
    expect(rpcError('cannot change unit type from kg to bag')).toBe(
      'امکان تغییر واحد این آیتم به دلیل وجود سوابق موجودی وجود ندارد',
    );
  });
});

describe('rule 5: CODE-prefixed envelopes', () => {
  it('unwraps the Persian payload', () => {
    expect(rpcError('VOUCHER_LOCKED: این حواله قفل شده است')).toBe('این حواله قفل شده است');
  });

  it('falls back when the payload is not Persian', () => {
    expect(rpcError('SOME_CODE: not persian at all')).toBe(GENERIC);
  });
});

describe('rule 6: Postgres error codes', () => {
  it('maps 42501 to the permission message', () => {
    expect(rpcError({ code: '42501', message: 'permission denied for table ledger' })).toBe(
      'شما به این عملیات دسترسی ندارید',
    );
  });

  it('maps 23505 to the duplicate message', () => {
    expect(rpcError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(
      'این رکورد قبلاً ثبت شده است',
    );
  });

  it('maps 22P02 to the invalid-value message', () => {
    expect(rpcError({ code: '22P02', message: 'invalid text representation' })).toBe('مقدار وارد شده نامعتبر است');
  });

  it('maps 23514 to the check-constraint message', () => {
    expect(rpcError({ code: '23514', message: 'check constraint violation on qty' })).toBe(
      'مقدار وارد شده با قوانین سیستم مغایرت دارد',
    );
  });

  it('maps P0001 to the generic message', () => {
    expect(rpcError({ code: 'P0001', message: 'raise exception triggered' })).toBe(GENERIC);
  });
});

describe('rule 7: generic fallback', () => {
  it('maps unknown Error shapes', () => {
    expect(rpcError(new Error('some unknown english failure'))).toBe(GENERIC);
  });

  it('maps message-less objects', () => {
    expect(rpcError({ nope: true })).toBe(GENERIC);
  });
});

describe('leak invariant', () => {
  it('never leaks a missing-relation internal', () => {
    const out = rpcError('relation "public.ledger" does not exist');
    expect(out).not.toBeNull();
    expect(out as string).not.toMatch(/[a-zA-Z]/);
  });

  it('never leaks an auth internal', () => {
    const out = rpcError('JWT expired at 2026-01-01T00:00:00Z');
    expect(out).not.toBeNull();
    expect(out as string).not.toMatch(/[a-zA-Z]/);
  });

  it('never leaks a TypeError internal', () => {
    const out = rpcError(new TypeError('Cannot read properties of null'));
    expect(out).not.toBeNull();
    expect(out as string).not.toMatch(/[a-zA-Z]/);
  });

  it('never leaks a connection-string internal', () => {
    const out = rpcError('postgres://user:secret@host:5432/db connection failed');
    expect(out).not.toBeNull();
    expect(out as string).not.toMatch(/[a-zA-Z]/);
  });

  it('never leaks a stack-trace line', () => {
    const out = rpcError('at query (db.ts:42:7)');
    expect(out).not.toBeNull();
    expect(out as string).not.toMatch(/[a-zA-Z]/);
  });
});
