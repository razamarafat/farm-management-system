// =====================================================================
// src/utils/rpcError.ts
// Uniform mapper for any thrown shape (JS Error, PostgrestError, PG
// RAISE EXCEPTION string, or raw object with .message) into a string
// suitable for toast.error(...) and surface-level logging.
//
// Always returns a string or null. Never throws.
// =====================================================================
export function rpcError(e: unknown): string | null {
  if (e === null || e === undefined) return null;
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  if (typeof e === 'object') {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  try { return String(e); } catch { return null; }
}
