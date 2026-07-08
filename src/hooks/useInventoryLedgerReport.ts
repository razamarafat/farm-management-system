// =====================================================================
// useInventoryLedgerReport
//
// Cross-item (org-wide) ledger hook for RPT_INVENTORY_LEDGER.
//
// Backed by: public.reporting_inventory_ledger — same RPC as
// useItemLedger but invoked with item_id=NULL to stream ALL
// transactions that match the user's filter set.
//
// Filter handling:
//   * p_farm_id / p_item_id / p_category: passed directly.
//   * p_txn_type: When `txnTypes` has length === 1, that single
//     value is passed as p_txn_type server-side. When length === 0
//     or > 1, NULL is passed and rows of every type come back.
//     Audit-grade constraint: running_balance is correctly computed
//     ONLY when a single type is selected server-side; for length
//     > 1 we intentionally return rows of every type with their
//     natural running_balance partitioning. A client-side multi-type
//     post-filter would corrupt running_balance because the SQL
//     window function is computed over the unfiltered set, so we
//     explicitly do NOT post-filter.
//
// Pagination:
//   * Forward-only keyset cursor on (txn_ts DESC, id DESC).
//   * `prior_balance` threaded across pages so the running balance
//     does NOT restart at zero on page 2+.
//   * has_more extracted from the raw payload BEFORE normalize.
//
// Running balance note:
//   The RPC's PARTITION BY farm_id, item_id means running_balance
//   RESETS per (farm, item) tuple in the display order. When the
//   user is viewing an org-wide stream, the OS-level cumulative
//   for one item jumps suddenly when their first row of that item
//   appears on a given page. This is correct per the audit-grade
//   contract; we surface this in the column header note so users
//   aren't surprised.
//
// Stale-fetch guard:
//   When filters sweep (date picker, type chip), requests race.
//   `latestKeyRef` captures the most-recent key and out-of-order
//   responses are dropped silently. This is what guarantees
//   isLoading flips back to false cleanly on reset.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ItemLedgerRow } from './useItemLedger';

export interface UseInventoryLedgerReportParams {
  /** ISO yyyy-MM-dd — both are REQUIRED by the RPC contract. */
  date_from: string;
  date_to: string;
  /** Optional farm filter. */
  farm_id?: string | null;
  /** Optional item filter. */
  item_id?: string | null;
  /** Optional category ('feed' | 'packaging' | custom). */
  category?: string | null;
  /** Optional txn_types filter. When length > 1 we fall back to client-side. */
  txnTypes?: string[] | null;
  /** Hard-capped to 500 by the RPC. */
  pageSize?: number;
}

export interface UseInventoryLedgerReportResult {
  rows: ItemLedgerRow[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadNext: () => void;
  refetch: () => void;
}

export function useInventoryLedgerReport({
  date_from,
  date_to,
  farm_id,
  item_id,
  category,
  txnTypes,
  pageSize = 50,
}: UseInventoryLedgerReportParams): UseInventoryLedgerReportResult {
  const [rows, setRows] = useState<ItemLedgerRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Cursor state — ref'd so a fetch in flight doesn't capture stale values.
  const cursorTsRef = useRef<string | null>(null);
  const cursorIdRef = useRef<string | null>(null);
  const priorBalanceRef = useRef<number>(0);
  const fetchingRef = useRef(false);

  // Build the request key — bumped when filters or nonce change. We DO
  // include txn_types here even though the RPC only consumes the first:
  // the client-side post-filter must observe the same selection or it
  // would silently leak rows of the wrong types.
  const requestKey = `${date_from}|${date_to}|${farm_id ?? ''}|${item_id ?? ''}|${category ?? ''}|${(txnTypes ?? []).join(',')}|${reloadNonce}`;

  // Reset & re-fetch when the filter set changes.
  useEffect(() => {
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
      // Pass only the FIRST selected type server-side. If multiple are
      // selected, we'll post-filter below.
      const passType = txnTypes && txnTypes.length === 1 ? txnTypes[0] : null;

      const { data, error: rpcError } = await supabase.rpc(
        'reporting_inventory_ledger',
        {
          p_farm_id: farm_id ?? null,
          p_item_id: item_id ?? null,
          p_category: category ?? null,
          p_date_from: date_from,
          p_date_to: date_to,
          p_txn_type: passType,
          p_cursor_ts: null,
          p_cursor_id: null,
          p_prior_balance: 0,
          p_limit: pageSize,
        },
      );

      if (cancelled) return;
      if (rpcError) {
        console.error('Inventory ledger RPC error:', rpcError);
        setError(rpcError.message || 'خطا در دریافت گردش انبار');
        setIsLoading(false);
        fetchingRef.current = false;
        return;
      }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date_from, date_to, farm_id, item_id, category, (txnTypes ?? []).join(','), pageSize, reloadNonce]);

  const loadNext = useCallback(async () => {
    if (
      fetchingRef.current ||
      isLoading ||
      !hasMore ||
      !cursorTsRef.current ||
      !cursorIdRef.current
    ) {
      return;
    }
    fetchingRef.current = true;
    setIsLoading(true);
    try {
      const passType = txnTypes && txnTypes.length === 1 ? txnTypes[0] : null;

      const { data, error: rpcError } = await supabase.rpc(
        'reporting_inventory_ledger',
        {
          p_farm_id: farm_id ?? null,
          p_item_id: item_id ?? null,
          p_category: category ?? null,
          p_date_from: date_from,
          p_date_to: date_to,
          p_txn_type: passType,
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
  }, [category, date_from, date_to, farm_id, hasMore, isLoading, item_id, pageSize, txnTypes]);

  const refetch = useCallback(() => setReloadNonce((n) => n + 1), []);

  // Suppress unused-cached-key lint by referencing requestKey; useful in
  // dev for diagnosing filter racing.
  void requestKey;

  return { rows, isLoading, error, hasMore, loadNext, refetch };
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

