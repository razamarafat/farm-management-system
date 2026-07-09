// =====================================================================
// useReportSection — shared data hook for the 6 v3 reports.
//
// All 6 v3 reporting_* RPCs are SECURITY INVOKER + RLS-scoped, so the
// JWT-bound `supabase` client (see USE-JWT-CLIENT below) makes the
// RLS-helper predicates
// (`has_farm_access_v2(...)`, `(SELECT auth.uid())`, etc.)
// naturally evaluate against the calling user. We do NOT use
// `supabaseAdmin` here — that anon-keyed client falls through every
// RLS gate and would break the migration 012 helper-pattern.
//
// Params are stable-stringified into the useEffect dep array so that
// filter changes from the parent re-fetch deterministically. The
// `refreshIndex` refetch counter is incremented on user-driven
// retry/manual refresh.
//
// `T` is intentionally constrained to `Record<string, unknown>` (not a
// tighter `ReportSectionRow` shape) — each report returns rows with
// DIFFERENT primary keys (txn_id for RPT_PURCHASES, item_id for
// RPT_REORDER_POINT, etc.) so we let the section component declare
// its natural row shape and pass the primary-key to ReportTable
// via the existing `rowIdKey` prop. The hook is agnostic.
//
// We are NOT using TanStack Query (verified by reading src/hooks/
// — no useQuery/useMutation anywhere in the project). The plain
// pattern mirrors useInventoryTransactions so the SPA-owned hook
// + section component can pair with no extra abstraction cost.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Local typed shape for supabase.rpc when called with a string-typed
 * RPC name + a Record params. We don't widen this to `any` because
 * the response surface area is small and well-typed; callers can
 * still cast their generic `T` on top.
 */
type SupabaseRpcFn = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;

// `as` is necessary because supabase.rpc's literal-typed overload does
// not accept `string` names. The shape below is exactly what the
// generic (T extends Record<string, unknown>) caller will receive
// and re-cast on top of.
const rpcFn = supabase.rpc as unknown as SupabaseRpcFn;

export interface UseReportSectionResult<T extends Record<string, unknown>> {
  rows: T[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useReportSection<T extends Record<string, unknown>>(
  rpcName: string,
  params: Record<string, unknown>,
): UseReportSectionResult<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  // Stable stringified key so referentially-different but value-equal
  // params don't trigger spurious re-fetches. Object-key order is
  // deterministic in JSON.stringify (modern Node + browsers).
  const paramsKey = JSON.stringify(params);

  const inflightRef = useRef<AbortController | null>(null);

  const fetchOnce = useCallback(async () => {
    // Cancel any prior in-flight call.
    inflightRef.current?.abort();
    const ctrl = new AbortController();
    inflightRef.current = ctrl;

    setIsLoading(true);
    setError(null);

    try {
      // NOTE: `supabase.rpc` does not natively wire AbortSignal, but
      // we mark the in-flight ctrl as aborted on cleanup so unmount
      // drops the response instead of calling setRows on a dead tree.
      const result = await rpcFn(rpcName, params);
      if (ctrl.signal.aborted) return;
      const { data, error: rpcError } = result;
      if (rpcError) {
        setError(rpcError.message);
        setRows([]);
      } else {
        // Two-step cast: `unknown` first to satisfy strict mode's
        // "neither type sufficiently overlaps" check on generic
        // conversions.
        setRows(((data ?? []) as unknown) as T[]);
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const msg = e instanceof Error ? e.message : 'خطای ناشناخته';
      setError(msg);
      setRows([]);
    } finally {
      if (!ctrl.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [rpcName, paramsKey]);

  useEffect(() => {
    void fetchOnce();
    return () => {
      // Cleanup marks the in-flight ctrl as aborted; fetchOnce's
      // own check will short-circuit subsequent setState.
      inflightRef.current?.abort();
    };
  }, [fetchOnce, refreshIndex]);

  const refetch = useCallback(() => {
    setRefreshIndex((i) => i + 1);
  }, []);

  return {
    rows,
    totalCount: rows.length,
    isLoading,
    error,
    refetch,
  };
}
