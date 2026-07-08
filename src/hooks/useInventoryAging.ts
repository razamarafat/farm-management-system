// =====================================================================
// useInventoryAging
//
// Single-shot (no pagination) RPC call for RPT_INVENTORY_AGING.
//
// Backed by: public.reporting_inventory_aging(p_as_of?, p_farm_id?,
// p_category?, p_dead_stock_days?) — SECURITY INVOKER + STABLE.
// Returns per row: farm_id, farm_name, item_id, item_name, item_unit,
// item_category, on_hand_qty, last_movement_date, days_since_last_movement,
// age_bucket, unit_cost, priced_on, value_rial, dead_stock, as_of_date.
//
// Why single-shot?
//   The dataset is bounded by the (farm × item) pair cardinality — for a
//   typical mid-sized farm that's a few hundred rows at most. The PHP
//   page-stale-fetch guard ensures date sweeps don't strand the spinner
//   when the user rapidly changes the as-of date.
//
// Stale-fetch guard:
//   Same pattern as useInventoryValuationSummary — capture the most-
//   recent requested key in a ref and drop out-of-order responses.
//   isLoading flips back to `false` cleanly on reset.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Row shape matches the RPC's RETURN TABLE.
export interface InventoryAgingRow {
  farm_id: string;
  farm_name: string;
  item_id: string;
  item_name: string;
  item_unit: string;
  item_category: string;
  on_hand_qty: number;
  last_movement_date: string | null;
  days_since_last_movement: number | null;
  age_bucket: string | null;
  unit_cost: number | null;
  priced_on: string | null;
  value_rial: number | null;
  dead_stock: boolean;
  as_of_date: string;
}

export interface UseInventoryAgingParams {
  /** ISO "yyyy-MM-dd" — required (drives the days-since computation). */
  as_of: string;
  /** Optional single farm filter. */
  farm_id?: string | null;
  /** Optional category text filter ('feed' | 'packaging' | custom). */
  category?: string | null;
  /** Threshold (in days) for the dead_stock flag. Default from constants. */
  dead_stock_days?: number;
}

export interface UseInventoryAgingResult {
  rows: InventoryAgingRow[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useInventoryAging({
  as_of,
  farm_id,
  category,
  dead_stock_days,
}: UseInventoryAgingParams): UseInventoryAgingResult {
  const [rows, setRows] = useState<InventoryAgingRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Stale-fetch guard — captured key, dropped if it no longer matches.
  const latestKeyRef = useRef<string>(
    `${as_of}|${farm_id ?? ''}|${category ?? ''}|${dead_stock_days ?? ''}|${reloadNonce}`,
  );

  useEffect(() => {
    const myKey =
      `${as_of}|${farm_id ?? ''}|${category ?? ''}|${dead_stock_days ?? ''}|${reloadNonce}`;
    latestKeyRef.current = myKey;
    let cancelled = false;

    const fetchRows = async () => {
      if (!as_of) {
        setRows([]);
        setIsLoading(false);
        setError(null);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc(
          'reporting_inventory_aging',
          {
            p_as_of: as_of,
            p_farm_id: farm_id ?? null,
            p_category: category ?? null,
            p_dead_stock_days: dead_stock_days ?? null,
          },
        );

        if (cancelled || latestKeyRef.current !== myKey) return;

        if (rpcError) {
          console.error('Inventory aging RPC error:', rpcError);
          setError(rpcError.message || 'خطا در دریافت پیر شدگی موجودی');
          setRows([]);
          return;
        }

        const raw = Array.isArray(data) ? data : [];
        const normalized: InventoryAgingRow[] = raw.map((r) => {
          const rec = r as Record<string, unknown>;
          return {
            farm_id: String(rec.farm_id ?? ''),
            farm_name: String(rec.farm_name ?? ''),
            item_id: String(rec.item_id ?? ''),
            item_name: String(rec.item_name ?? ''),
            item_unit: String(rec.item_unit ?? ''),
            item_category: String(rec.item_category ?? ''),
            on_hand_qty: Number(rec.on_hand_qty ?? 0),
            last_movement_date:
              rec.last_movement_date == null
                ? null
                : String(rec.last_movement_date),
            days_since_last_movement:
              rec.days_since_last_movement == null
                ? null
                : Number(rec.days_since_last_movement),
            age_bucket: rec.age_bucket == null ? null : String(rec.age_bucket),
            unit_cost: rec.unit_cost == null ? null : Number(rec.unit_cost),
            priced_on: rec.priced_on == null ? null : String(rec.priced_on),
            value_rial:
              rec.value_rial == null ? null : Number(rec.value_rial),
            dead_stock: Boolean(rec.dead_stock ?? false),
            as_of_date: String(rec.as_of_date ?? as_of),
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
  }, [as_of, farm_id, category, dead_stock_days, reloadNonce]);

  const refetch = useCallback(() => setReloadNonce((n) => n + 1), []);

  return { rows, isLoading, error, refetch };
}
