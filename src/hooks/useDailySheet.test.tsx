// =====================================================================
// src/hooks/useDailySheet.test.tsx — draft-save-fidelity tests (plan 014)
//
// Verifies the rewritten save path:
//   1. a rejected bulk upsert surfaces saveStatus 'error', raises the
//      Persian toast, and RETAINS dirty lines for retry;
//   2. submitSheet never reaches the submit_daily_voucher RPC when the
//      pre-submit draft flush fails;
//   3. the happy path persists ALL dirty lines in EXACTLY ONE upsert
//      (onConflict 'voucher_id,item_id') and clears the dirt.
//
// Everything outside the hook is doubled at the module boundary via
// vi.mock: the Supabase client, the offline-read facade, the
// reachability probe, and sonner. Synthetic fixture data only — no
// live DB, no fabricated business entities (AGENTS.md RULE 1).
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import type { Database } from '@/types/database.types';
import { useDailySheet } from './useDailySheet';

type FarmItemRow = Database['public']['Tables']['farm_items']['Row'];
type VoucherRow = Database['public']['Tables']['daily_vouchers']['Row'];
type TxnRow = Database['public']['Tables']['inventory_transactions']['Row'];

// The exact row shape saveDraft sends to .upsert() in this hook.
type UpsertRow = {
  voucher_id: string;
  item_id: string;
  formula_no: string | null;
  mixer_count: number | null;
  hall_numbers: string | null;
  consumed_qty: number;
  waste_qty: number;
  notes: string | null;
  hall_consumed: Record<string, number>;
};

const FARM_ID = 'farm-synthetic-1';
const SHEET_DATE = '1405-06-16';
const VOUCHER_ID = '11111111-1111-4111-8111-111111111111';
const SAVE_ERROR_TOAST = 'خطا در ذخیره';
const STAMP = '2026-09-07T06:30:00.000Z';

// One hoisted object so every vi.mock factory below can reference the
// same doubles despite hoisting.
const mocks = vi.hoisted(() => {
  const upsert = vi.fn();
  const rpc = vi.fn();
  const maybeSingle = vi.fn();
  const from = vi.fn((table: string) => {
    if (table === 'daily_voucher_lines') return { upsert };
    // Only the find-or-create voucher chain is exercised online; the
    // fixture always finds an existing voucher, so insert/single never run.
    const chain = {
      select: () => chain,
      eq: () => chain,
      insert: () => chain,
      single: () => Promise.reject(new Error('unexpected voucher insert — fixture pre-exists')),
      maybeSingle,
    };
    return chain;
  });
  return {
    upsert,
    rpc,
    maybeSingle,
    from,
    readFarmItems: vi.fn(),
    readFarmTransactions: vi.fn(),
    readTodayPurchases: vi.fn(),
    readVoucherLines: vi.fn(),
    readFeedFormulas: vi.fn(),
    readFormulaItems: vi.fn(),
    readFarmHalls: vi.fn(),
    findVoucher: vi.fn(),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

vi.mock('@/lib/supabaseReachability', () => ({
  checkSupabaseReachability: async () => true,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/offline/reads', () => ({
  readFarmItems: mocks.readFarmItems,
  readFarmTransactions: mocks.readFarmTransactions,
  readTodayPurchases: mocks.readTodayPurchases,
  readVoucherLines: mocks.readVoucherLines,
  readFeedFormulas: mocks.readFeedFormulas,
  readFormulaItems: mocks.readFormulaItems,
  readFarmHalls: mocks.readFarmHalls,
  findVoucher: mocks.findVoucher,
}));

// ---------------------------------------------------------------
// Synthetic fixtures (RULE 1: fabricated demo data never enters the
// DB — these live ONLY inside this test module)
// ---------------------------------------------------------------

const VOUCHER_ROW: VoucherRow = {
  id: VOUCHER_ID,
  farm_id: FARM_ID,
  voucher_date: SHEET_DATE,
  category: 'packaging',
  status: 'draft',
  created_by: null,
  submitted_by: null,
  submitted_at: null,
  locked_at: null,
  reverted_at: null,
  reverted_by: null,
  created_at: STAMP,
  updated_at: STAMP,
};

const ITEM_A: FarmItemRow = {
  id: 'item-a',
  farm_id: FARM_ID,
  category: 'packaging',
  name: 'بسته الف',
  unit: 'عدد',
  priority: 1,
  reorder_point: 0,
  is_active: true,
  created_at: STAMP,
  updated_at: STAMP,
};

const ITEM_B: FarmItemRow = {
  ...ITEM_A,
  id: 'item-b',
  name: 'بسته ب',
  priority: 2,
};

const initialStockTxn = (itemId: string): TxnRow => ({
  id: `txn-initial-${itemId}`,
  farm_id: FARM_ID,
  item_id: itemId,
  txn_date: SHEET_DATE,
  txn_ts: STAMP,
  txn_type: 'initial',
  qty_in: 500,
  qty_out: 0,
  unit_price: null,
  total_price: null,
  source_type: null,
  source_id: null,
  reference_no: null,
  notes: null,
  created_by: null,
  created_at: STAMP,
  supplier_id: null,
  attachment_url: null,
});

// The module boundary is already doubled, so only pure promise/microtask
// chains run during load; fake timers are armed from the first tick to
// make the 800 ms autosave debounce deterministic.
async function renderLoadedSheet() {
  vi.useFakeTimers();
  const view = renderHook(() =>
    useDailySheet({ farmId: FARM_ID, date: SHEET_DATE, category: 'packaging' })
  );
  for (
    let pumps = 0;
    pumps < 50 && (view.result.current.isLoading || view.result.current.data === null);
    pumps++
  ) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  expect(view.result.current.isLoading).toBe(false);
  expect(view.result.current.error).toBeNull();
  expect(view.result.current.data?.voucher.id).toBe(VOUCHER_ID);
  return view;
}

const flushPendingSave = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(800);
  });
};

const {
  upsert,
  rpc,
  maybeSingle,
  readFarmItems,
  readFarmTransactions,
  readTodayPurchases,
  readVoucherLines,
  readFeedFormulas,
  readFormulaItems,
  readFarmHalls,
  findVoucher,
} = mocks;

beforeEach(() => {
  for (const fn of [
    upsert,
    rpc,
    maybeSingle,
    readFarmItems,
    readFarmTransactions,
    readTodayPurchases,
    readVoucherLines,
    readFeedFormulas,
    readFormulaItems,
    readFarmHalls,
    findVoucher,
  ]) {
    fn.mockReset();
  }
  vi.mocked(toast.error).mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  maybeSingle.mockResolvedValue({ data: VOUCHER_ROW, error: null });
  readFarmItems.mockResolvedValue([ITEM_A, ITEM_B]);
  readFarmTransactions.mockResolvedValue([initialStockTxn('item-a'), initialStockTxn('item-b')]);
  readTodayPurchases.mockResolvedValue([]);
  readVoucherLines.mockResolvedValue([]);
  findVoucher.mockResolvedValue(null);
  rpc.mockResolvedValue({ data: { success: true }, error: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useDailySheet — draft save fidelity (bulk upsert)', () => {
  it('rejected bulk upsert sets saveStatus "error", raises the Persian toast and RETAINS dirty lines', async () => {
    upsert.mockResolvedValue({ data: null, error: { message: 'row-level security' } });
    const { result } = await renderLoadedSheet();

    await act(async () => {
      result.current.updateLine('item-a', 'consumed_qty', 40);
      result.current.updateLine('item-b', 'consumed_qty', 70);
    });
    await flushPendingSave();

    // One (and only one) bulk upsert carried BOTH lines.
    expect(upsert).toHaveBeenCalledTimes(1);
    const rows = upsert.mock.calls[0][0] as UpsertRow[];
    expect(rows.map((r) => r.item_id).sort()).toEqual(['item-a', 'item-b']);

    expect(result.current.saveStatus).toBe('error');
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(SAVE_ERROR_TOAST);

    // Dirt retained for retry: the next explicit flush re-sends both rows.
    let submitted: boolean | undefined;
    await act(async () => {
      submitted = await result.current.submitSheet();
    });
    expect(submitted).toBe(false);
    expect(upsert).toHaveBeenCalledTimes(2);
    const retryRows = upsert.mock.calls[1][0] as UpsertRow[];
    expect(retryRows.map((r) => r.item_id).sort()).toEqual(['item-a', 'item-b']);
  });

  it('submitSheet returns false and NEVER calls the submit_daily_voucher RPC when the flush fails', async () => {
    upsert.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for table daily_voucher_lines' },
    });
    const { result } = await renderLoadedSheet();

    await act(async () => {
      result.current.updateLine('item-a', 'consumed_qty', 40);
    });

    let submitted: boolean | undefined;
    await act(async () => {
      submitted = await result.current.submitSheet();
    });

    expect(submitted).toBe(false);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
    expect(result.current.saveStatus).toBe('error');
  });

  it('successful save persists ALL dirty lines in EXACTLY ONE bulk upsert and clears the dirt', async () => {
    upsert.mockResolvedValue({ data: null, error: null });
    const { result } = await renderLoadedSheet();

    await act(async () => {
      result.current.updateLine('item-a', 'consumed_qty', 40);
      result.current.updateLine('item-b', 'consumed_qty', 70);
    });
    await flushPendingSave();

    expect(upsert).toHaveBeenCalledTimes(1);
    const [rowsArg, optionsArg] = upsert.mock.calls[0];
    const rows = rowsArg as UpsertRow[];
    expect(optionsArg).toEqual({ onConflict: 'voucher_id,item_id' });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.item_id).sort()).toEqual(['item-a', 'item-b']);
    expect(rows.every((r) => r.voucher_id === VOUCHER_ID)).toBe(true);
    expect(rows.find((r) => r.item_id === 'item-a')?.consumed_qty).toBe(40);
    expect(rows.find((r) => r.item_id === 'item-b')?.consumed_qty).toBe(70);
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.data?.items.every((i) => !i.isDirty)).toBe(true);

    // Dirt cleared: submitting goes straight to the RPC with NO second flush.
    let submitted: boolean | undefined;
    await act(async () => {
      submitted = await result.current.submitSheet();
    });
    expect(submitted).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('submit_daily_voucher');
    const rpcParams = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(rpcParams.p_voucher_id).toBe(VOUCHER_ID);
    expect(rpcParams.p_farm_id).toBe(FARM_ID);
    expect(rpcParams.p_voucher_date).toBe(SHEET_DATE);
    expect(Array.isArray(rpcParams.p_items)).toBe(true);
    expect('p_ignore_window' in rpcParams).toBe(true);
  });
});
