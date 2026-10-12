// =====================================================================
// src/utils/mutationGuard.ts
//
// Guard against SILENT PostgREST mutation failures.
//
// Root cause (see task report): a direct `.update()` / `.delete()` that is
// denied by Row Level Security does NOT resolve with `{ error }` — PostgREST
// returns `200 OK` with an empty row set. supabase-js therefore resolves
// `{ data: [], error: null }` and every caller that only checked `error`
// showed a false "انجام شد" success toast while the database was untouched.
//
// Required pattern for every direct mutation in this codebase:
//
//   const { data, error } = await supabase
//     .from('…')
//     .update(…) / .delete(…)
//     .eq('id', id)
//     .select('id');              // <-- force PostgREST to return rows
//   assertMutationAffected(data, error);  // <-- throws on 0 rows
//
// RPC-based writes (SECURITY DEFINER `rpc_admin_*`) already surface
// server-side errors via `{ error }`, so they do not need this guard.
// =====================================================================

/** Persian message shown when RLS (or a missing row) blocks a mutation. */
export const MUTATION_BLOCKED_MESSAGE =
  'تغییرات اعمال نشد — دسترسی کافی ندارید یا رکورد یافت نشد';

/**
 * Verify a mutation actually touched the database. Throws an Error when
 * the request failed OR when zero rows were returned (RLS deny / missing
 * row). Returns the affected rows otherwise.
 */
export function assertMutationAffected<T>(
  data: T[] | null,
  error: { message?: string } | null,
  blockedMessage: string = MUTATION_BLOCKED_MESSAGE,
): T[] {
  if (error) {
    throw new Error(error.message || blockedMessage);
  }
  if (!data || data.length === 0) {
    throw new Error(blockedMessage);
  }
  return data;
}
