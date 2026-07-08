# Deploying to Render — Static SPA + BFF Web Service

This guide deploys the **Morvarid-Farm** app to Render as **two
services** (one static, one web) defined by
[`render.yaml`](../render.yaml).

| Service | Type | Why |
|---|---|---|
| `morvarid-farm` | Static Site | SPA + a single inlined `dist/index.html` |
| `morvarid-farm-bff` | Node Web Service | Holds the Supabase service-role JWT (server-only) and proxies `auth.admin.*` calls |

The previous SPA-only version of this guide is obsolete — it shipped
the service-role key client-side. Do **not** follow it.

---

## 1. Build settings — the SPA

| Setting | Value | Notes |
|---|---|---|
| Runtime | `static` | |
| Build Command | `npm ci --no-audit --no-fund && npm run build` | `npm ci` requires committed `package-lock.json`. |
| Publish Directory | `dist` | produced by `vite build` with `vite-plugin-singlefile`. |
| Node version | `22.12.0` | pinned via `.node-version` + `engines` in both `package.json` and `bff/package.json`. |
| Auto-deploy | `Yes` | deploys on push to `main`. |
| Previews | `automatic` for `main` | service-level `previews.generation` (modern field, replaces the deprecated top-level boolean). |

SPA rewrite / route notes:
* `createHashRouter` resolves URLs entirely in the browser.
* Blueprint **does not** add a catch-all rewrite (a previous version
  did, but with the BFF model we don't need it; removing it tightens
  the surface.)

## 2. Build settings — the BFF

| Setting | Value |
|---|---|
| Runtime | `node` |
| Build Command | `npm ci --no-audit --no-fund` |
| Start Command | `node server.mjs` |
| Root Directory | `bff/` |
| Health Check Path | `/` |
| Auto-deploy | `Yes` |
| Previews | `automatic` for `main` |

## 3. Environment variables

### 3.1 SPA (`morvarid-farm` Static Site)

| Name | Required | Where it lives | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL` | yes | Render + `.env` | `https://YOUR.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | yes | Render + `.env` | publishable `sb_publishable_*` recommended |
| `VITE_BFF_URL` | yes | Render + `.env` | e.g. `https://morvarid-farm-bff.onrender.com` (no trailing slash) |
| `VITE_APP_VERSION` | optional | Render + `.env` | shown in the about pane |

> **Never set `VITE_SUPABASE_SERVICE_ROLE_KEY` on the SPA.**
> `check:env` rejects any `.env` that still has it
> (`scripts/check-env.mjs`).

### 3.2 BFF (`morvarid-farm-bff` Web Service)

| Name | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | same as the SPA |
| `VITE_SUPABASE_ANON_KEY` | yes | used to verify caller JWTs |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` | yes | **server-only**. Replace with `sb_secret_*` if available. |
| `ALLOWED_ORIGIN` | recommended | the SPA origin, e.g. `https://morvarid-farm.onrender.com` |

> **Never set `VITE_BFF_URL` on the BFF.**

## 4. Post-deploy step — Supabase URL configuration

After the first Render deploy, whitelist the new URL in Supabase:

1. Supabase Dashboard → **Authentication → URL Configuration**.
2. **Site URL** → `https://<your-service>.onrender.com`.
3. **Redirect URLs** → add the Site URL plus
   `https://<your-service>-pr-<NNN>.onrender.com` for previews.
4. Save.

Without this, login / OAuth / magic-link handshakes will fail with a
redirect URL error.

## 5. Apply database migrations (one time)

Run the SQL files under [`scripts/migrations/`](../scripts/migrations/)
**in order** in the Supabase SQL editor:

1. `001_create_inputs_table.sql` — catalogue table.
2. `002_seed_admin_user.sql` — admin bootstrap (default password
   `Admin@123`; rotate immediately).
3. **`003_admin_rpcs.sql`** — 30+ `rpc_admin_*` SECURITY DEFINER
   functions; replaces every previously-client-side admin write.
4. **`004_rls_policies.sql`** — read-side RLS so the anon client can
   SELECT rows. Writes are blocked at RLS — they go through the RPCs
   above.

If you skip step 3 the SPA's mutations will fail (every hook still
calls `supabase.rpc(...)`). If you skip step 4 the SPA's reads will
return empty rows.

## 6. Smoke test (after apply + deploy)

1. Open `https://<service>.onrender.com`. Login in Persian RTL.
2. As the seeded admin (`admin@morvarid.local` / `Admin@123` from
   migration `002`), open `/admin/users`. The list must load.
3. Create a new user. The hook should call
   `${VITE_BFF_URL}/api/auth-admin/users` (visible in the Network tab)
   and then `supabase.rpc('rpc_admin_upsert_profile', …)`.
4. Toggle the new user's `isActive`. Should call
   `supabase.rpc('rpc_admin_toggle_profile', …)`.
5. Resize to mobile widths; check the header for the redesigned
   Date/Time display.

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Build fails immediately on Render | Node version mismatch | verify `.node-version` is `22.12.0`; `bff/package.json` and root `package.json` both declare `engines.node >=22.12.0 <23`. |
| Login redirects with auth error | Render URL not in Supabase allow-list | set Site URL + Redirect URLs in Supabase. |
| `check:secrets` fails locally | a stale secret in `.env`, a tracked file leak, or a service-role JWT string in code | suppress intentional mentions in `scripts/check-secrets.mjs` SELF set; otherwise follow `docs/security/incident-response.md`. |
| `rpc_admin_…` returns "forbidden" | caller is not an active admin profile | verify RLS policy and `profiles.role = 'admin' AND is_active = true`. |
| `VITE_SUPABASE_SERVICE_ROLE_KEY still present` warning | template or script out of date | `scripts/check-env.mjs` STALE_REJECTED list catches this; remove from `.env`. |
| Service-role key was leaked publicly | (rotate NOW regardless of cause) | Follow `docs/security/incident-response.md` Step 0 first. |

## 8. Rollback

Render keeps every successful deploy.

* Open **morvarid-farm → Manual Deploy → Deploy a specific commit** and
  pick the last green one.
* Same for `morvarid-farm-bff`.
* To rotate the BFF-supplied service-role key, follow
  `docs/security/incident-response.md` Step 0.2 first, then re-deploy.

## 9. Migrating to the new Supabase API keys (`sb_publishable_*` / `sb_secret_*`)

The `anon` / `service_role` keys are deprecated end-of-2026. The
BFF/SPA model is forward-compatible — the BFF reads `sb_secret_*` and
the SPA reads `sb_publishable_*`. When you migrate:

1. Generate `sb_publishable_*` and `sb_secret_*` in Supabase.
2. Update `VITE_SUPABASE_ANON_KEY` (SPA) and
   `VITE_SUPABASE_SERVICE_ROLE_KEY` (BFF) to the new values.
3. Redeploy both services. No code changes are required.
4. Once verified, roll the legacy keys for safety.

## 10. References

* Render Blueprint reference: <https://docs.render.com/blueprint-spec>
* Render previews (modern field shape):
  <https://docs.render.com/previews>
* Vite env prefix: `vite.config.ts` declares `envPrefix: 'VITE_'`.
