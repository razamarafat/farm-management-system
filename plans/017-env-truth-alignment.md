# Plan 017: Align env truth across guard, README, and templates (kill the removed service-role key)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a9257dd..HEAD -- scripts/check-env.mjs README.md .env.example services/export-api/.env.example`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Handling rule for this plan**: you work next to credential-shaped values
> (`.env`, `bff/.env`). Never print, copy, or commit credential values. Refer
> to them only by file path and variable name. Do NOT open `.env` files'
> contents into any report — check variable NAMES only.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `a9257dd`, 2026-09-07

## Why this matters

The SPA no longer reads `VITE_SUPABASE_SERVICE_ROLE_KEY` (it lives server-side
in the BFF; `check-env.mjs` forbids it in SPA env), yet three onboarding
artifacts still prescribe it: the `check-env.mjs` header comment, the README
env table + Quick Start + troubleshooting row, and the root `.env.example`
template. A careful newcomer follows the README, lands a forbidden key in
client-build scope, and fails the env guard — the exact posture the BFF
migration removed. This plan makes all four artifacts say the same true thing.
A one-line port collision fix in the export-api template rides along.

## Current state

Facts, verified 2026-09-07. The ground truth is the guard's CODE (not its
header): `REQUIRED = VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_BFF_URL`;
`STALE_REJECTED` includes `VITE_SUPABASE_SERVICE_ROLE_KEY`
(`scripts/check-env.mjs:19-33`).

```js
// scripts/check-env.mjs:1-13 — STALE header contradicts the code below it
// Mirrors EXACTLY the variables the application reads at build time:
//   - src/lib/supabase.ts           → VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
//   - src/lib/supabase-admin.ts     → VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
//                                     VITE_SUPABASE_SERVICE_ROLE_KEY
// ...
// VITE_SUPABASE_SERVICE_ROLE_KEY is listed as REQUIRED because admin UI flows
// (voucher write paths, user create/update, hard deletes) call supabaseAdmin.
```

```md
<!-- README.md:579-591 — env table prescribes the removed key -->
| `VITE_SUPABASE_SERVICE_ROLE_KEY` | ⚠️ required for admin flows | service-role key — bypasses RLS. **Will be bundled into the client JavaScript** ... |
<!-- README.md:621-625 — Quick Start writes it into .env -->
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...
<!-- README.md:699 (troubleshooting) — wrong remedy -->
<!-- "Service-role key error" → "Add it to `.env`, restart dev" -->
```

```ini
# .env.example:1-11 — root template (verified 2026-09-07)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_SERVICE_ROLE_KEY=      # <-- forbidden by check-env STALE_REJECTED
VITE_BFF_URL=
VITE_APP_VERSION=
```

```ini
# services/export-api/.env.example:21-22 — port collides with Vite
PORT=3000   # but vite.config.ts:22 serves the dev SPA on 3000; the proxy
            # targets the export-api on 10001 (vite.config.ts:29-32)
```

Conventions: README documents env in its §"Environment Variables" table and
points at `check-env.mjs` as the verifier (`README.md:588-591`) — keep that
structure, fix the contents. AGENTS.md RULE 1: no real credentials anywhere.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Guard still green | `npm run check:env` | exit 0 (or only the optional-VAR warning) |
| Secrets still green | `npm run check:secrets` | exit 0 |
| README cross-check | `grep -n "SERVICE_ROLE" README.md` | no matches in env/Quick-Start/troubleshooting sections |

## Scope

**In scope** (the only files you should modify):

- `scripts/check-env.mjs` — header comment ONLY (lines 1-13); zero code changes
- `README.md` — env table, Quick Start block, service-role troubleshooting row
- `.env.example` — remove the forbidden key line (or comment it as forbidden)
- `services/export-api/.env.example` — `PORT=3000` → `PORT=10001` + comment

**Out of scope** (do NOT touch):

- `scripts/check-env.mjs` code (`REQUIRED`/`STALE_REJECTED`/logic) — already correct.
- Any `.env` file (root, `bff/`, `services/`) — never edit credential files.
- `render.yaml`, `docs/deploy/render.md`, `bff/README.md` — deploy-doc three-way
  drift is a separate follow-up, not this plan.
- `src/**`, `bff/server.mjs` — no code changes at all in this plan.

## Git workflow

- Branch: `advisor/017-env-truth`
- One commit is fine (`docs: align env docs with check-env guard`); message
  style matches repo conventional commits.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the `check-env.mjs` header comment

Rewrite lines 1-13 so the header matches the code: the SPA reads
`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (+ `VITE_BFF_URL` for the
auth-admin proxy, `VITE_APP_VERSION` optional); `VITE_SUPABASE_SERVICE_ROLE_KEY`
is FORBIDDEN in SPA env (held server-side by `bff/server.mjs`) and listed in
`STALE_REJECTED`. No code/logic change — comment only.

**Verify**: `npm run check:env` → same result as before the edit (guard
behavior unchanged); `git diff scripts/check-env.mjs` shows comment lines only.

### Step 2: Rewrite the README env section

1. Env table (`README.md:579-584`): drop the `VITE_SUPABASE_SERVICE_ROLE_KEY`
   row; add `VITE_BFF_URL` (required — SPA auth-admin proxy target); keep URL /
   ANON / APP_VERSION rows. Add one sentence: the service-role key lives ONLY
   on the BFF service and must never appear in SPA `.env` (cite
   `npm run check:env` as the enforcer).
2. Quick Start (`:620-625`): replace the `VITE_SUPABASE_SERVICE_ROLE_KEY=...`
   line with `VITE_BFF_URL=http://localhost:10000`.
3. Troubleshooting service-role row (`:699`): change remedy to "remove it from
   the SPA `.env`; set the server key on the BFF service only".
4. Leave the rest of the README (PWA claims, ports, structure, Scripts table)
   untouched — separate follow-up.

**Verify**: `grep -n "SERVICE_ROLE" README.md` → matches only the new
"never in SPA env" sentence (or zero); `npm run check:secrets` → exit 0.

### Step 3: Fix both `.env.example` templates

1. Root `.env.example`: remove the `VITE_SUPABASE_SERVICE_ROLE_KEY=` line;
   add a comment `# NOTE: VITE_SUPABASE_SERVICE_ROLE_KEY must NEVER be set
   here — check-env rejects it; it lives on the BFF service only.`
2. `services/export-api/.env.example:22`: `PORT=3000` → `PORT=10001` with
   comment pointing at `vite.config.ts` proxy targets (`/api/export →
   localhost:10001`); fix the line-15 comment that calls 3000 the "vite
   default port" only if it refers to the service port (keep the SPA-dev
   origin note on line 15-16 as-is).

**Verify**: `npm run check:env` → exit 0 or optional-only warning;
`npm run check:secrets` → exit 0.

## Test plan

- No unit tests (docs + comment-only script change). Verification is the two
  guard commands plus the grep cross-checks in the table.
- Fresh-template check: `node -e` load of `.env.example` key NAMES through the
  guard's `checkEnvVariables` export with dummy values → no
  `DEPRECATED / FORBIDDEN` hit (proves the template itself passes its guard).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run check:env` exits 0 (modulo pre-existing local-env state — run
  it against a scratch copy of the template if the real `.env` is dirty)
- [ ] `npm run check:secrets` exits 0
- [ ] `grep -n "VITE_SUPABASE_SERVICE_ROLE_KEY=" README.md .env.example` returns no matches
- [ ] `grep -n "^PORT=" services/export-api/.env.example` returns `PORT=10001`
- [ ] `git diff --stat` lists ONLY the four in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `check-env.mjs` code (not header) turns out to still REQUIRE the service-role
  key somewhere past line 90 (read the rest of the file first — excerpt ends
  at line 90 of 105; if lines 91-105 contradict, stop).
- The README Quick Start env block is generated from another source (then fix
  the source, not the README — but do not wander beyond the four files).
- Any step seems to require touching a real `.env`, Render config, or `src/`.

## Maintenance notes

- If a new `VITE_*` variable is ever added, the rule is: guard code first,
  then mirror in README + `.env.example` in the same PR (this incident is what
  happens otherwise).
- Reviewers: diff the README table cell-by-cell against `REQUIRED`/`OPTIONAL`/
  `STALE_REJECTED` in `check-env.mjs:19-33`.
- Follow-up (separate plan): full README accuracy pass (PWA claims, dev port,
  structure tree, Scripts table) + `render.yaml` vs deploy-doc drift.
