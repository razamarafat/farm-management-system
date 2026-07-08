// =====================================================================
// useParetoClassification
//
// Single-shot (no pagination) RPC call for RPT_PARETO_CLASSIFICATION.
//
// Backed by: public.reporting_pareto_classification(
//   p_date_from, p_date_to, p_farm_id?, p_category?, p_basis?,
//   p_a_threshold?, p_b_threshold?)
// SECURITY INVOKER + STABLE.
//
// Returns per row: item_id, farm_id, item_name, item_unit, item_category,
// farm_name, period_qty, unit_cost, basis_metric, share_pct, cumulative_share_pct,
// abc_class, on_hand_qty, reorder_point, avg_daily_consumption,
// reorder_recommended, reorder_basis, date_from, date_to, basis.
//
// Why single-shot?
//   Pareto operates on ACTIVE rows in the date window — bounded by
//   farm_items count (a few hundred rows at most per farm). Pagination
//   would corrupt cumulative-share / A-B-C assignment because each page
//   would have its own running total.
//
// Stale-fetch guard:
//   Same pattern as useInventoryAging. Capture the most-recent requested
//   key in a ref and drop out-of-order responses. isLoading flips back
//   to `false` cleanly on reset.
//
// Threshold handling:
//   Component passes ABC_THRESHOLDS.A * 100 (70) and ABC_THRESHOLDS.B * 100
//   (90) as numeric params so the SQL cumulative-share boundary stays
//   synced with the constants object. A future UI slider will dispatch
//   the override without touching this hook.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ABC_THRESHOLDS,
  type AbcBasis,
} from '@/utils/constants';

export interface ParetoRow {
  item_id: string;
  farm_id: string;
  item_name: string;
  item_unit: string;
  item_category: string;
  farm_name: string;
  period_qty: number;
  unit_cost: number | null;
  basis_metric: number;
  share_pct: number;
  cumulative_share_pct: number;
  abc_class: 'A' | 'B' | 'C' | string;
  on_hand_qty: number;
  reorder_point: number;
  avg_daily_consumption: number;
  reorder_recommended: boolean;
  reorder_basis: string;
  date_from: string;
  date_to: string;
  basis: 'value' | 'quantity' | string;
}

export interface UseParetoClassificationParams {
  /** ISO yyyy-MM-dd — required. */
  date_from: string;
  /** ISO yyyy-MM-dd — required. */
  date_to: string;
  /** Optional single farm filter. */
  farm_id?: string | null;
  /** Optional category text filter. */
  category?: string | null;
  /** Classification basis: 'value' (default, uses unit_cost) | 'quantity'. */
  basis?: AbcBasis;
}

export interface UseParetoClassificationResult {
  rows: ParetoRow[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useParetoClassification({
  date_from,
  date_to,
  farm_id,
  category,
  basis = 'value',
}: UseParetoClassificationParams): UseParetoClassificationResult {
  const [rows, setRows] = useState<ParetoRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Stale-fetch guard — captured key, dropped if it no longer matches.
  const latestKeyRef = useRef<string>(
    `${date_from}|${date_to}|${farm_id ?? ''}|${category ?? ''}|${basis}|${reloadNonce}`,
  );

  useEffect(() => {
    const myKey =
      `${date_from}|${date_to}|${farm_id ?? ''}|${category ?? ''}|${basis}|${reloadNonce}`;
    latestKeyRef.current = myKey;
    let cancelled = false;

    const fetchRows = async () => {
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
          'reporting_pareto_classification',
          {
            p_date_from: date_from,
            p_date_to: date_to,
            p_farm_id: farm_id ?? null,
            p_category: category ?? null,
            p_basis: basis,
            // Constants are fractions (0-1); RPC wants percentages.
            p_a_threshold: ABC_THRESHOLDS.A * 100,
            p_b_threshold: ABC_THRESHOLDS.B * 100,
          },
        );

        if (cancelled || latestKeyRef.current !== myKey) return;

        if (rpcError) {
          console.error('Pareto classification RPC error:', rpcError);
          setError(rpcError.message || 'خطا در دریافت طبقه‌بندی پارتو');
          setRows([]);
          return;
        }

        const raw = Array.isArray(data) ? data : [];
        const normalized: ParetoRow[] = (raw as Array<Record<string, unknown>>).map((r) => ({
          item_id: String(r.item_id ?? ''),
          farm_id: String(r.farm_id ?? ''),
          item_name: String(r.item_name ?? ''),
          item_unit: String(r.item_unit ?? ''),
          item_category: String(r.item_category ?? ''),
          farm_name: String(r.farm_name ?? ''),
          period_qty: Number(r.period_qty ?? 0),
          unit_cost: r.unit_cost == null ? null : Number(r.unit_cost),
          basis_metric: Number(r.basis_metric ?? 0),
          share_pct: Number(r.share_pct ?? 0),
          cumulative_share_pct: Number(r.cumulative_share_pct ?? 0),
          abc_class: String(r.abc_class ?? 'C'),
          on_hand_qty: Number(r.on_hand_qty ?? 0),
          reorder_point: Number(r.reorder_point ?? 0),
          avg_daily_consumption: Number(r.avg_daily_consumption ?? 0),
          reorder_recommended: Boolean(r.reorder_recommended ?? false),
          reorder_basis: String(r.reorder_basis ?? ''),
          date_from: String(r.date_from ?? date_from),
          date_to: String(r.date_to ?? date_to),
          basis: String(r.basis ?? basis),
        }));

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
  }, [date_from, date_to, farm_id, category, basis, reloadNonce]);

  const refetch = useCallback(() => setReloadNonce((n) => n + 1), []);

  return { rows, isLoading, error, refetch };
}
