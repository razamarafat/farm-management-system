# Plan 011: Make it impossible to commit the untracked local proxy tooling, and flag the exposed token for rotation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a9257dd..HEAD -- .gitignore scripts/check-secrets.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Handling rule for this plan specifically**: you will be working next to a
> file that contains a real credential. Do **not** open it in a way that copies
> its contents into a commit message, a report, a log, a new file, or any
> summary you write. Refer to it only by path and line number. Do not print the
> credential value. Do not paste it into a terminal command.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `a9257dd`, 2026-08-29

## Why this matters

Two untracked items sit in the repository root: a single-file local LLM proxy
script and a local model-router directory. The proxy script contains a
hard-coded bearer credential as an `||` fallback default, and neither item is
matched by the root `.gitignore`. That means a routine `git add -A` or
`git commit -a` — the exact commands people reach for when tidying a working
tree — would commit a live credential into the history of a production business
application, from which it cannot be removed without a history rewrite. The
credential is also already exposed to every process and tool that reads the
working tree, so it needs rotating regardless of whether it was ever committed.

The fix has two halves: a mechanical half (make the files unignorable-by-accident
and add a guard so a future copy is caught by CI) and a human half (rotate the
credential), which only the operator can do.

## Current state

The items, by path only:

- `Simple-Qwen-Proxy.js` — repository root, untracked. **Line 11** assigns a
  hard-coded bearer token as the `||` fallback for an environment variable.
  **Line 13** logs a truncated prefix of that token to the console. **Line 158**
  references `ANTHROPIC_API_KEY`. This is local developer tooling, not part of
  the Morvarid Farm product; nothing in `src/`, `bff/`, `services/`, or
  `scripts/` imports it.
- `claude-code-model-router-plus/` — repository root, untracked directory. Local
  developer tooling. Its own secrets file is already covered by its nested
  `claude-code-model-router-plus/.gitignore` (line 11), but the **directory
  itself** is not ignored by the root `.gitignore`, so `git add -A` would stage
  the rest of it.

Confirm the exposure yourself without reading the secret:

```bash
git check-ignore -v Simple-Qwen-Proxy.js ; echo "exit=$?"
git check-ignore -v claude-code-model-router-plus ; echo "exit=$?"
```

At planning time both printed nothing and exited non-zero, i.e. **neither is
ignored**.

Existing guard script (this is the pattern to extend):

- `scripts/check-secrets.mjs` — already wired into `package.json` as
  `check:secrets` and run in CI. It is the established place in this repo for
  "fail the build if a credential-shaped thing is whe it shouldn't be"
  logic. Read it before Step 3 and match its existing structure, exit-code
  convention, and console output style rather than inventing a new one.

Repo conventions:

- Root `.gitignore` exists and is the right place for root-level ignores; the
  repo already uses nested `.gitignore` files inside sub-projects.
- Commit messages follow Conventional Commits (`chore:`, `feat:`, `chore(deps):`).
- Node engine: `>=22.12.0 <23`. Guard scripts under `scripts/` are `.mjs` ESM.

## Commands you will need

| Purpose             | Command                                        | Expected on success                    |
|---------------------|------------------------------------------------|----------------------------------------|
| Is a path ignored?  | `git check-ignore -v <path>`                    | prints the matching rule, exit 0        |
| Untracked listing   | `git status --short`                            | see Done criteria                       |
| Secret guard        | `npm run check:secrets`                         | exit 0                                  |
| Env guard           | `npm run check:env`                             | exit 0                                  |
| All repo guards     | `npm run check`                                 | exit 0 — **but see note**                |
| Typecheck           | `npx tsc --noEmit`                              | exit 0, no output                       |
| Build               | `npm run build`                                 | exit 0                                  |

**Note on `npm run check`**: it chains `check:conflicts && check:env &&
check:secrets && check:legacy-admin:strict`. The **strict legacy-admin** step is
expected to FAIL at HEAD (it flags the still-unmigrated admin client — that is
plan 020's job). For this plan, run `npm run check:secrets` and
`npm run check:env` individually rather than the aggregate, so a pre-existing
unrelated failure does not mask your result.

**Lint baseline.** `npm run lint` exits **1** at HEAD with pre-existing
problems; that is expected, not a failure. Capture the baseline before you
change anything:

```bash
npm run lint 2>&1 | tail -5
```

Record the "N problems (X errors, Y warnings)" line. The gate is **no new
problems** versus that number. Do not fix pre-existing lint problems here.
`npm test` is RED at HEAD and is not a gate for this plan.

## Scope

**In scope** (the only files you should modify):
- `.gitignore` (root)
- `scripts/check-secrets.mjs` — add one new check, preserving all existing ones

**Out of scope** (do NOT touch):
- **`Simple-Qwen-Proxy.js` itself.** Do not edit it, do not rewrite the
  credential line, and do not delete it. It is the operator's working tool and
  deleting it could break their local setup. Making it ignored is sufficient for
  this plan; removing or relocating it is the operator's decision (see Step 4).
- `claude-code-model-router-plus/**` — same reasoning. Ignore it; do not modify
  its contents or its nested `.gitignore`.
- `.env`, `.env.example`, `bff/.env.example`, `services/export-api/.env.example`
  — already correctly handled; the audit confirmed no secrets are tracked in
  git at HEAD (312 tracked files checked).
- `.github/workflows/ci.yml` — plan 012 owns CI changes. `check:secrets` is
  already invoked there, so extending the script is enough to get CI coverage.

## Git workflow

- Branch: `advisor/011-ignore-local-proxy-tooling`
- One commit. Message:
  `chore(security): ignore local proxy tooling and guard against committed tokens`
- The commit must contain **only** `.gitignore` and `scripts/check-secrets.mjs`.
  Verify with `git show --stat HEAD` before finishing.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the two paths are currently unignored

```bash
git check-ignore -v Simple-Qwen-Proxy.js ; echo "exit=$?"
git check-ignore -v claude-code-model-router-plus ; echo "exit=$?"
git ls-files --error-unmatch Simple-Qwen-Proxy.js 2>&1 | tail -1
```

**Verify**: the first two commands each print nothing and report a non-zero
exit (unignored). The third prints an error containing `did not match any
file(s) known to git` — proving the file is **not** already tracked. If the
third command instead prints the path, the credential is already in git history:
that is a STOP condition requiring the operator, not you.

### Step 2: Ignore both paths at the repository root

Append to the root `.gitignore`, keeping the file's existing grouping and
comment style:

```gitignore
# Local developer LLM tooling — never part of the product, and the proxy
# script holds a bearer credential. Keep both out of git entirely.
/Simple-Qwen-Proxy.js
/claude-code-model-router-plus/
```

Use leading-slash (root-anchored) patterns so this cannot accidentally ignore a
similarly-named file inside `src/` in future.

**Verify**:

```bash
git check-ignore -v Simple-Qwen-Proxy.js
git check-ignore -v claude-code-model-router-plus
```

Both must now print the matching `.gitignore` line and exit 0.

Then confirm they no longer appear as stageable:

```bash
git status --short
```

**Verify**: neither `Simple-Qwen-Proxy.js` nor `claude-code-model-router-plus/`
appears in the output.

### Step 3: Add a guard so a future copy is caught automatically

Read `scripts/check-secrets.mjs` in full first and follow its existing shape —
same helper functions, same way it reports a violation, same exit-code
convention (0 = clean, non-zero = violation found).

Add one check: **fail if any file that git would track matches a bearer-token
or API-key shaped literal.** Implement it as:

1. Get the list of files git actually tracks or would stage — use
   `git ls-files --cached --others --exclude-standard`. The
   `--exclude-standard` flag is what makes the new `.gitignore` rules take
   effect, so ignored local tooling is correctly skipped.
2. Skip binary and lock files, `node_modules`, `dist`, and any `*.example`
   file (those legitimately contain placeholder values).
3. Flag a file if it contains a long high-entropy literal assigned to an
   identifier whose name contains `key`, `token`, `secret`, or `password`.
   A JWT-shaped literal (three base64url segments separated by dots, first
   segment starting `eyJ`) is the specific shape that matters here.
4. On a violation, print the offending `path:line` and the **matched
   identifier name only** — never the matched value. Then exit non-zero.

That last point is a hard requirement: a guard script that echoes the secret
into CI logs makes the problem worse, because CI logs are often more widely
readable than the working tree.

**Verify**:

```bash
npm run check:secrets ; echo "exit=$?"
```

Must exit 0 — the local proxy script is now ignored, so it is outside the
scanned set, and no tracked file should match.

Then prove the new check actually fires. Create a throwaway tracked-but-not-
committed file containing a synthetic JWT-shaped string you invent yourself
(do **not** copy the real one from `Simple-Qwen-Proxy.js`):

```bash
printf 'const API_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.ZmFrZXNpZ25hdHVyZQ";\n' > scripts/__secret_probe.mjs
npm run check:secrets ; echo "exit=$?"
rm scripts/__secret_probe.mjs
npm run check:secrets ; echo "exit=$?"
```

**Verify**: the middle run exits **non-zero** and names
`scripts/__secret_probe.mjs` and the identifier `API_TOKEN` in its output,
without printing the token value. The final run (after `rm`) exits 0. Confirm
`git status --short` no longer lists `scripts/__secret_probe.mjs` before you
commit.

### Step 4: Record the rotation requirement for the operator

The credential in `Simple-Qwen-Proxy.js:11` has been readable in the working
tree, so it must be treated as compromised regardless of whether it was ever
committed. Rotation cannot be automated by you — it requires access to the
issuing provider's console.

Add a short entry to `plans/README.md` under a heading
`## Operator actions (not automatable)`, creating that section if it does not
exist. Write it referencing the location and credential type only:

> - **Rotate the bearer token hard-coded at `Simple-Qwen-Proxy.js:11`** (local
>   LLM proxy tooling, untracked as of plan 011). It has been readable in the
>   working tree and must be considered compromised. Revoke it at the issuing
>   provider and re-issue; supply the replacement via an environment variable
>   rather than an `||` fallback default. Also remove the truncated-token
>   `console.log` at `Simple-Qwen-Proxy.js:13`. Plan 011 only made the file
>   unstageable — it did not and cannot rotate the credential.

Do not include the token value, any prefix of it, or its length.

**Verify**: `grep -n "Rotate the bearer token" plans/README.md` prints one
match, and `grep -c "eyJ" plans/README.md` prints `0`.

### Step 5: Confirm nothing regressed

```bash
npx tsc --noEmit
npm run build
npm run check:env ; echo "exit=$?"
npm run lint 2>&1 | tail -5
```

**Verify**: `tsc` exits 0 with no output; `build` exits 0; `check:env` exits 0;
lint problem count equals the baseline captured earlier.

## Test plan

The verification in Step 3 **is** the test: a synthetic-secret probe file that
must trip the new guard, then be removed and prove the guard goes quiet again.
That negative-then-positive pair is the pattern to use, because a secret scanner
that never fires is indistinguishable from one that is broken.

There is no unit-test framework at HEAD (plan 013 adds one). If plan 013 has
already landed when you execute this, prefer converting the Step 3 probe into a
real test file under the location plan 013 established, using a synthetic JWT
fixture. Existing structural pattern to follow for a script-level check:
`scripts/check-secrets.mjs` itself, plus its sibling `scripts/check-env.mjs`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `git check-ignore -v Simple-Qwen-Proxy.js` exits 0 and names a
      `.gitignore` rule
- [ ] `git check-ignore -v claude-code-model-router-plus` exits 0 and names a
      `.gitignore` rule
- [ ] `git status --short` lists neither of those two paths
- [ ] `git ls-files | grep -c "Simple-Qwen-Proxy"` prints `0`
- [ ] `npm run check:secrets` exits 0
- [ ] A synthetic JWT-shaped literal in a staged-eligible file makes
      `npm run check:secrets` exit non-zero (demonstrated in Step 3)
- [ ] `npm run check:secrets` output on a violation names the identifier but
      **not** the value
- [ ] `npm run check:env` exits 0
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run lint` reports no more problems than the captured baseline
- [ ] `git show --stat HEAD` lists exactly two files: `.gitignore` and
      `scripts/check-secrets.mjs`
- [ ] `grep -c "eyJ" plans/README.md` prints `0` — no credential material in
      any file you wrote
- [ ] `plans/README.md` has the "Operator actions (not automatable)" rotation
      entry, and the status row for 011 is updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 shows `Simple-Qwen-Proxy.js` is **already tracked by git**. That means
  the credential is in committed history and the remedy is history rewriting
  plus immediate rotation — an operator decision with force-push implications.
  Report it and stop; do not attempt `git filter-repo`, `filter-branch`, or
  `rm --cached` on your own initiative.
- The root `.gitignore` already contains rules for either path and
  `git check-ignore` still reports them unignored — something more subtle is
  overriding the rules (a negation pattern, or the files being tracked).
- Extending `scripts/check-secrets.mjs` makes it flag existing legitimate files
  (e.g. `*.example` placeholders, `package-lock.json` integrity hashes). Do not
  loosen the check until it passes by weakening the pattern to something that
  would miss a real JWT; report the false positives instead so the exclusion
  list can be agreed.
- `npm run check:secrets` cannot be made to exit 0 without removing an existing
  check. Never delete an existing check to make your new one pass.
- You find any additional hard-coded credential anywhere in the repository while
  working. Report its `path:line` and credential type — never its value — and
  stop for operator instruction, since each one implies its own rotation.

## Maintenance notes

For whoever owns this next:

- The root `.gitignore` entries are deliberately root-anchored (`/Simple-...`).
  If the operator relocates their tooling outside the repository — the better
  long-term answer — these two entries become dead and can be dropped, but the
  `check-secrets.mjs` guard should stay permanently.
- A reviewer should confirm the new guard scans
  `git ls-files --cached --others --exclude-standard` and not a raw filesystem
  walk. A filesystem walk would re-scan ignored local tooling and produce a
  permanently-red check, which trains people to ignore the guard.
- A reviewer should also confirm the violation message prints identifier names
  only. Grep the new code for anything that interpolates the matched value into
  output.
- **Deferred out of this plan**: whether the local proxy tooling should live in
  this repository at all. Ignoring it is the minimum safe change; moving it to
  its own location outside the working tree removes the risk class entirely and
  is worth raising with the operator.
- **Deferred**: broadening `check-secrets.mjs` to catch other credential shapes
  (AWS keys, Supabase service-role keys, `sk-` prefixed keys). The JWT shape was
  the one with a live instance in the tree; the others are speculative and
  should be added with a test fixture each.
