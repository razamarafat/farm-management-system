// =====================================================================
// monitoring.ts — minimal production observability for the SPA.
//
// - Core Web Vitals (LCP/INP/CLS) via `web-vitals`, reported to
//   `VITE_RUM_ENDPOINT` when set, otherwise logged to console in dev.
// - Central error reporter used by ErrorBoundary + chunk guard.
//   When `VITE_ERROR_ENDPOINT` is set, errors are POSTed as JSON;
//   otherwise they stay local (console) so no PII ever leaks by default.
//
// No Sentry DSN is required. If a Sentry DSN is later added, wire it
// here in one place instead of scattering SDK calls across components.
// =====================================================================

export interface VitalReport {
  name: string;
  value: number;
  rating: string;
  navigationType: string;
}

function postJson(url: string, payload: unknown): void {
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // never throw from observability
  }
}

export function reportVital(v: VitalReport): void {
  const endpoint = (import.meta.env.VITE_RUM_ENDPOINT as string | undefined)?.trim();
  const payload = {
    ...v,
    page: typeof window !== 'undefined' ? window.location.pathname : '',
    buildId: import.meta.env.VITE_BUILD_ID ?? '',
  };
  if (endpoint) {
    postJson(endpoint, payload);
    return;
  }
  if (import.meta.env.DEV) {
    console.debug('[vitals]', v.name, Math.round(v.value), v.rating);
  }
}

export function initWebVitals(): void {
  void import('web-vitals').then(({ onLCP, onINP, onCLS }) => {
    onLCP((m) => reportVital({ name: m.name, value: m.value, rating: m.rating, navigationType: m.navigationType }));
    onINP((m) => reportVital({ name: m.name, value: m.value, rating: m.rating, navigationType: m.navigationType }));
    onCLS((m) => reportVital({ name: m.name, value: m.value, rating: m.rating, navigationType: m.navigationType }));
  }).catch(() => undefined);
}

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const endpoint = (import.meta.env.VITE_ERROR_ENDPOINT as string | undefined)?.trim();
  const payload = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack?.slice(0, 4000) : undefined,
    page: typeof window !== 'undefined' ? window.location.pathname : '',
    buildId: import.meta.env.VITE_BUILD_ID ?? '',
    ...context,
  };
  console.error('[monitoring] error:', payload.message);
  if (endpoint) postJson(endpoint, payload);
}
