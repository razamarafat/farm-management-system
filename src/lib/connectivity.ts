/**
 * Own-origin reachability signal (deploy-update / status icon).
 *
 * Probes the app's OWN origin via a cache-busting GET of `version.json` — the
 * same tiny static file the deploy-detection layer (AppUpdater) serves. This
 * tells us whether the app's own assets are reachable, which is the right
 * signal for deploy-update detection and the top-bar status icon.
 *
 * It is NOT the signal for the offline data layer. Whether the Supabase
 * backend is reachable is a different fact tracked in
 * src/lib/supabaseReachability.ts; the read facade routes through that module
 * so "origin reachable" is never conflated with "Supabase reachable".
 *
 * navigator.onLine alone is unreliable (it only reflects the browser's link
 * state), so the truth comes from this active probe. Probes are deduplicated
 * (one in flight at a time) and cached; listeners are notified on change.
 */

const PROBE_URL = (() => {
  try {
    return new URL(`${import.meta.env.BASE_URL}version.json`, window.location.href).toString();
  } catch {
    return 'version.json';
  }
})();

const PROBE_TIMEOUT_MS = 5000;

let cached: boolean | null = null;
let probeInFlight: Promise<boolean> | null = null;
const listeners = new Set<(online: boolean) => void>();

async function probe(): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${PROBE_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Run (or join) an active connectivity probe; returns the definitive answer. */
export async function checkConnectivity(): Promise<boolean> {
  if (!probeInFlight) {
    probeInFlight = probe()
      .then((ok) => {
        cached = ok;
        probeInFlight = null;
        listeners.forEach((l) => l(ok));
        return ok;
      })
      .catch(() => {
        cached = false;
        probeInFlight = null;
        return false;
      });
  }
  return probeInFlight;
}

/**
 * Synchronous best-known answer. Returns the cached probe result; when none
 * exists yet it optimistically uses navigator.onLine and kicks a background
 * probe so the truth arrives shortly after.
 */
export function isOnline(): boolean {
  if (cached === null) {
    cached = navigator.onLine;
    void checkConnectivity();
  }
  return cached;
}

/** The browser told us the link is down — trust it without a probe. */
export function markOffline(): void {
  cached = false;
  listeners.forEach((l) => l(false));
}

/** Subscribe to connectivity changes. Returns an unsubscribe function. */
export function onConnectivityChange(cb: (online: boolean) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Test-only escape hatch: force the cached answer (used by QA scripts). */
export function __setConnectivity(online: boolean | null): void {
  cached = online;
}
