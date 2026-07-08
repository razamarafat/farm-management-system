// =====================================================================
// useInventoryValuationSummary
//
// Single-shot (no pagination) RPC call for RPT_INVENTORY_VALUATION_SUMMARY.
//
// Backed by: public.reporting_inventory_balance_as_of(p_as_of, p_farm_id?,
// p_item_id?, p_category?) — SECURITY INVOKER + STABLE.
//
// Numbers are returned by PostgREST as either number or string (extreme
// precision falls back to string); we coerce via Number() here so the
// table renderer can use toLocaleString without surprises.
//
// RLS does all the farm-scoping work; the SPA never passes a service-role
// key in this path.
//
// Stale-fetch guard:
//   When the user changes `as_of` rapidly (e.g. sweeps the date picker),
//   requests race. We capture the latest requested `as_of` in a ref and
//   ignore any out-of-order response whose `as_of` no longer matches.
//   This is what guarantees isLoading flips back to `false` cleanly
//   when the user clears the date — not stranded on a stale fetch.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Row shape matches the RPC's RETURN TABLE — augmented with farm_name
// (joined server-side via the RPC) for display.
export interface InventoryValuationRow {
  farm_id: string;
  farm_name: string | null;
  item_id: string;
  item_name: string;
  item_unit: string;
  item_category: string;
  on_hand_qty: number;
  unit_cost: number | null;
  cost_basis: string | null;
  priced_on: string | null;
  value_rial: number | null;
  as_of_date: string;
}

export interface InventoryValuationParams {
  /** ISO "yyyy-MM-dd" — required */
  as_of: string;
  /** Optional single farm filter (multi-farm is not supported by this RPC) */
  farm_id?: string | null;
  /** Optional category text filter ('feed' | 'packaging' | custom) */
  category?: string | null;
}

export interface UseInventoryValuationSummaryResult {
  rows: InventoryValuationRow[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useInventoryValuationSummary({
  as_of,
  farm_id,
  category,
}: InventoryValuationParams): UseInventoryValuationSummaryResult {
  const [rows, setRows] = useState<InventoryValuationRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Increment to trigger a refetch without changing the param refs.
  const [reloadNonce, setReloadNonce] = useState(0);

  // Tracks the most-recent requested key so out-of-order responses can be
  // detected and dropped. Bumped on every dependency change.
  const latestKeyRef = useRef<string>(`${as_of}|${farm_id ?? ''}|${category ?? ''}|${reloadNonce}`);

  useEffect(() => {
    const myKey = `${as_of}|${farm_id ?? ''}|${category ?? ''}|${reloadNonce}`;
    latestKeyRef.current = myKey;
    let cancelled = false;

    const fetchRows = async () => {
      if (!as_of) {
        // Empty key — don't call RPC; make sure the spinner isn't stranded.
        setRows([]);
        setIsLoading(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc(
          'reporting_inventory_balance_as_of',
          {
            p_as_of: as_of,
            p_farm_id: farm_id ?? null,
            p_item_id: null,
            p_category: category ?? null,
          },
        );

        if (cancelled || latestKeyRef.current !== myKey) return;

        if (rpcError) {
          console.error('Inventory valuation RPC error:', rpcError);
          setError(rpcError.message || 'خطا در دریافت ارزش موجودی');
          setRows([]);
          return;
        }

        const raw = Array.isArray(data) ? data : [];
        const normalized: InventoryValuationRow[] = raw.map((r) => {
          const rec = r as Record<string, unknown>;
          return {
            farm_id: String(rec.farm_id ?? ''),
            farm_name: rec.farm_name == null ? null : String(rec.farm_name),
            item_id: String(rec.item_id ?? ''),
            item_name: String(rec.item_name ?? ''),
            item_unit: String(rec.item_unit ?? ''),
            item_category: String(rec.item_category ?? ''),
            on_hand_qty: Number(rec.on_hand_qty ?? 0),
            unit_cost: rec.unit_cost == null ? null : Number(rec.unit_cost),
            cost_basis: rec.cost_basis == null ? null : String(rec.cost_basis),
            priced_on: rec.priced_on == null ? null : String(rec.priced_on),
            value_rial:
              rec.value_rial == null ? null : Number(rec.value_rial),
            as_of_date: String(rec.as_of_date ?? as_of),
          };
        });

        // Decorate with farm_name via lightweight farm lookup so the
        // table can show "فارم مرکزی" without an extra dispatcher arg.
        await decorateWithFarmNames(normalized);
        if (cancelled || latestKeyRef.current !== myKey) return;
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
  }, [as_of, farm_id, category, reloadNonce]);

  const refetch = useCallback(() => setReloadNonce((n) => n + 1), []);

  return { rows, isLoading, error, refetch };
}

// ---------------------------------------------------------------------------
// Lightweight farm-name lookup. We do this on the client (not the RPC
// caller side) because the RPC intentionally only ships the numeric
// facts; presentation labels belong in the SPA. The lookup is in-memory
// after one query for however many farms the report covers.
// ---------------------------------------------------------------------------
const farmNameCache = new Map<string, string>();

async function decorateWithFarmNames(rows: InventoryValuationRow[]): Promise<void> {
  if (rows.length === 0) return;
  const missing = rows
    .filter((r) => !r.farm_name && !farmNameCache.has(r.farm_id))
    .map((r) => r.farm_id);
  if (missing.length === 0) {
    rows.forEach((r) => {
      if (!r.farm_name) r.farm_name = farmNameCache.get(r.farm_id) ?? null;
    });
    return;
  }
  try {
    const { data, error } = await supabase
      .from('farms')
      .select('id, name')
      .in('id', [...new Set(missing)]);
    if (error || !data) return;
    (data as Array<{ id: string; name: string }>).forEach((f) => {
      farmNameCache.set(f.id, f.name);
    });
    rows.forEach((r) => {
      if (!r.farm_name) r.farm_name = farmNameCache.get(r.farm_id) ?? null;
    });
  } catch {
    // Soft-fail: leaving farm_name null is acceptable — the column will
    // fall back to em-dash in the renderer.
  }
}
