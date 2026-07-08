// =====================================================================
// useConsumptionSummary
//
// Single-shot (no pagination) RPC call for RPT_CONSUMPTION_ANALYTICS.
//
// Backed by: public.reporting_consumption_summary(p_date_from,
// p_date_to, p_farm_id?, p_category?, p_group_by) — SECURITY INVOKER +
// STABLE. Returns per row: group_key, group_label, consumed_qty,
// waste_qty, total_qty, voucher_count, item_category.
//
// Why post-groupBy?
//   The RPC consumes only one p_farm_id and one p_category; it does NOT
//   have parameters for hall_id, item_id, or formula_id. We leave those
//   filters client-side (the section component handles them) so we don't
//   have to plumb a new RPC signature. This is acceptable for v1 because
//   the dataset is bounded by daily vouchers and the row count rarely
//   exceeds a few hundred per (farm, category, group).
//
// Stale-fetch guard:
//   Same pattern as useInventoryValuationSummary — capture the most-
//   recent requested key in a ref and drop out-of-order responses.
//   This is what guarantees isLoading flips back to `false` cleanly
//   when the user sweeps the date picker.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Group-by modes supported by the underlying RPC.
export type GroupByMode = 'day' | 'item' | 'hall' | 'formula';

// Row shape matches the RPC's RETURN TABLE.
export interface ConsumptionSummaryRow {
  group_key: string;
  group_label: string;
  consumed_qty: number;
  waste_qty: number;
  total_qty: number;
  voucher_count: number;
  item_category: string | null;
}

export interface UseConsumptionSummaryParams {
  /** ISO "yyyy-MM-dd" — required */
  date_from: string;
  /** ISO "yyyy-MM-dd" — required */
  date_to: string;
  /** Optional single farm filter. */
  farm_id?: string | null;
  /** Optional category text filter ('feed' | 'packaging' | custom). */
  category?: string | null;
  /** Which axis to group by — see GroupByMode. */
  group_by: GroupByMode;
}

export interface UseConsumptionSummaryResult {
  rows: ConsumptionSummaryRow[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useConsumptionSummary({
  date_from,
  date_to,
  farm_id,
  category,
  group_by,
}: UseConsumptionSummaryParams): UseConsumptionSummaryResult {
  const [rows, setRows] = useState<ConsumptionSummaryRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Track the most-recent requested key so out-of-order responses can be
  // detected and dropped. Bumped on every dependency change.
  const latestKeyRef = useRef<string>(
    `${date_from}|${date_to}|${farm_id ?? ''}|${category ?? ''}|${group_by}|${reloadNonce}`,
  );

  useEffect(() => {
    const myKey =
      `${date_from}|${date_to}|${farm_id ?? ''}|${category ?? ''}|${group_by}|${reloadNonce}`;
    latestKeyRef.current = myKey;
    let cancelled = false;

    const fetchRows = async () => {
      // Empty required dates — don't call RPC; make sure the spinner
      // isn't stranded on a malformed request.
      if (!date_from || !date_to) {
        setRows([]);
        setIsLoading(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc(
          'reporting_consumption_summary',
          {
            p_date_from: date_from,
            p_date_to: date_to,
            p_farm_id: farm_id ?? null,
            p_category: category ?? null,
            p_group_by: group_by,
          },
        );

        if (cancelled || latestKeyRef.current !== myKey) return;

        if (rpcError) {
          console.error('Consumption summary RPC error:', rpcError);
          setError(rpcError.message || 'خطا در دریافت خلاصهٔ مصرف');
          setRows([]);
          return;
        }

        const raw = Array.isArray(data) ? data : [];
        const normalized: ConsumptionSummaryRow[] = raw.map((r) => {
          const rec = r as Record<string, unknown>;
          return {
            group_key: String(rec.group_key ?? ''),
            group_label: String(rec.group_label ?? ''),
            consumed_qty: Number(rec.consumed_qty ?? 0),
            waste_qty: Number(rec.waste_qty ?? 0),
            total_qty: Number(rec.total_qty ?? 0),
            voucher_count: Number(rec.voucher_count ?? 0),
            item_category:
              rec.item_category == null ? null : String(rec.item_category),
          };
        });

        setRows(normalized);
      } catch (e) {
        if (cancelled || latestKeyRef.current !== myKey) return;
        const msg = e instanceof Error ? e.message : 'unknown error';
        setError(msg);
        setRows([]);
      } finally {
        if (!cancelled && latestKeyRef.current === myKey) {
          setIsLoading(false);
        }
      }
    };

    fetchRows();

    return () => {
      cancelled = true;
    };
  }, [date_from, date_to, farm_id, category, group_by, reloadNonce]);

  const refetch = useCallback(() => setReloadNonce((n) => n + 1), []);

  return { rows, isLoading, error, refetch };
}
