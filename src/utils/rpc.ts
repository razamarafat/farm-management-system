// =====================================================================
// src/utils/rpc.ts
// Thin typed wrapper around `supabase.rpc`.
//
// The wrapper deliberately accepts `name: string` (not the strict
// union of known RPC names from `database.types.ts`) so we can call
// our `rpc_admin_*` family without needing generated Database type
// updates. The wire call still validates the function name server-side.
//
// rpcError lives in src/utils/rpcError.ts (matches the import path
// the three migrated hooks already use — do not duplicate here).
// =====================================================================
import { supabase } from '@/lib/supabase';

// Cast away the literal-type union; we do not need its narrowing.
const rpcUntyped = supabase.rpc as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function rpc<T = unknown>(
  name: string,
  payload: Record<string, unknown> = {},
): Promise<{ data: T | null; error: string | null }> {
  // PostgREST drops fields the typed overload returns (status /
  // statusText / count), which none of our call sites use.
  const { data, error } = await rpcUntyped(name, payload);
  if (error) return { data: null, error: error.message };
  return { data: (data ?? null) as T | null, error: null };
}

