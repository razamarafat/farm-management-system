// =====================================================================
// useItemLedger
//
// Keyset-paginated ledger for ONE item, fed by:
// public.reporting_inventory_ledger(p_farm_id?, p_item_id?,
//   p_date_from?, p_date_to?, p_cursor_ts?, p_cursor_id?,
//   p_prior_balance?, p_limit?)
//
// SECURITY INVOKER + STABLE on the server. RLS scopes the row stream
// per-JWT.
//
// Pagination model is FORWARD-ONLY (the RPC's keyset cursor uses (txn_ts,
// id) DESC so a previous-page would need to re-query from start). We
// expose `loadNext` + `hasMore`. `reset()` re-issues page 1 with the
// current params (used when the user opens the drilldown with new dates).
//
// `prior_balance` is threaded through the cursor chain so the running
// balance on page 2+ matches the LAST row of page 1 exactly — without
// that hand-off, the running balance would restart from zero.
//
// `has_more` is stamped on every visible row by the RPC (LIMIT n+1
// sentinel pattern; window functions fire PRE-LIMIT in Postgres). We
// pluck it from the raw payload BEFORE normalize() strips the column,
// otherwise `loadNext`'s "is there another page?" check would always
// report `false`.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface ItemLedgerRow {
  id: string;
  txn_ts: string;
  txn_date: string;
  txn_type: string;
  farm_id: string;
  farm_name: string | null;
  item_id: string;
  item_name: string;
  item_unit: string;
  item_category: string;
  source_type: string | null;
  source_id: string | null;
  qty_in: number;
  qty_out: number;
  unit_price: number | null;
  total_price: number | null;
  reference_no: string | null;
  notes: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  prior_balance: number;
  running_balance: number;
}

export interface UseItemLedgerParams {
  item_id: string | null;
  farm_id?: string | null;
  date_from: string;   // ISO yyyy-MM-dd
  date_to: string;     // ISO yyyy-MM-dd
  pageSize?: number;   // default 20, hard-capped to 500 by the RPC
}

export interface UseItemLedgerResult {
  rows: ItemLedgerRow[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadNext: () => void;
  reset: () => void;
}

export function useItemLedger({
  item_id,
  farm_id,
  date_from,
  date_to,
  pageSize = 20,
}: UseItemLedgerParams): UseItemLedgerResult {
  const [rows, setRows] = useState<ItemLedgerRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Cursor state — ref'd so a fetch in flight doesn't capture stale values.
  const cursorTsRef = useRef<string | null>(null);
  const cursorIdRef = useRef<string | null>(null);
  const priorBalanceRef = useRef<number>(0);
  const fetchingRef = useRef(false);

  // Reset when the params that define the window change. We do NOT reset
  // on `farm_id` changes when there's no item_id yet — this keeps the
  // hook's behaviour predictable for callers that bind farm later.
  useEffect(() => {
    if (!item_id) {
      // Drilldown closed (or initial mount with no item yet): ensure
      // spinner does NOT strand. Reset everything.
      setRows([]);
      setHasMore(false);
      setIsLoading(false);
      setError(null);
      cursorTsRef.current = null;
      cursorIdRef.current = null;
      priorBalanceRef.current = 0;
      return;
    }

    let cancelled = false;
    fetchingRef.current = true;
    setIsLoading(true);
    setError(null);
    setRows([]);
    setHasMore(false);
    cursorTsRef.current = null;
    cursorIdRef.current = null;
    priorBalanceRef.current = 0;

    const fetchPage = async () => {
      const { data, error: rpcError } = await supabase.rpc(
        'reporting_inventory_ledger',
        {
          p_farm_id: farm_id ?? null,
          p_item_id: item_id,
          p_category: null,
          p_date_from: date_from,
          p_date_to: date_to,
          p_txn_type: null,
          p_cursor_ts: null,
          p_cursor_id: null,
          p_prior_balance: 0,
          p_limit: pageSize,
        },
      );

      if (cancelled) return;
      if (rpcError) {
        console.error('Item ledger RPC error:', rpcError);
        setError(rpcError.message || 'خطا در دریافت گردش کالا');
        setIsLoading(false);
        fetchingRef.current = false;
        return;
      }

      // `has_more` is stamped on every visible row by the RPC (LIMIT n+1
      // sentinel pattern; window functions fire PRE-LIMIT in Postgres so
      // every row in the page shares the same value). Read it BEFORE
      // normalize strips the column.
      const more = readHasMore(data);
      const normalized = normalizeRows(data);
      setRows(normalized);
      if (normalized.length > 0) {
        const last = normalized[normalized.length - 1];
        cursorTsRef.current = last.txn_ts;
        cursorIdRef.current = last.id;
        priorBalanceRef.current = Number(last.running_balance ?? 0);
        setHasMore(more);
      } else {
        setHasMore(false);
      }
      setIsLoading(false);
      fetchingRef.current = false;
    };

    fetchPage();
    return () => {
      cancelled = true;
    };
  }, [item_id, farm_id, date_from, date_to, pageSize]);

  const loadNext = useCallback(async () => {
    if (
      fetchingRef.current ||
      isLoading ||
      !hasMore ||
      !cursorTsRef.current ||
      !cursorIdRef.current ||
      !item_id
    ) {
      return;
    }
    fetchingRef.current = true;
    setIsLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'reporting_inventory_ledger',
        {
          p_farm_id: farm_id ?? null,
          p_item_id: item_id,
          p_category: null,
          p_date_from: date_from,
          p_date_to: date_to,
          p_txn_type: null,
          p_cursor_ts: cursorTsRef.current,
          p_cursor_id: cursorIdRef.current,
          p_prior_balance: priorBalanceRef.current,
          p_limit: pageSize,
        },
      );

      if (rpcError) {
        setError(rpcError.message || 'خطا در دریافت صفحهٔ بعد');
        return;
      }

      // Same as init path: read has_more BEFORE normalize.
      const more = readHasMore(data);
      const normalized = normalizeRows(data);
      if (normalized.length > 0) {
        setRows((prev) => [...prev, ...normalized]);
        const last = normalized[normalized.length - 1];
        cursorTsRef.current = last.txn_ts;
        cursorIdRef.current = last.id;
        priorBalanceRef.current = Number(last.running_balance ?? 0);
        setHasMore(more);
      } else {
        setHasMore(false);
      }
    } finally {
      setIsLoading(false);
      fetchingRef.current = false;
    }
  }, [date_from, date_to, farm_id, hasMore, isLoading, item_id, pageSize]);

  const reset = useCallback(() => {
    setRows([]);
    setHasMore(false);
    cursorTsRef.current = null;
    cursorIdRef.current = null;
    priorBalanceRef.current = 0;
  }, []);

  return { rows, isLoading, error, hasMore, loadNext, reset };
}

// ---------------------------------------------------------------------------
// `has_more` is stamped on every visible row by the RPC (LIMIT n+1 sentinel
// pattern; window functions fire PRE-LIMIT in Postgres so every row in the
// page shares the same value). Read it from the raw RPC payload BEFORE
// normalizeRows strips the column.
// ---------------------------------------------------------------------------
function readHasMore(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length === 0) return false;
  const last = raw[raw.length - 1] as Record<string, unknown>;
  return Boolean(last?.has_more);
}

function normalizeRows(raw: unknown): ItemLedgerRow[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id ?? ''),
    txn_ts: String(r.txn_ts ?? ''),
    txn_date: String(r.txn_date ?? ''),
    txn_type: String(r.txn_type ?? ''),
    farm_id: String(r.farm_id ?? ''),
    farm_name: r.farm_name == null ? null : String(r.farm_name),
    item_id: String(r.item_id ?? ''),
    item_name: String(r.item_name ?? ''),
    item_unit: String(r.item_unit ?? ''),
    item_category: String(r.item_category ?? ''),
    source_type: r.source_type == null ? null : String(r.source_type),
    source_id: r.source_id == null ? null : String(r.source_id),
    qty_in: Number(r.qty_in ?? 0),
    qty_out: Number(r.qty_out ?? 0),
    unit_price: r.unit_price == null ? null : Number(r.unit_price),
    total_price: r.total_price == null ? null : Number(r.total_price),
    reference_no: r.reference_no == null ? null : String(r.reference_no),
    notes: r.notes == null ? null : String(r.notes),
    supplier_id: r.supplier_id == null ? null : String(r.supplier_id),
    supplier_name: r.supplier_name == null ? null : String(r.supplier_name),
    prior_balance: Number(r.prior_balance ?? 0),
    running_balance: Number(r.running_balance ?? 0),
  }));
}
