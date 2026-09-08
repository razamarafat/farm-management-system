# Plan 018: Close the secret-scanner blind spot over `bff/`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a9257dd..HEAD -- scripts/check-secrets.mjs .gitignore bff/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Handling rule for this plan**: you work next to a server-side credential
> (`bff/.env` holds the service-role key type). Never print, copy, or commit
> credential values. Refer to them only by file path and variable name. The
> Step 2 canary uses a SYNTHETIC pattern (`sb_secret_` + filler) that matches
> the scanner regex but is not a real credential — never use a real key.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/011-ignore-local-proxy-tooling.md (011 decides which
  local tooling files stay untracked; widening the scanner first would flag
  files 011 is about to ignore — sequence after it)
- **Category**: security
- **Planned at**: commit `a9257dd`, 2026-09-07

## Why this matters

`scripts/check-secrets.mjs` is the CI guard against re-introducing the
client-secret incident class — but it skips the entire `bff/` directory, which
is exactly where the service-role credential type now lives (`bff/server.mjs`
reads it at startup). A key pasted into BFF code during late-night debugging
would sail through CI undetected. Removing one skip-dir entry plus a canary
test closes the hole with a scanner-only change.

## Current state

```js
// scripts/check-secrets.mjs:21 — whole BFF excluded from the scan
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.vite', 'coverage', '.cache', 'bff']);
```

```js
// scripts/check-secrets.mjs:50-64 — walk() already skips `.env*` by filename
// (correct: env files are gitignored and intended to hold secrets), and scans
// INCLUDE_EXT = ts|tsx|js|mjs|cjs|jsx|html|json|css|md|sql|env|yml|yaml|xml|txt
```

```js
// scripts/check-secrets.mjs:27-33 — SELF allowlist for docs that name the key shape
const SELF = new Set([
  'scripts/check-secrets.mjs',
  'README.md',
  'bff/README.md',
  'docs/deploy/render.md',
  'docs/security/incident-response.md',
]);
```

Related: plan 011 adds gitignore entries for untracked local proxy tooling —
that is WHY this plan depends on it (scan wider only after the ignore set is
settled, or the new coverage flags files 011 handles). AGENTS.md RULE 1: no
business data involved; the canary below is a synthetic scanner pattern, not
a credential and not business data.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Guard green | `npm run check:secrets` | exit 0, `OK` line |
| Canary red (Step 2) | `npm run check:secrets` with canary present | exit 1, `FAIL` naming the canary file |
| Full check | `npm run check` | exit 0 (confirms no collateral damage) |

## Scope

**In scope** (the only files you should modify):

- `scripts/check-secrets.mjs` (remove `'bff'` from `SKIP_DIRS`; extend `SELF`
  only if a `bff/` doc legitimately names a key SHAPE and fails the scan)

**Out of scope** (do NOT touch):

- `bff/.env`, `bff/.env.example`, any file holding real credential values.
- `.gitignore` (plan 011 owns it).
- `bff/server.mjs` (plan 015 owns its hardening).
- Any new permanent test file — the canary below is created, verified, and
  DELETED inside Step 2, never committed.

## Git workflow

- Branch: `advisor/018-scanner-bff`
- One commit (`chore: scan bff in check-secrets`); repo conventional-commit style.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Remove the `bff` skip and run the widened scan

1. Delete `'bff'` from `SKIP_DIRS` (keep all other entries).
2. Run `npm run check:secrets`.
   - If exit 0: done with this step, go to Step 2.
   - If it flags a `bff/` file: inspect. If the hit is a doc that only NAMES
     the key shape (like the existing SELF entries), add that exact POSIX path
     to `SELF` with the one-line reason the other entries carry. If the hit is
     a REAL credential value: STOP (see STOP conditions) — do not copy it
     anywhere, do not commit anything.

**Verify**: `npm run check:secrets` → exit 0 with `bff/` covered (confirm by
`grep -n "bff" scripts/check-secrets.mjs` showing only README/SELF mentions,
no SKIP entry).

### Step 2: Prove the guard bites with a synthetic canary (then delete it)

1. Create `bff/.scanner-canary.tmp.txt` containing exactly:
   `canary sb_secret_AAAAAAAAAAAAAAAAAAAAAAAA end` (synthetic filler — matches
   the `sb_secret_` + 20-chars rule, is not a credential).
2. Run `npm run check:secrets` → MUST exit 1 with `FAIL` naming the canary
   file. If it exits 0, the widening didn't take — stop and diagnose.
3. DELETE the canary file. Run `npm run check:secrets` → exit 0 again.
4. Confirm deletion: the canary path appears in `git status` NOT AT ALL
   (untracked-but-deleted = absent; if it lingers, remove it).

**Verify**: red-then-green sequence observed; canary file absent afterwards.

### Step 3: Run the full check suite

Run `npm run check` (conflicts + env + secrets + legacy-admin:strict) →
exit 0, proving the scanner change didn't break the sibling guards.

**Verify**: exit 0.

## Test plan

- No committed tests (scanner is a zero-dependency script; the canary IS the
  test, executed and removed in Step 2).
- Regression net: `npm run check` green + CI's `check:secrets` step covering
  `bff/` from now on.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "'bff'" scripts/check-secrets.mjs` returns no matches (skip removed)
- [ ] `npm run check:secrets` exits 0
- [ ] `npm run check` exits 0
- [ ] No canary file remains (`git status --short` shows no `canary` path)
- [ ] `git diff --stat` lists ONLY `scripts/check-secrets.mjs`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The widened scan flags a REAL credential value in `bff/` (or anywhere):
  do NOT reproduce it, do NOT commit, do NOT continue — report the file path
  + credential type only and recommend rotation per AGENTS.md RULE 1.
- Plan 011 has not landed and the scan flags the untracked proxy-tooling files
  it covers — blocked-on-011; do not add speculative SELF entries for them.
- The scanner flags `bff/node_modules` (means the `node_modules` skip stopped
  applying inside `bff/` — fix scoping, don't add broad SELF entries).
- Any step seems to require touching `.env` files, BFF logic, or `.gitignore`.

## Maintenance notes

- If a new server-side directory ever joins the repo (a second service),
  default it to SCANNED; skipping a credential-adjacent dir must be a recorded
  decision with expiry, never a silent `SKIP_DIRS` entry.
- Reviewers: the whole diff should be ~1 line; any SELF addition must quote
  the exact flagged shape-reason like the existing entries do.
- Follow-up (separate): tsconfig/eslint still exclude `bff/` and `scripts/`
  from static analysis — the guards are themselves unguarded.
