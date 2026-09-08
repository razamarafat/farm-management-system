# Plan 015: Harden the BFF auth-admin surface (fail-closed CORS, PATCH allowlist, quiet responses, throttling)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a9257dd..HEAD -- bff/server.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Handling rule for this plan**: you work next to a server-side credential
> (`bff/.env` holds the service-role key type). Never print, copy, or commit
> credential values. Refer to them only by file path and variable name.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `a9257dd`, 2026-09-07

## Why this matters

`bff/server.mjs` holds the service-role key server-side and exposes five
`auth.admin.*` endpoints (create/list/update/delete user, reset password). Any
holder of a stolen admin JWT can call them, and today three weaknesses widen
that blast radius: CORS defaults to `*` while allowing the `Authorization`
header (any website can drive the API cross-origin); PATCH accepts an
unallowlisted role, skips the password-length floor the other routes enforce,
and merges arbitrary `user_metadata`; responses return full user objects and
raw upstream error text. Fail-closed CORS plus strict PATCH validation plus
quiet responses plus basic throttling shrink a JWT leak from "full account
takeover from any site" to "rate-limited, least-privilege calls from the SPA
origin only".

## Current state

The relevant file and its role:

- `bff/server.mjs` — node:http BFF (215 lines). Five routes, bearer-token auth
  via `admin.auth.getUser(token)` + `profiles` role check (`:85-104`, already
  correct — do not change the auth logic).

Excerpts as they exist today (verified 2026-09-07):

```js
// bff/server.mjs:24-29 — wildcard CORS default
const PORT = 10000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// bff/server.mjs:46-52 — origin reflected while Authorization is allowed
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
```

```js
// bff/server.mjs:106-119 — create path validates (keep as reference behavior)
const { email, password, role = 'operator', username, email_confirm = true } = body || {};
if (!email || !password) return send(res, 400, { error: 'email_and_password_required' });
if (String(password).length < 8) return send(res, 400, { error: 'password_too_short' });
...
if (error) return send(res, 400, { error: error.message });       // verbose
return send(res, 200, { id: data.user?.id, user: data.user });    // full object
```

```js
// bff/server.mjs:151-167 — PATCH: no role allowlist, no password floor,
// arbitrary metadata merge, verbose response
if (req.method === 'PATCH') {
  const body = await readBody(req);
  const patch = {};
  if (body?.password)   patch.password = body.password;           // no length check
  if (body?.role || body?.username) {
    patch.user_metadata = {
      ...(body?.user_metadata || {}),                             // arbitrary merge
      ...(body?.role ? { role: body.role } : {}),                 // any string
      ...
```

Repo conventions that apply here:

- Error codes are short snake_case strings (`{ error: 'password_too_short' }`),
  never raw upstream text — extend this convention, don't invent a new shape.
- `BODY_LIMIT_BYTES = 64KB` + `readBody` discipline stays untouched.
- AGENTS.md RULE 1 (no fabricated business data): verification uses synthetic
  HTTP requests against a locally started BFF with dummy env values and
  expects 401/403/400 codes only — never a live Supabase project, never real
  users. RULE 2's `dist/` rebuild does NOT apply (BFF is not bundled into the
  SPA; `npm run build` only builds the SPA).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Syntax | `node --check bff/server.mjs` | exit 0, no output |
| SPA unaffected | `npx tsc --noEmit` | exit 0 (you touch no TS, still confirm) |
| Behavior probe | `node bff/server.mjs` locally + `curl` preflight/PATCH probes (Step 3) | fail-closed CORS; 400s in snake_code |

## Scope

**In scope** (the only files you should modify):

- `bff/server.mjs`
- `bff/README.md` (only if it documents `ALLOWED_ORIGIN=*` behavior — update that line; nothing else)

**Out of scope** (do NOT touch):

- `bff/.env` / `bff/.env.example` — never edit credential-bearing files.
- `src/**` — no SPA changes; the SPA already sends `Authorization` from the
  same origin the allowlist will contain.
- `supabase/migrations/*`, `services/export-api/*` — different surfaces.
- The `authenticate()` function (`:85-104`) — already correct; do not refactor.

## Git workflow

- Branch: `advisor/015-bff-hardening`
- Commit per step; message style matches repo (`feat:`, `fix:`, `chore:`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fail-closed CORS allowlist

1. Change line 28 default from `'*'` to `''` (empty). Parse
   `ALLOWED_ORIGIN` as a comma-separated allowlist (same shape
   `services/export-api/.env.example:14-19` already documents for the
   export-api: comma-sep, fail-closed in production).
2. In `cors()`, echo back the request `Origin` ONLY if it is in the allowlist;
   otherwise omit `Access-Control-Allow-Origin` entirely (fail-closed). Keep
   `Vary: Origin`. Preserve the existing methods/headers/Max-Age lines.
3. Dev behavior: `bff/.env.example` already lists the local SPA origin(s) —
   do not edit it; just confirm the code splits on commas and trims.

**Verify**: `node --check bff/server.mjs` → exit 0.

### Step 2: PATCH allowlist + password floor + quiet responses

1. Allowlist: `role` must be one of `admin | supervisor | operator`
   (the app's role enum — see `src/types/user.types.ts`); anything else →
   `400 { error: 'invalid_role' }`. Drop the `...(body?.user_metadata || {})`
   spread: build `user_metadata` ONLY from the allowlisted `role`/`username`
   keys (username lowercased/trimmed as today).
2. Password floor: `if (body?.password)` → require
   `String(body.password).length >= 8` else `400 { error: 'password_too_short' }`
   (same code the create and password-reset routes use).
3. Email: keep accepting `email`/`email_confirm` (needed admin ops), no change.
4. Quiet responses: on all five routes, replace `{ error: error.message }`
   with a fixed snake_case code (`'admin_operation_failed'`) and
   `console.error` the upstream message server-side; replace full
   `user: data.user` bodies with `{ id }` (+ `{ ok: true }` where already
   used). Status codes stay as-is.

**Verify**: `node --check bff/server.mjs` → exit 0; `npx tsc --noEmit` → exit 0.

### Step 3: Per-IP throttling on all five auth-admin routes

Add a minimal in-memory sliding-window limiter in `bff/server.mjs` (no new
dependencies — BFF deps are `node:http` + `@supabase/supabase-js` only):

- Key: client IP (`req.socket.remoteAddress`); window 60 s; limit 60
  requests/window/IP for GET, 20 for mutating routes. Over limit →
  `429 { error: 'rate_limited' }` (before `authenticate`, so enumeration is
  throttled too).
- Keep it ~25 lines with a `Map` + periodic sweep; no timers that keep the
  process alive (`unref()` if you use `setInterval`).

**Verify**: `node --check bff/server.mjs` → exit 0.

### Step 4: Behavior-probe the running server (no live Supabase)

1. Start the BFF with DUMMY env values
   (`VITE_SUPABASE_URL=https://example.invalid` etc. — syntactically valid URL,
   unreachable host; any value that passes the startup presence check).
2. `curl -s -D- -o /dev/null -X OPTIONS http://localhost:10000/api/auth-admin/users -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST"`
   → response must NOT contain `Access-Control-Allow-Origin: https://evil.example`
   (fail-closed). Repeat with an allowlisted origin from your dummy
   `ALLOWED_ORIGIN` → header IS echoed.
3. `curl -s -X PATCH ... -H "Authorization: Bearer dummy"` → `401 missing_token`
   or `invalid_token` (never 403/500 leaking logic); with a syntactically-valid
   but bogus JWT → still 401-family (proves throttle/auth precede logic).
4. Kill the server. Confirm `git status` shows no `.env` changes and no new
   files besides `bff/server.mjs` (+ `bff/README.md` line if touched).

**Verify**: probes behave as above; working tree contains only in-scope files.

## Test plan

- No test runner covers `bff/` (tsconfig/eslint exclude it — recorded gap, not
  this plan). Verification is `node --check` + the Step 4 probes.
- If you add any automated check, it must be a standalone `node` script run
  manually and NOT committed (keep the diff to `bff/server.mjs` + README line).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --check bff/server.mjs` exits 0
- [ ] `grep -n "|| '\*'" bff/server.mjs` returns no matches
- [ ] `grep -n "user_metadata || {}" bff/server.mjs` returns no matches
- [ ] `grep -cn "error.message" bff/server.mjs` returns 0
- [ ] `grep -n "password_too_short" bff/server.mjs` matches ≥3 routes (create, password-reset, PATCH)
- [ ] `grep -n "rate_limited\|429" bff/server.mjs` matches (throttle present)
- [ ] `npx tsc --noEmit` exits 0 (SPA untouched)
- [ ] No files outside the in-scope list are modified (`git status`); no `.env` touched
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the "Current state" excerpts doesn't match (drift).
- The SPA's admin user-management flow relies on reading back full user objects
  from BFF responses (grep `user_metadata`/`data.user` consumers in
  `src/hooks/useUsers.ts` first — if it does, keep `{ id, email }` minimal
  shape instead of `{ id }` and note it; do not expand).
- Throttling breaks the preflight path (OPTIONS must never 429).
- Any step seems to require touching `src/`, migrations, or `.env` files.

## Maintenance notes

- When deploying, `ALLOWED_ORIGIN` on the Render BFF service must list the real
  SPA domain(s); empty in production now refuses all cross-origin calls by
  design — coordinate with whoever owns Render env vars.
- Reviewers: confirm the allowlisted `role` union stays in sync with
  `src/types/user.types.ts` if a role is ever added.
- Follow-up (separate): `services/export-api` RBAC checks role but not farm
  membership before dispatching farm-scoped RPCs — needs its own plan with a
  JWT-matrix test.
