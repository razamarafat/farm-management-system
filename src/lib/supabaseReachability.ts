/**
 * Supabase-specific reachability signal for the offline data layer (Gap 2).
 *
 * This is deliberately separate from `src/lib/connectivity.ts`, which probes
 * the app's OWN origin (`version.json`) for deploy-update detection. "Own
 * origin reachable" and "Supabase reachable" are different facts — the CDN/
 * origin can be up while the Supabase backend is down, and vice versa. The
 * read facade (`src/lib/offline/reads.ts`) must decide online vs offline
 * based on whether the DATA source is reachable, so it uses this module
 * rather than the origin probe.
 *
 * The probe is a lightweight PostgREST round-trip against the small `farms`
 * table with a short timeout. It uses a raw `fetch` (not the supabase-js
 * thenable) because `fetch` REJECTS on a network failure (refused / reset /
 * timeout / offline) and RESOLVES for any HTTP response — even a 4xx/5xx or
 * RLS denial — which is exactly the signal we need: "did the backend answer?"
 *
 * Results are cached for a short TTL so the several sequential reads that a
 * single screen performs don't each pay a full probe round-trip, while still
 * re-detecting an outage or recovery within a few seconds.
 */
const PROBE_TIMEOUT_MS = 5000;
const PROBE_TTL_MS = 3000;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let cached: boolean | null = null;
let cachedAt = 0;
let probeInFlight: Promise<boolean> | null = null;
const listeners = new Set<(reachable: boolean) => void>();

async function probe(): Promise<boolean> {
  if (!supabaseUrl || !supabaseAnonKey) return false;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(`${supabaseUrl}/rest/v1/farms?select=id&limit=1`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Run (or join) a Supabase reachability probe, cached for a short TTL. */
export async function checkSupabaseReachability(): Promise<boolean> {
  const now = Date.now();
  if (cached !== null && now - cachedAt < PROBE_TTL_MS) {
    return cached;
  }
  if (!probeInFlight) {
    probeInFlight = probe()
      .then((ok) => {
        cached = ok;
        cachedAt = Date.now();
        probeInFlight = null;
        listeners.forEach((l) => l(ok));
        return ok;
      })
      .catch(() => {
        cached = false;
        cachedAt = Date.now();
        probeInFlight = null;
        return false;
      });
  }
  return probeInFlight;
}

/**
 * Synchronous best-known answer. When no probe has run yet it optimistically
 * uses the browser link state and kicks a background probe so the truth
 * arrives shortly after.
 */
export function isSupabaseReachable(): boolean {
  if (cached === null) {
    cached = navigator.onLine;
    void checkSupabaseReachability();
  }
  return cached;
}

/** Subscribe to Supabase reachability changes. Returns an unsubscribe fn. */
export function onSupabaseReachabilityChange(cb: (reachable: boolean) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Test/QA escape hatch: force the cached answer (respected within the TTL). */
export function __setSupabaseReachability(reachable: boolean | null): void {
  cached = reachable;
  cachedAt = Date.now();
}
