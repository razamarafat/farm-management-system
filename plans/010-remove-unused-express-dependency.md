# Plan 010: Remove the unused `express` dependency and land a clean lockfile

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a9257dd..HEAD -- package.json package-lock.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `a9257dd`, 2026-08-29

## Why this matters

`express ^5.2.1` sits in the root `dependencies` block, but nothing in this
repository imports express — not the SPA, not `bff/server.mjs` (which uses
`node:http`), not `services/export-api` (which uses Fastify). It pulls roughly
30–60 transitive packages into every production `npm ci`, which CI runs four
separate times. Removing it shrinks the install, shrinks the supply-chain
surface, and clears an uncommitted working-tree change that currently risks a
lockfile-drift failure in CI (`npm ci` fails hard when `package-lock.json` and
`package.json` disagree).

## Current state

Files involved:

- `package.json` — root manifest. The SPA's runtime deps live in
  `dependencies`; build/test tooling lives in `devDependencies`.
- `package-lock.json` — lockfile. CI installs with `npm ci`, which requires
  this file to be exactly in sync with `package.json`.

Both files are **currently modified in the working tree and uncommitted**.
`git diff package.json` at the time of planning shows exactly one added line:

```diff
@@ -33,6 +33,7 @@
     "class-variance-authority": "^0.7.1",
     "clsx": "^2.1.1",
     "date-fns-jalali": "^4.1.0-0",
+    "express": "^5.2.1",
     "framer-motion": "^12.34.0",
     "lucide-react": "^0.564.0",
     "react": "19.2.3",
```

`git diff --stat package-lock.json` shows `842 insertions(+)` and no deletions —
i.e. the lockfile change is purely the express subtree.

Proof that nothing imports it: a recursive grep for `from 'express'`,
`require('express')` and `from "express"` across `src`, `bff`, `services`, and
`scripts` matches **only** two vendored fixture files inside
`services/export-api/node_modules/` (`avvio/test/express.test.js` and
`light-my-request/test/index.test.js`). Neither `bff/package.json` nor
`services/export-api/package.json` declares express.

Repo conventions:

- Node engine is pinned in `package.json`: `>=22.12.0 <23`.
- Commit messages follow Conventional Commits. Recent examples from `git log`:
  `feat: fix all TS errors, update CI pipeline, clean orphaned report refs`,
  `chore(deps): add rxdb + embedded-postgres; reconcile lockfile drift`.
- The two sub-services each have their own `package.json` and their own
  `node_modules`; root deps are for the Vite SPA only.

## Commands you will need

| Purpose            | Command                                   | Expected on success                          |
|--------------------|-------------------------------------------|----------------------------------------------|
| Typecheck          | `npx tsc --noEmit`                        | exit 0, no output                             |
| Lint               | `npm run lint`                            | see note below — exit 1 is EXPECTED           |
| Build              | `npm run build`                           | exit 0                                        |
| Clean-install test | `npm ci`                                  | exit 0                                        |
| Conflict check     | `npm run check:conflicts`                 | exit 0                                        |

**Lint baseline — read carefully.** `npm run lint` (`eslint src/`) exits **1**
at HEAD because pre-existing problems are tolerated. That is expected and is
NOT a failure. Before making any change, capture the baseline:

```bash
npm run lint 2>&1 | tail -5
```

Write the reported "N problems (X errors, Y warnings)" line down. The gate for
this plan is **no new problems** relative to that captured number — not exit 0.
Do not try to fix pre-existing lint problems in this plan.

Also note `npm test` (`node scripts/test-spa-reports.mjs`) is **RED at HEAD**
and is deliberately not a gate for this plan. Do not attempt to fix it here.

## Scope

**In scope** (the only files you should modify):
- `package.json`
- `package-lock.json` (regenerated, never hand-edited)

**Out of scope** (do NOT touch, even though they look related):
- `bff/package.json`, `services/export-api/package.json` — separate manifests
  with their own lockfiles; they do not declare express and need no change.
- Any other dependency in `dependencies` or `devDependencies`. Several other
  packages (`@heyputer/puter.js`, `framer-motion`, `sonner`,
  `class-variance-authority`) are *suspected* unused but were NOT verified
  during the audit. Removing them is a separate, unplanned piece of work —
  leave them alone.
- `.github/workflows/ci.yml` — handled by plan 012.

## Git workflow

- Branch: `advisor/010-remove-unused-express`
- One commit for the whole change. Message:
  `chore(deps): drop unused express from root dependencies`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm express really has no importer

Run the import search yourself before deleting anything:

```bash
grep -rn "from 'express'\|require('express')\|from \"express\"" src bff services scripts \
  --include=*.ts --include=*.tsx --include=*.mjs --include=*.js 2>/dev/null \
  | grep -v node_modules
```

**Verify**: the command prints **nothing** (all matches, if any, were inside
`node_modules` and are filtered out). If it prints a match in first-party code,
that is a STOP condition.

### Step 2: Remove the dependency

Remove the `"express": "^5.2.1",` line from the `dependencies` block of
`package.json`, then regenerate the lockfile with npm rather than editing it:

```bash
npm uninstall express
```

`npm uninstall` both edits `package.json` and updates `package-lock.json`. Do
not hand-edit `package-lock.json`.

**Verify**: `grep -n '"express"' package.json` → no matches.

### Step 3: Prove the lockfile is internally consistent

```bash
npm ci
```

**Verify**: exit 0. `npm ci` fails loudly if `package-lock.json` and
`package.json` disagree, so a clean exit is the real proof that the drift is
resolved.

### Step 4: Confirm nothing regressed

```bash
npx tsc --noEmit
npm run build
npm run lint 2>&1 | tail -5
```

**Verify**: `tsc` exits 0 with no output; `build` exits 0; the lint problem
count matches the baseline you captured before starting (no new problems).

## Test plan

No new tests. This plan removes an unimported package; there is no behaviour to
test, and the repo has no unit-test framework at HEAD (plan 013 introduces one).
The real regression gates are `npm ci` exiting 0 (lockfile integrity) and
`npm run build` exiting 0 (nothing in the bundle referenced express).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n '"express"' package.json` returns no matches
- [ ] `npm ci` exits 0
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run lint` reports no more problems than the captured baseline
- [ ] `git status --short` shows only `package.json` and `package-lock.json` as
      modified (plus any pre-existing untracked files you did not create)
- [ ] `plans/README.md` status row for 010 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's grep finds express imported anywhere in `src`, `bff`, `services`, or
  `scripts` outside `node_modules` — the dependency is real and this plan's
  premise is false.
- `npm ci` fails after Step 2, for any reason other than a network timeout.
- `npm run build` fails, or the lint problem count *increases*.
- `git diff package-lock.json` after Step 2 shows changes to packages other
  than express and its transitive subtree (e.g. an unrelated version bump).
  A stray upgrade means your npm resolved something differently and must be
  reviewed rather than committed.
- The working tree at the start does not show `package.json` and
  `package-lock.json` as already-modified with the express addition described in
  "Current state" — someone else has already committed or reverted it.

## Maintenance notes

For whoever owns this next:

- If a first-party Express server is ever added to this repo, it belongs in that
  service's own `package.json` (following the `bff/` and
  `services/export-api/` pattern), never in the root manifest, which is for the
  Vite SPA's runtime deps.
- A reviewer should scrutinise the `package-lock.json` diff for exactly one
  removed subtree and no incidental version bumps.
- **Deferred out of this plan**: auditing the other suspected-unused root deps
  (`@heyputer/puter.js`, `framer-motion`, `sonner`,
  `class-variance-authority`). They were never verified during the audit, and
  `framer-motion`/`sonner` are very likely genuinely used by the UI. Anyone
  picking that up must grep for each before removing it.
