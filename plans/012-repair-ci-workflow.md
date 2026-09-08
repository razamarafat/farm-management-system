# Plan 012: Repair the CI workflow so its DB jobs can actually run and its export-api steps can actually resolve their dependencies

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a9257dd..HEAD -- .github/workflows/ci.yml package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 010 (lockfile must be clean before you trust `npm ci`)
- **Category**: dx
- **Planned at**: commit `a9257dd`, 2026-08-29

## Why this matters

Three separate defects mean CI is not currently doing the job it appears to do.

1. The `reconciliation` and `perf-budget` jobs are gated on
   `if: ${{ env.SUPABASE_TEST_URL != '' && env.SUPABASE_TEST_JWT != '' }}`.
   The `env` context is **not available** in a job-level `if:` — GitHub only
   exposes `github`, `needs`, `vars`, and `inputs` there. So both expressions
   evaluate against an undefined context, both resolve false, and **both jobs
   skip unconditionally, on every run, even when the secrets are configured**.
   The two most valuable tests in the pipeline — the accounting balance
   invariant and the per-RPC latency budget — have never gated a merge.
2. The `validate` job runs `npm --prefix services/export-api run test:template`
   and `test:contracts`, but never installs `services/export-api`'s
   dependencies. `services/export-api/node_modules` is **not** tracked by git
   (`git ls-files services/export-api/node_modules` returns 0 files), and
   `exceljs` is not a root dependency. Both of those steps therefore fail in CI
   with `ERR_MODULE_NOT_FOUND` for `exceljs`. They pass on a developer machine
   only because `services/export-api/node_modules` happens to exist there.
3. `scripts/check-legacy-admin.mjs` exists and is wired into `package.json`, but
   is not invoked by CI at all — so the guard that watches the in-progress
   admin-client migration provides no signal on a pull request.

Fixing these turns a green-looking pipeline into one that genuinely blocks
regressions in the accounting invariant, the report templates, and the report
registry contract.

## Current state

Files involved:

- `.github/workflows/ci.yml` — the only workflow. Three jobs: `validate`
  (no DB needed), `reconciliation` (needs DB), `perf-budget` (needs DB).
- `package.json` — defines the `check:*` scripts CI calls. Not modified by this
  plan; read only, to confirm script names.
- `services/export-api/package.json` — separate manifest with its own
  `package-lock.json`. Declares `exceljs ^4.4.0`, `fastify`, `@fastify/cors`,
  `@supabase/supabase-js`, and the `test:template` / `test:contracts` scripts.

### The broken gate (appears twice, identically)

`reconciliation`:

```yaml
  reconciliation:
    runs-on: ubuntu-latest
    # Skip when DB secrets aren't configured. The reconciliation-test.mjs
    # script itself also gates exit-code-zero on absent env, but hiding
    # the job from the PR timeline keeps the workflow summary readable.
    if: ${{ env.SUPABASE_TEST_URL != '' && env.SUPABASE_TEST_JWT != '' }}
    needs: validate
```

`perf-budget`:

```yaml
  perf-budget:
    runs-on: ubuntu-latest
    # Same skip semantic as reconciliation.
    if: ${{ env.SUPABASE_TEST_URL != '' && env.SUPABASE_TEST_JWT != '' }}
    needs: validate
```

The secrets are only ever bound at **step** level, inside each job's final
step:

```yaml
      - name: Balance invariant + online-totals parity
        working-directory: services/export-api
        env:
          SUPABASE_TEST_URL: ${{ secrets.SUPABASE_TEST_URL }}
          SUPABASE_TEST_JWT: ${{ secrets.SUPABASE_TEST_JWT }}
        run: node reconciliation-test.mjs
```

**The documented intent must be preserved.** The comment says the goal is
"hiding the job from the PR timeline keeps the workflow summary readable" — i.e.
when secrets are absent the job should be *skipped*, not run-and-pass. That
rules out simply moving the condition to the step, which would leave a green job
with a skipped step in the timeline. It also rules out referencing `secrets`
directly in the job `if:`, because the `secrets` context is not available there
either. The supported pattern is a job **output**: `validate` probes for the
secrets and publishes a yes/no flag, and the two DB jobs gate on
`needs.validate.outputs.*`, which **is** available in a job-level `if:`.

### The missing install in `validate`

`validate`'s steps, in order, at HEAD:

```yaml
      - name: Install dependencies
        run: npm ci

      - name: Check merge conflict markers
        run: npm run check:conflicts

      - name: TypeScript type check
        run: npx tsc --noEmit

      - name: Lint
        run: npm run lint

      - name: Security & env checks
        run: npm run check:secrets && npm run check:env

      - name: Build
        run: npm run build

      - name: Excel template self-test (pure Node, no DB)
        run: npm --prefix services/export-api run test:template

      - name: Registry contract test (pure Node, no DB)
        run: npm --prefix services/export-api run test:contracts
```

There is no `services/export-api` install anywhere in this job. The dependency
chain that breaks: `template-test.mjs` and `contracts-test.mjs` both import
`./xlsx-template.mjs`, and `services/export-api/xlsx-template.mjs:50` is
`import ExcelJS from 'exceljs';`.

The other two jobs already do it correctly, and their step naming is the pattern
to copy:

```yaml
      # Root npm ci installs root deps; export-api has its own
      # package.json with @supabase/supabase-js + exceljs which service
      # scripts need at runtime.
      - name: Install root dependencies
        run: npm ci

      - name: Install export-api dependencies
        working-directory: services/export-api
        run: npm ci
```

### The legacy-admin guard

`package.json` defines two variants:

- `check:legacy-admin` → `node scripts/check-legacy-admin.mjs --advisory`
- `check:legacy-admin:strict` → `node scripts/check-legacy-admin.mjs`

**Strict is expected to FAIL at HEAD.** It flags `src/lib/supabase-admin.ts` and
its consumer `src/hooks/useUsers.ts`, which are mid-migration; completing that
migration is plan 020's job. So this plan wires in the **advisory** variant only.
Adding the strict variant now would make CI permanently red, which trains people
to ignore it.

Repo conventions:

- Node 22 on `ubuntu-latest`, `cache: npm`, `actions/checkout@v4`,
  `actions/setup-node@v4`. Step names are sentence case, sometimes with a
  parenthetical qualifier, e.g. `Excel template self-test (pure Node, no DB)`.
- Comments in the workflow explain *why* a step exists, not what it does.
- Conventional Commits: `feat: fix all TS errors, update CI pipeline, ...`,
  `chore(deps): ...`, `chore(qa): ...`.
- Node engine pinned repo-wide: `>=22.12.0 <23`.

## Commands you will need

| Purpose                       | Command                                                        | Expected on success                |
|-------------------------------|----------------------------------------------------------------|------------------------------------|
| Root install                  | `npm ci`                                                        | exit 0                              |
| export-api install            | `npm --prefix services/export-api ci`                           | exit 0                              |
| Template self-test            | `npm --prefix services/export-api run test:template`            | exit 0                              |
| Registry contract test        | `npm --prefix services/export-api run test:contracts`           | exit 0                              |
| Legacy-admin (advisory)       | `npm run check:legacy-admin`                                    | exit 0 — **confirm in Step 4**      |
| Legacy-admin (strict)         | `npm run check:legacy-admin:strict`                             | **non-zero at HEAD — expected**     |
| Conflict / env / secret guards| `npm run check:conflicts` / `check:env` / `check:secrets`        | exit 0 each                         |
| Typecheck                     | `npx tsc --noEmit`                                              | exit 0, no output                   |
| Build                         | `npm run build`                                                 | exit 0                              |

**Lint baseline.** `npm run lint` exits **1** at HEAD with pre-existing
problems. That is expected and is NOT a failure. Capture the baseline before
changing anything:

```bash
npm run lint 2>&1 | tail -5
```

Record the "N problems (X errors, Y warnings)" line; the gate is **no new
problems** versus that number. This plan does not touch `src/`, so the number
must be identical. Do not fix pre-existing lint problems here.

**`npm test`** (`node scripts/test-spa-reports.mjs`) is **RED at HEAD** and is
deliberately not a gate for this plan. Do not attempt to fix it, and do not add
it to the workflow.

**You cannot run GitHub Actions locally**, and pushing is out of scope. So every
verification below is either (a) a local reproduction of the thing CI does, or
(b) a structural assertion against the YAML text. Both are required — neither
alone is sufficient.

## Suggested executor toolkit

If `python3` is available, use it to prove the YAML still parses after editing:

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"
```

If `python3` is not available, skip that check and rely on the grep assertions
in the steps below plus careful indentation — but say so in your report, so a
reviewer knows the parse was not machine-verified.

## Scope

**In scope** (the only file you should modify):
- `.github/workflows/ci.yml`

**Out of scope** (do NOT touch):
- `package.json` — no new scripts are needed; every command this plan wires in
  already exists.
- `scripts/check-legacy-admin.mjs` — do not change its behaviour or its advisory
  threshold to make a step green.
- `src/**`, `bff/**`, `services/export-api/**` source — this plan changes CI
  only. If a newly-enabled step reveals a genuine source defect, that is a STOP
  condition, not something to fix here.
- **Do not add `npm run check` (the aggregate) to CI in this plan.** It chains
  `check:legacy-admin:strict`, which fails at HEAD. Collapsing the individual
  guard steps into the single aggregate entry point is the *final* step of plan
  020, once the migration makes strict pass. Adding it now would red the build.
- **Do not add `npm test` to CI.** It is red at HEAD.
- `services/export-api/package-lock.json` — `npm ci` must not rewrite it. If it
  does, that is a STOP condition.

## Git workflow

- Branch: `advisor/012-repair-ci-workflow`
- One commit. Message:
  `fix(ci): gate DB jobs on a real secrets probe and install export-api deps`
- The commit must contain exactly one file. Verify with `git show --stat HEAD`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Reproduce defect 2 locally, so you know the fix is load-bearing

From the repository root:

```bash
node -e "import('exceljs').then(()=>console.log('RESOLVABLE-FROM-ROOT'),e=>console.log('NOT-RESOLVABLE:',e.code))"
```

**Verify**: prints `NOT-RESOLVABLE: ERR_MODULE_NOT_FOUND`. This proves `exceljs`
is absent from the root install, and therefore that a CI job which runs only
root `npm ci` cannot execute the export-api tests.

Then confirm the tests do pass once the right deps are present:

```bash
npm --prefix services/export-api ci
npm --prefix services/export-api run test:template ; echo "template exit=$?"
npm --prefix services/export-api run test:contracts ; echo "contracts exit=$?"
```

**Verify**: both print `exit=0`. If either fails here, the failure is a
pre-existing source defect, not something this plan introduced — that is a STOP
condition.

Also confirm `npm ci` did not rewrite the lockfile:

```bash
git status --short services/export-api
```

**Verify**: prints nothing.

### Step 2: Add the export-api install to `validate`

In `.github/workflows/ci.yml`, inside the `validate` job:

1. Rename the existing step `Install dependencies` to
   `Install root dependencies`, so all three jobs use the same name for the
   same action.
2. Immediately after it, insert the export-api install, copying the wording and
   the explanatory comment from the `reconciliation` job:

```yaml
      # export-api has its own package.json (exceljs + @supabase/supabase-js);
      # the template and contract tests below import it, so root npm ci is not
      # enough.
      - name: Install export-api dependencies
        working-directory: services/export-api
        run: npm ci
```

**Verify**:

```bash
grep -c "Install export-api dependencies" .github/workflows/ci.yml
grep -c "Install root dependencies" .github/workflows/ci.yml
grep -c "name: Install dependencies" .github/workflows/ci.yml
```

**Expected**: `3`, `3`, and `0` respectively — the export-api install and the
renamed root install now appear once per job, and the old step name is gone.

### Step 3: Replace the broken job gate with a real secrets probe

Three edits, all in `.github/workflows/ci.yml`.

**3a.** Give `validate` an `outputs` block. Insert it between
`runs-on: ubuntu-latest` and `steps:`:

```yaml
  validate:
    runs-on: ubuntu-latest
    outputs:
      db-secrets-present: ${{ steps.db-secrets.outputs.present }}
```

**3b.** Add the probe step to `validate`. Put it **first**, immediately after
`Checkout`, so the flag is available even if a later step fails. It must never
print the secret values — `[ -n "$VAR" ]` tests without echoing, and there is no
`set -x`:

```yaml
      # The `env` context is NOT available in a job-level `if:` (GitHub exposes
      # only github/needs/vars/inputs there), and neither is `secrets`. So we
      # probe for the DB test credentials here and publish a yes/no flag the
      # downstream jobs can gate on via needs.validate.outputs. Never echo the
      # values themselves.
      - name: Detect DB test secrets
        id: db-secrets
        env:
          SUPABASE_TEST_URL: ${{ secrets.SUPABASE_TEST_URL }}
          SUPABASE_TEST_JWT: ${{ secrets.SUPABASE_TEST_JWT }}
        run: |
          if [ -n "$SUPABASE_TEST_URL" ] && [ -n "$SUPABASE_TEST_JWT" ]; then
            echo "present=yes" >> "$GITHUB_OUTPUT"
          else
            echo "present=no" >> "$GITHUB_OUTPUT"
          fi
```

**3c.** Replace the `if:` line in **both** `reconciliation` and `perf-budget`.
Keep each job's existing explanatory comment but correct it, and keep
`needs: validate` — the `needs.validate.*` reference only resolves because of it.

For `reconciliation`:

```yaml
  reconciliation:
    runs-on: ubuntu-latest
    # Skip when DB secrets aren't configured, so the workflow summary stays
    # readable. The flag comes from validate's `Detect DB test secrets` step
    # because job-level `if:` cannot see the env or secrets contexts.
    # reconciliation-test.mjs also exits 0 on absent env as a second layer.
    if: ${{ needs.validate.outputs.db-secrets-present == 'yes' }}
    needs: validate
```

For `perf-budget`:

```yaml
  perf-budget:
    runs-on: ubuntu-latest
    # Same skip semantic as reconciliation.
    if: ${{ needs.validate.outputs.db-secrets-present == 'yes' }}
    needs: validate
```

**Verify**:

```bash
grep -c "env.SUPABASE_TEST_URL != ''" .github/workflows/ci.yml
grep -c "needs.validate.outputs.db-secrets-present == 'yes'" .github/workflows/ci.yml
grep -c "needs: validate" .github/workflows/ci.yml
grep -c "id: db-secrets" .github/workflows/ci.yml
```

**Expected**: `0`, `2`, `2`, `1`. The first must be zero — any remaining
occurrence of the `env.`-based condition means one of the two jobs is still
dead.

Confirm the probe never leaks a value:

```bash
grep -n "SUPABASE_TEST" .github/workflows/ci.yml
```

**Verify**: every occurrence is either a `${{ secrets.* }}` binding inside an
`env:` block or a `"$SUPABASE_TEST_*"` inside the `[ -n ... ]` test. No `echo`
or `run:` line prints one.

### Step 4: Wire in the advisory legacy-admin guard

First establish which exit code the advisory variant actually returns:

```bash
npm run check:legacy-admin ; echo "advisory exit=$?"
npm run check:legacy-admin:strict ; echo "strict exit=$?"
```

**Verify**: strict prints a non-zero exit — expected at HEAD, and the reason
this plan uses advisory. Note the advisory exit code.

- **If advisory exited 0**, add this step to `validate`, immediately after the
  `Security & env checks` step:

```yaml
      # Advisory only: the admin-client migration is still in progress (see
      # plans/020). check:legacy-admin:strict is expected to fail until that
      # lands, at which point this becomes strict and folds into `npm run check`.
      - name: Legacy admin-client usage (advisory)
        run: npm run check:legacy-admin
```

- **If advisory exited non-zero**, add the same step with
  `continue-on-error: true` on it, so the report is visible in the timeline
  without failing the job:

```yaml
      - name: Legacy admin-client usage (advisory)
        continue-on-error: true
        run: npm run check:legacy-admin
```

Pick exactly one based on what you observed. Do not edit
`scripts/check-legacy-admin.mjs` to change its exit code.

**Verify**:

```bash
grep -c "check:legacy-admin$" .github/workflows/ci.yml
grep -c "check:legacy-admin:strict" .github/workflows/ci.yml
```

**Expected**: `1` and `0` — the advisory variant is wired in exactly once, and
the strict variant is **not** in CI.

### Step 5: Prove the file still parses and nothing else moved

```bash
python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/ci.yml')); print(sorted(d['jobs'].keys())); print(d['jobs']['validate']['outputs'])"
```

**Verify**: prints `['perf-budget', 'reconciliation', 'validate']` and an
`outputs` mapping containing `db-secrets-present`. If `python3` is unavailable,
skip this and note it in your report.

Then confirm the diff is confined to what this plan intends:

```bash
git diff --stat
git diff .github/workflows/ci.yml
```

**Verify**: `--stat` lists only `.github/workflows/ci.yml`. Read the diff and
confirm it contains only: the two `if:` replacements, the `outputs` block, the
probe step, the export-api install, the step rename, and the advisory step.
Nothing about job ordering, runner version, or `actions/*` versions changed.

### Step 6: Run the full local equivalent of the `validate` job

Execute, in order, exactly what `validate` will run:

```bash
npm ci
npm --prefix services/export-api ci
npm run check:conflicts
npx tsc --noEmit
npm run lint 2>&1 | tail -5
npm run check:secrets && npm run check:env
npm run check:legacy-admin ; echo "advisory exit=$?"
npm run build
npm --prefix services/export-api run test:template
npm --prefix services/export-api run test:contracts
```

**Verify**: every command exits 0 except `npm run lint` (exit 1, problem count
identical to the baseline you captured) and possibly `check:legacy-admin` (which
must match the exit code you observed in Step 4 and be handled accordingly).
`git status --short` must show only `.github/workflows/ci.yml` as modified.

## Test plan

No new test files. The workflow itself is the artefact under change, and the
test is Step 6: running the `validate` job's command sequence locally, in order,
against a clean install. That local run is what proves the new
`Install export-api dependencies` step is both necessary (Step 1's
`ERR_MODULE_NOT_FOUND`) and sufficient (Step 6's two passing export-api steps).

The structural greps in Steps 2–4 are the test for the parts that cannot be
executed locally — the job-level `if:` expressions. Each grep has an exact
expected count, so a partial edit (fixing one job but not the other) fails
visibly rather than silently.

The existing structural pattern for a pure-Node, no-DB CI check is
`services/export-api/contracts-test.mjs`, whose header documents the convention:
"Runs in CI WITHOUT any Supabase credentials … Hard exit 1 on any violation.
CI fails with readable message."

**A reviewer with repository access should confirm on the first pull request
after this lands** that `reconciliation` and `perf-budget` either run (secrets
configured) or show as skipped-by-condition (secrets absent) — and specifically
that they are no longer skipped when the secrets *are* configured. That is the
one assertion no local command can make.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "env.SUPABASE_TEST_URL != ''" .github/workflows/ci.yml` → `0`
- [ ] `grep -c "needs.validate.outputs.db-secrets-present == 'yes'" .github/workflows/ci.yml` → `2`
- [ ] `grep -c "id: db-secrets" .github/workflows/ci.yml` → `1`
- [ ] `grep -c "Install export-api dependencies" .github/workflows/ci.yml` → `3`
- [ ] `grep -c "name: Install dependencies" .github/workflows/ci.yml` → `0`
- [ ] `grep -c "check:legacy-admin$" .github/workflows/ci.yml` → `1`
- [ ] `grep -c "check:legacy-admin:strict" .github/workflows/ci.yml` → `0`
- [ ] `grep -c "npm run check$" .github/workflows/ci.yml` → `0` (the aggregate
      is deliberately NOT wired in yet; plan 020 does that)
- [ ] `grep -c "npm test" .github/workflows/ci.yml` → `0`
- [ ] No `run:` line in the workflow echoes a `SUPABASE_TEST_*` value
- [ ] YAML parses (or the report states the parse was not machine-verified)
- [ ] `npm ci` exits 0
- [ ] `npm --prefix services/export-api ci` exits 0 and leaves
      `git status --short services/export-api` empty
- [ ] `npm --prefix services/export-api run test:template` exits 0
- [ ] `npm --prefix services/export-api run test:contracts` exits 0
- [ ] `npm run check:conflicts`, `check:env`, `check:secrets` each exit 0
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run lint` problem count identical to the captured baseline
- [ ] `git show --stat HEAD` lists exactly one file:
      `.github/workflows/ci.yml`
- [ ] `plans/README.md` status row for 012 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's `node -e` probe prints `RESOLVABLE-FROM-ROOT`. That means `exceljs`
  *is* reachable from the root install, defect 2's premise is false, and adding
  the install step may be unnecessary — report before changing anything.
- `npm --prefix services/export-api run test:template` or `test:contracts`
  fails **after** a successful `npm --prefix services/export-api ci`. That is a
  pre-existing source defect in the export-api service, outside this plan's
  scope, and enabling it in CI would red the build. Report the failure output.
- `npm --prefix services/export-api ci` modifies
  `services/export-api/package-lock.json`. That is lockfile drift in the
  sub-service and needs its own reconciliation, like plan 010 did for the root.
- `npm run check:legacy-admin:strict` unexpectedly **passes**. That would mean
  the admin-client migration already landed, plan 020's premise has changed, and
  you should wire in the strict variant instead — but confirm with the operator
  first rather than deciding alone.
- `npm run check:secrets` or `check:env` fails. Those are unrelated guards; a
  failure means something else in the tree is broken and must be resolved before
  CI changes can be validated.
- The YAML fails to parse after your edit and you cannot fix the indentation in
  two attempts.
- You find that a job-level `if:` referencing `needs.validate.outputs.*` is
  rejected by whatever validator you have available. Do not fall back to
  step-level gating on your own initiative — it changes the timeline behaviour
  the existing comment explicitly asks for. Report instead.

## Maintenance notes

For whoever owns this next:

- **The gate now depends on `validate` succeeding.** With `needs: validate`, a
  failing `validate` job means the DB jobs never run — which was already true
  before this change, but is now the only path. That is the correct trade-off
  (don't spend DB time on a build that doesn't compile), but it means a flaky
  `validate` silently costs you reconciliation coverage. Worth watching.
- **The probe step is deliberately first in `validate`**, right after checkout,
  so the output flag is published before any step that might fail. If someone
  reorders `validate`'s steps, keep the probe at the top.
- A reviewer should scrutinise two things: that the probe never interpolates a
  secret into a `run:` line (CI logs are more widely readable than the working
  tree), and that both `if:` expressions were changed — fixing one and missing
  the other leaves half the coverage dead and looks correct at a glance.
- **Deferred to plan 020**: collapsing `check:conflicts`, `check:env`,
  `check:secrets`, and legacy-admin into the single `npm run check` entry point,
  and flipping legacy-admin from advisory to strict. Both become safe only once
  the admin-client migration lands. Doing it earlier makes CI permanently red.
- **Deferred**: `npm test` (`scripts/test-spa-reports.mjs`) is red at HEAD and
  therefore absent from CI. Whoever fixes that script should add it to
  `validate` in the same change, otherwise it will stay unnoticed indefinitely.
- **Deferred**: `services/export-api` has `test:smoke`, `test:reconciliation`,
  and `test:perf` scripts, and `test:all` chains only contracts + template. The
  smoke test is not run anywhere in CI. Wiring it in needs a decision about
  whether it requires credentials.
