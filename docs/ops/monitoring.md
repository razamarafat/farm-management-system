# Monitoring & Incident Response — Morvarid-Farm SPA

Minimal production observability wired in `src/lib/monitoring.ts`.

## What is collected

- Core Web Vitals: LCP, INP, CLS via `web-vitals` (`initWebVitals()` in `main.tsx`).
- React render crashes via `ErrorBoundary` → `reportError()`.
- BFF logs to stdout (Render captures). No PII in logs by design.

## Endpoints (optional, both no-op when unset)

| Env | Purpose |
|---|---|
| `VITE_RUM_ENDPOINT` | POST JSON vitals `{name, value, rating, page, buildId}`. Use BetterStack/Datadog/Sentry ingest or a tiny collector. |
| `VITE_ERROR_ENDPOINT` | POST JSON errors `{message, stack, page, buildId}`. |

Local dev: console-only. Prod without endpoints: vitals sampled client-side only, errors stay in console + Render logs.

## Uptime & certs (human steps, 15 min)

1. UptimeRobot / BetterStack: monitor `https://<spa>/version.json` (200) every 5 min, alert after 2 failures.
2. Same monitor for `https://<bff>/health` and `https://<export-api>/health`.
3. Cert expiry alert 14 days before (Render auto-renews, but alert anyway).
4. Supabase → Settings → API: confirm Site URL + Redirect URLs include prod + preview domains.

## Alert thresholds (initial)

- SPA 5xx or version.json down 2 min → page.
- BFF `/health` down 2 min → page (user management blocked).
- INP p75 > 500ms for 1h → ticket. LCP p75 > 4s → ticket.
- New `reportError` spike (>10/min) → ticket.

## Runbooks (link from alerts)

- SPA down but BFF up: Render → Manual Deploy → last green commit (rollback <5 min).
- BFF 401/403 spike: check Supabase Auth outage + `profiles.role/is_active`, then `docs/security/incident-response.md` Step 0.
- Export 500s: check export-api logs + Supabase RPC latency (`perf-budget.mjs` budgets).

## Retention

- Render logs 30d. RUM/error collector 90d. No credentials/tokens in any payload (verified in `monitoring.ts`).
