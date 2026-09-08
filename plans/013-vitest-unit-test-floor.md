# Plan 013: Establish a unit-test floor with vitest and lock in the behaviour of the three pure utility modules

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a9257dd..HEAD -- package.json tsconfig.json eslint.config.js .github/workflows/ci.yml src/utils/persianNumbers.ts src/utils/jalaliDate.ts src/utils/rpcError.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 010 (clean lockfile), 012 (CI must be repaired before a new CI step is trustworthy)
- **Category**: tests
- **Planned at**: commit `a9257dd`, 2026-08-29

## Why this matters

This repository has **no unit-test framework at all**. `git ls-files` matches
zero `*.test.ts` or `*.spec.ts` files, and `devDependencies` contains no test
runner. Every check in CI is either a type check, a lint, a whole-bundle build,
or an integration script that needs live Supabase credentials. That means the
functions where a one-character mistake silently produces a *wrong number on an
accounting screen* — Persian↔English digit conversion, Rial formatting, Jalali
date conversion, and the error-message mapper that stops raw Postgres internals
reaching operators — have no regression protection whatsoever.

Three of those modules are pure, dependency-free, and cheap to test:
`src/utils/persianNumbers.ts`, `src/utils/jalaliDate.ts`, and
`src/utils/rpcError.ts`. Covering them costs one dev-dependency and gives the
next several plans something to stand on. In particular **plan 015 cannot safely
change `jalaliDate.ts`'s silent fallbacks without these tests existing first** —
the tests written here are what will prove that plan 015 changed only the
fallback behaviour and not any real conversion.

A second, immediate payoff: writing characterization tests forces the current
behaviour into the open. Two latent defects in `jalaliDate.ts` are already known
and are deliberately captured as `it(...)` cases that assert **today's wrong
answer**, each marked with a comment pointing at plan 015. That is intentional —
see "Test plan".

## Current state

Files involved:

- `package.json` — root manifest. `devDependencies` has no test runner. The
  `scripts` block already delegates every `test:*` name to the export-api
  sub-service (see below), and `test` points at a script that is red.
- `vite.config.ts` — the SPA build config (React, Tailwind, `vite-plugin-singlefile`).
  **Not modified by this plan.**
- `tsconfig.json` — one root config. `include` is `["src", "vite.config.ts"]`.
- `eslint.config.js` — flat ESLint v9 config. Its typed block targets
  `files: ['src/**/*.{ts,tsx}']`, so new test files under `src/` **will** be
  linted.
- `src/utils/persianNumbers.ts` — 5 exported pure functions plus a
  `persianNumbers` barrel object.
- `src/utils/jalaliDate.ts` — 9 exported functions over `date-fns-jalali`.
- `src/utils/rpcError.ts` — the single `rpcError()` mapper.
- `.github/workflows/ci.yml` — the only workflow; plan 012 repaired it.

### Existing `test:*` script names are already taken

From `package.json`:

```
dev                 = concurrently "vite" "npm run start --prefix bff" "npm run start --prefix services/export-api"
test:contracts      = npm --prefix services/export-api run test:contracts
test:template       = npm --prefix services/export-api run test:template
test:reconciliation = npm --prefix services/export-api run test:reconciliation
test:perf           = npm --prefix services/export-api run test:perf
```

`test` itself is `node scripts/test-spa-reports.mjs` and is **RED at HEAD**.
This plan therefore adds a **new** script name, `test:unit`, and **does not
touch `test`**. Renaming or replacing the existing red script is out of scope —
silently hiding a failing test behind a new passing one is worse than leaving it
visibly red.

### `tsconfig.json` compiler options that constrain the tests

```json
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["node"],
```

Two consequences you must respect:

- `types: ["node"]` means **vitest's globals are not ambient**. Every test file
  must import what it uses: `import { describe, it, expect, vi, beforeEach } from 'vitest';`
  Do not set `globals: true` and do not add `"vitest/globals"` to `types` — the
  explicit-import form needs no config change at all.
- `noUnusedLocals` means an imported-but-unused helper is a **type error**, not a
  warning. Import only what each file actually uses.

### `eslint.config.js` rules that constrain the tests

```js
  ...tseslint.configs.recommended,
```

`@typescript-eslint/no-explicit-any` is active as an **error** — the recorded
lint baseline includes four pre-existing violations of it. So the test files must
contain **no `any`**. When you need to pass a deliberately-wrong type to test a
guard clause, use a double assertion instead:

```ts
expect(toPersianDigits(null as unknown as string)).toBe('');
```

`no-unused-vars` and `@typescript-eslint/no-unused-vars` are both `'off'` in
this config, but `noUnusedLocals` in `tsconfig.json` still catches them, so keep
imports tight regardless.

### The three modules under test

`src/utils/persianNumbers.ts` exports:

```ts
export function toPersianNumbers(n: string | number): string
export function toPersianDigits(n: string | number): string   // byte-identical to the above
export function toEnglishDigits(n: string): string
export function formatNumberWithSeparator(raw: string): string
export function formatRial(value: string | number | null | undefined): string
export const persianNumbers = { /* barrel of the five */ }
```

Behaviours that matter, read off the implementation:

- `toPersianDigits` / `toPersianNumbers` return `''` for `null` / `undefined`,
  otherwise replace `/\d/g` with `۰۱۲۳۴۵۶۷۸۹`.
- `toEnglishDigits` replaces only `/[۰-۹]/g` (Extended Arabic-Indic, U+06F0–U+06F9).
  It does **not** handle Arabic-Indic `٠-٩` (U+0660–U+0669), which Arabic
  keyboard layouts emit.
- `formatNumberWithSeparator` strips everything outside `[^\d۰-۹.-]`, converts to
  English digits, `parseFloat`s, and **returns the raw input unchanged** when the
  result is `NaN`. Empty input returns `''`.
- `formatRial` returns the em-dash `'—'` for `null`, `undefined`, `''`, and any
  non-finite number; otherwise `Math.round`s, separates, prefixes `-` for
  negatives, converts to Persian digits, and appends `' ریال'`.

`src/utils/jalaliDate.ts`, the two functions plan 015 will change:

```ts
// Convert Jalali date string to Gregorian ISO format (yyyy-MM-dd)
export function jalaliToGregorian(jalaliDate: string): string {
  const english = toEnglishDigits(jalaliDate).trim();
  if (isValidIsoDate(english)) return english;

  const date = parseValidJalali(english);
  return date ? formatGregorianIso(date) : getTodayIso();
}

// Convert Gregorian ISO date to Jalali
export function gregorianToJalali(isoDate: string): string {
  if (!isValidIsoDate(isoDate)) return getJalaliToday();
  const [year, month, day] = isoDate.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  return format(date, 'yyyy/MM/dd');
}
```

and the helper that decides the branch, at `src/utils/jalaliDate.ts:21`:

```ts
function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  return (
    Number.isFinite(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}
```

`ISO_DATE_RE` is `/^\d{4}-\d{2}-\d{2}$/`, and `addDaysToJalali` normalises `-`
to `/` before parsing (`src/utils/jalaliDate.ts:37`,
`normalized = english.replace(/-/g, '/')`). Those two facts together produce the
second latent defect described in "Test plan".

`src/utils/rpcError.ts` — `rpcError(e: unknown): string | null`, seven ordered
rules documented in the file header, and **it calls `console.error` on every
invocation** (`src/utils/rpcError.ts:89`):

```ts
  console.error('[rpcError] technical detail:', msg);
```

The two constants the tests assert against, verbatim from
`src/utils/rpcError.ts:22-23`:

```ts
const GENERIC_MESSAGE = 'خطای غیرمنتظره‌ای رخ داد';
const NETWORK_MESSAGE = 'خطا در اتصال به سرور. اتصال اینترنت خود را بررسی کنید';
```

Neither constant is exported, so the tests must inline the literals. Copy them
from the source file rather than retyping them — they contain a ZWNJ (U+200C) in
`غیرمنتظره‌ای` and in `گروه‌بندی` elsewhere in the file, and a retyped copy will
not compare equal.

Repo conventions:

- Node engine pinned: `>=22.12.0 <23`. Node 22 in CI.
- Conventional Commits: `feat:`, `chore(qa):`, `chore(deps):`.
- Source files carry a `// ===...` banner comment naming the file and its
  purpose — `src/utils/rpcError.ts:1-20` is the strongest example. New test files
  should carry a short banner in the same style.
- Pure-Node test scripts already in the repo use plain assertions and a hard
  `process.exit(1)`; see `services/export-api/contracts-test.mjs`, whose header
  documents the house style: "Runs in CI WITHOUT any Supabase credentials …
  Hard exit 1 on any violation. CI fails with readable message." The new vitest
  files replace that hand-rolled pattern for `src/`, but keep the same spirit:
  one assertion per meaningful behaviour, readable failure output.

## Commands you will need

| Purpose                | Command                                            | Expected on success                       |
|------------------------|----------------------------------------------------|-------------------------------------------|
| Install the runner     | `npm i -D vitest`                                   | exit 0                                    |
| Runner version         | `npx vitest --version`                              | prints a version                          |
| Unit tests (once)      | `npm run test:unit`                                 | exit 0, all tests pass                    |
| Unit tests (watch)     | `npm run test:unit:watch`                           | interactive — do not use in verification  |
| Typecheck              | `npx tsc --noEmit`                                  | exit 0, no output                         |
| Lint                   | `npm run lint`                                      | exit 1 expected — see note                |
| Build                  | `npm run build`                                     | exit 0                                    |
| Clean install          | `npm ci`                                            | exit 0                                    |
| Conflict guard         | `npm run check:conflicts`                           | exit 0                                    |

**Lint baseline.** `npm run lint` exits **1** at HEAD because of pre-existing
problems. That is expected and is NOT a failure. Capture the baseline **before
installing anything**:

```bash
npm run lint 2>&1 | tail -5
```

Record the "N problems (X errors, Y warnings)" line. The gate is that the number
is **unchanged** after your work. New test files under `src/` are linted, so a
sloppy test file will raise it — that is a real failure of this plan, not a
tolerated pre-existing one.

**`npm test`** is red at HEAD, is not a gate, and must not be modified.

## Scope

**In scope**:
- `package.json` — add `vitest` to `devDependencies`; add `test:unit` and
  `test:unit:watch` scripts. Do not touch the existing `test` script.
- `package-lock.json` — regenerated by npm, never hand-edited.
- `vitest.config.ts` — new file at the repository root.
- `tsconfig.json` — add `"vitest.config.ts"` to `include`, mirroring how
  `"vite.config.ts"` is already listed. This is the only change to this file.
- `src/utils/persianNumbers.test.ts` — new file.
- `src/utils/jalaliDate.test.ts` — new file.
- `src/utils/rpcError.test.ts` — new file.
- `.github/workflows/ci.yml` — one new step in the `validate` job.

**Out of scope** (do NOT touch):
- **The three modules under test.** `persianNumbers.ts`, `jalaliDate.ts`, and
  `rpcError.ts` must not be edited by this plan, not even to fix a bug the tests
  expose. This plan's job is to *capture* current behaviour. Changing
  `jalaliDate.ts` is plan 015. If you fix a bug here, plan 015's tests will pass
  vacuously and nobody will review the behaviour change.
- `vite.config.ts` — the new `vitest.config.ts` is deliberately separate so the
  SPA build plugins (Tailwind, `vite-plugin-singlefile`) are not loaded for a
  node-environment unit run.
- `eslint.config.js` — no config change should be needed. If a test file trips a
  rule, fix the test file.
- The existing `test` script and `scripts/test-spa-reports.mjs`.
- `src/utils/` modules other than the three named. `helpers.ts`,
  `validators.ts`, `farmHelpers.ts`, `localization.ts`, `userHelpers.ts`,
  `cn.ts`, `rpc.ts`, `imageCompression.ts`, `seedAdmin.ts`, and `constants.ts`
  are all plausible next targets but were not audited for testability; adding
  them here would balloon the diff. See "Maintenance notes".
- Any React component, hook, or store. No jsdom, no
  `@testing-library/react` — this plan installs exactly one dev-dependency.

## Git workflow

- Branch: `advisor/013-vitest-unit-test-floor`
- One commit. Message:
  `chore(qa): add vitest and unit-test the pure Persian/Jalali/error utils`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm there is genuinely no test infrastructure yet

```bash
git ls-files | grep -cE "\.(test|spec)\.[tj]sx?$"
ls vitest.config.* 2>/dev/null ; echo "config-exit=$?"
grep -c '"vitest"' package.json
```

**Verify**: the first prints `0`, the second prints a non-zero `config-exit`
(no such file), the third prints `0`. If any of these differ, someone has
already started this work — that is a STOP condition.

### Step 2: Install vitest

```bash
npm i -D vitest
npx vitest --version
```

**Verify**: `npm i` exits 0 and `npx vitest --version` prints a version string.

Then confirm npm resolved it cleanly against Vite 7:

```bash
npm ls vitest vite --depth=0
```

**Verify**: both are listed with no `invalid` or `UNMET PEER DEPENDENCY`
annotation. If npm reports a peer-dependency conflict, **do not** rerun with
`--force` or `--legacy-peer-deps` — that is a STOP condition.

### Step 3: Add the config and the scripts

Create `vitest.config.ts` at the repository root:

```ts
// =====================================================================
// vitest.config.ts
//
// Unit-test config, deliberately separate from vite.config.ts so a test
// run does not load the SPA build plugins (Tailwind, singlefile). These
// tests cover pure utility modules only, so the node environment is
// correct and is much faster than jsdom.
// =====================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Mirror the `@/*` -> `src/*` mapping in tsconfig.json.
    alias: { '@': path.resolve(rootDir, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

In `package.json`, add two scripts. Place them immediately after the existing
`test` entry so the `test*` names stay grouped:

```json
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
```

In `tsconfig.json`, extend `include` to cover the new config file:

```json
  "include": [
    "src",
    "vite.config.ts",
    "vitest.config.ts"
  ],
```

**Verify**:

```bash
npm run test:unit
```

At this point there are no test files yet. Vitest exits **non-zero** with "No
test files found" — that is expected and confirms the wiring works. Do not add
`--passWithNoTests`; the next step adds real files.

Also confirm the config file typechecks:

```bash
npx tsc --noEmit
```

**Verify**: exit 0, no output.

### Step 4: Test `persianNumbers.ts`

Create `src/utils/persianNumbers.test.ts`. Cover exactly these behaviours, each
as its own `it(...)`:

**`toPersianDigits` / `toPersianNumbers`**
- `toPersianDigits(0)` → `'۰'`
- `toPersianDigits('1403/10/15')` → `'۱۴۰۳/۱۰/۱۵'`
- `toPersianDigits('')` → `''`
- `toPersianDigits(null as unknown as string)` → `''`
- `toPersianDigits(undefined as unknown as string)` → `''`
- `toPersianDigits('abc')` → `'abc'` (non-digits pass through)
- `toPersianNumbers('12345')` equals `toPersianDigits('12345')` — one assertion
  documenting that the two exports are duplicates. Add a comment saying so.

**`toEnglishDigits`**
- `toEnglishDigits('۹۸۷۶۵۴۳۲۱۰')` → `'9876543210'`
- `toEnglishDigits('۱۲۳abc')` → `'123abc'`
- `toEnglishDigits('')` → `''`
- Round trip: `toEnglishDigits(toPersianDigits('9876543210'))` → `'9876543210'`
- **Known gap, assert current behaviour**: `toEnglishDigits('٣')` → `'٣'`
  (unchanged). Add a comment: Arabic-Indic U+0660–U+0669 is not handled; only
  Extended Arabic-Indic U+06F0–U+06F9 is. Do **not** fix this here.

**`formatNumberWithSeparator`**
- `formatNumberWithSeparator('1234567')` → `'1,234,567'`
- `formatNumberWithSeparator('۱۲۳۴')` → `'1,234'`
- `formatNumberWithSeparator('')` → `''`
- `formatNumberWithSeparator('abc')` → `'abc'` (NaN path returns the raw input)
- `formatNumberWithSeparator('1,234')` → `'1,234'` (comma stripped, then
  reseparated)

**`formatRial`**
- `formatRial(null)`, `formatRial(undefined)`, `formatRial('')` → `'—'` each
- `formatRial(0)` → `'۰ ریال'`
- `formatRial(1234)` → `'۱,۲۳۴ ریال'`
- `formatRial(1234.6)` → `'۱,۲۳۵ ریال'` (rounds half-up)
- `formatRial(-1500)` → `'-۱,۵۰۰ ریال'` (sign is an ASCII hyphen, outside the
  digit conversion)
- `formatRial('۱۲۳۴')` → `'۱,۲۳۴ ریال'`
- `formatRial('abc')` → `'—'`
- `formatRial(Number.POSITIVE_INFINITY)` → `'—'`
- `formatRial(Number.NaN)` → `'—'`

**The barrel**
- `persianNumbers.formatRial` is the same reference as the named
  `formatRial` export — one assertion, so a future refactor that forgets to
  update the barrel fails loudly.

Copy the `' ریال'` suffix and the `'—'` em-dash from
`src/utils/persianNumbers.ts` rather than retyping them.

**Verify**:

```bash
npm run test:unit
```

**Verify**: exit 0, and the summary reports the `persianNumbers` file with all
tests passing. If any expectation above fails, **do not change the source
module** — the expectation in this plan is wrong and the correct action is to
record the actual value, comment why, and note the discrepancy in your report.

### Step 5: Test `jalaliDate.ts`, including the two known defects

Create `src/utils/jalaliDate.test.ts`.

Several functions in this module read the current date. Freeze time so the
assertions are deterministic — this is what makes the fallback behaviour
testable at all:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FROZEN = new Date(2026, 7, 29, 12, 0, 0); // 2026-08-29 local time

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN);
});

afterEach(() => {
  vi.useRealTimers();
});
```

Note the month is `7` — JavaScript months are zero-based, and the module builds
dates with local-time constructors (`new Date(year, month - 1, day)`), not UTC.
Using a UTC string here would make the tests fail in some timezones.

**Round-trip properties** (these hold regardless of which anchor dates are
correct, so they are the safest assertions):
- `gregorianToJalali(jalaliToGregorian('1403/05/12'))` → `'1403/05/12'`
- `jalaliToGregorian(gregorianToJalali('2025-06-15'))` → `'2025-06-15'`
- `addDaysToJalali(addDaysToJalali('1403/05/12', 1), -1)` → `'1403/05/12'`
- `addDaysToJalali('1403/12/29', 5)` round-tripped back by `-5` → `'1403/12/29'`
  (crosses a Jalali year boundary)

**Anchor conversions.** Do **not** trust anchor dates from this plan — derive
them from the library, then hard-code what you observe. Run:

```bash
npx vitest run --reporter=verbose 2>/dev/null; node --input-type=module -e "
import { format } from 'date-fns-jalali';
for (const iso of ['2024-03-20','2025-03-21','2026-08-29']) {
  const [y,m,d] = iso.split('-').map(Number);
  console.log(iso, '->', format(new Date(y, m-1, d), 'yyyy/MM/dd'));
}
"
```

Record the printed pairs and encode **two** of them as explicit
`gregorianToJalali(iso) === '<observed>'` assertions, each with a comment saying
the value was derived from `date-fns-jalali` at the time of writing. This is a
characterization test: its purpose is to fail loudly if a `date-fns-jalali`
upgrade ever changes the conversion, not to independently verify the calendar.

**Persian-digit input**
- `jalaliToGregorian('۱۴۰۳/۰۵/۱۲')` equals `jalaliToGregorian('1403/05/12')`
- `formatJalaliDate('۱۴۰۳/۱۰/۱۵')` → `'1403/10/15'`

**ISO passthrough** (documented short-circuit at `jalaliDate.ts:89`)
- `jalaliToGregorian('2025-06-15')` → `'2025-06-15'`

**DEFECT 1 — silent today-fallback on unparseable input.** These assert the
*current, wrong* behaviour. Each `it(...)` title must start with
`KNOWN DEFECT (plan 015):` and carry a comment explaining that the function
silently substitutes today's date, so a typo in a date field writes a stock
movement to the wrong day:
- `jalaliToGregorian('garbage')` → `'2026-08-29'` (the frozen date, ISO form)
- `jalaliToGregorian('')` → `'2026-08-29'`
- `jalaliToGregorian('1403/13/45')` → `'2026-08-29'` (month 13 / day 45)
- `gregorianToJalali('not-a-date')` → the frozen date's Jalali form; obtain that
  string from `getJalaliToday()` in the test rather than hard-coding it
- `addDaysToJalali('garbage', 5)` → `'garbage'` (returns the input unchanged)

**DEFECT 2 — hyphen-separated Jalali dates are misread as Gregorian ISO.**
`ISO_DATE_RE` (`/^\d{4}-\d{2}-\d{2}$/`) matches `'1403-05-12'`, and
`isValidIsoDate` then confirms it because `new Date(1403, 4, 12)` really is the
year 1403 **AD**. So `jalaliToGregorian` returns it verbatim — a date roughly
621 years off. Meanwhile `addDaysToJalali` normalises `-` to `/` and treats the
same string as Jalali. Assert both halves of the inconsistency, again titled
`KNOWN DEFECT (plan 015):`:
- `jalaliToGregorian('1403-05-12')` → `'1403-05-12'` (unconverted)
- `jalaliToGregorian('1403-05-12')` **not** equal to
  `jalaliToGregorian('1403/05/12')` — the same date in two separators produces
  two different answers
- `addDaysToJalali('1403-05-12', 0)` → `'1403/05/12'` (the same input read as
  Jalali by a different function in the same module)

**Verify**:

```bash
npm run test:unit
```

**Verify**: exit 0. Every `KNOWN DEFECT` test **passes**, because it asserts the
present behaviour. If one fails, the behaviour is not what this plan describes —
record what you actually observed and report it; do not "fix" the module.

### Step 6: Test `rpcError.ts`

Create `src/utils/rpcError.test.ts`.

`rpcError` writes to `console.error` on every call, which would flood the test
output. Silence and assert it:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rpcError } from './rpcError';

const GENERIC = 'خطای غیرمنتظره‌ای رخ داد';
const NETWORK = 'خطا در اتصال به سرور. اتصال اینترنت خود را بررسی کنید';

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});
```

Copy `GENERIC` and `NETWORK` out of `src/utils/rpcError.ts:22-23` by
copy-paste. `خطای غیرمنتظره‌ای` contains a zero-width non-joiner (U+200C); a
retyped string will not compare equal and you will waste time on it.

Cover:

**Null-ish input returns `null`** (rule: nothing to show the user)
- `rpcError(null)`, `rpcError(undefined)`, `rpcError('')`, `rpcError('   ')` → `null` each

**Rule 1 — network failures → `NETWORK`**
- `new Error('Failed to fetch')`
- `new Error('NetworkError when attempting to fetch resource.')`
- `new Error('socket hang up')`
- `new Error('connect ECONNREFUSED 127.0.0.1:54321')`
- `new Error('The operation timed out')`
- `'net::ERR_INTERNET_DISCONNECTED'`

**Rule 2 — Persian with no ASCII letters passes through verbatim**
- `rpcError('این حواله قفل شده است')` → the same string
- Negative case: a string containing both Persian and ASCII letters must **not**
  pass through — `rpcError('خطا در OK')` → `GENERIC`. This is the guard at
  `rpcError.ts:95` and is the rule most likely to be broken by a careless edit.

**Rule 3 — known exact English strings, case-insensitively**
- `rpcError('Forbidden')` → `'دسترسی غیرمجاز'`
- `rpcError('forbidden: admin role required')` → `'دسترسی غیرمجاز'`
- `rpcError(new Error('Invalid login credentials'))` → `'نام کاربری یا رمز عبور اشتباه است'`
- `rpcError('duplicate input name')` → `'نام نهاده قبلاً ثبت شده است'`

**Rule 4 — English prefixes with variable detail**
- `rpcError('p_group_by must be one of day, week, month')` → `'مقدار گروه‌بندی نامعتبر است'`
- `rpcError('formula_no 12 already exists')` → `'شماره فرمول قبلاً وجود دارد'`
- `rpcError('cannot change unit type from kg to bag')` → the unit-type Persian
  message from `rpcError.ts:63`

**Rule 5 — `CODE: Persian` envelopes**
- `rpcError('VOUCHER_LOCKED: این حواله قفل شده است')` → `'این حواله قفل شده است'`
  (prefix stripped)
- Negative: `rpcError('SOME_CODE: not persian at all')` → `GENERIC` (the
  envelope only unwraps when the payload is Persian)

**Rule 6 — Postgres error codes.** Pass an object with both `code` and a
realistic raw `message`, to prove the code wins and the raw text never leaks:
- `{ code: '42501', message: 'permission denied for table daily_vouchers' }` → `'شما به این عملیات دسترسی ندارید'`
- `{ code: '23505', message: 'duplicate key value violates unique constraint "inputs_pkey"' }` → `'این رکورد قبلاً ثبت شده است'`
- `{ code: '22P02', message: 'invalid input syntax for type numeric: "x"' }` → `'مقدار وارد شده نامعتبر است'`
- `{ code: '23514', message: 'new row violates check constraint "qty_positive"' }` → `'مقدار وارد شده با قوانین سیستم مغایرت دارد'`
- `{ code: 'P0001', message: 'raise exception text' }` → `GENERIC`

**Rule 7 — unknown input → `GENERIC`**
- `rpcError(new Error('something nobody mapped'))` → `GENERIC`
- `rpcError({ nope: true })` → `GENERIC`

**The leak invariant — the single most valuable test in this file.** Iterate over
an array of realistic internal messages and assert that **no** return value
contains an ASCII letter. This is the property `rpcError` exists to guarantee,
and it is exactly what a raw `SQLERRM` in a database function defeats:

```ts
it('never leaks ASCII internals to the user for unmapped errors', () => {
  const internals = [
    'ERROR:  relation "public.daily_vouchers" does not exist at character 15',
    'PostgREST error: JWT expired',
    'TypeError: Cannot read properties of undefined (reading \'id\')',
    'postgres://user@host:5432/db connection failed',
    'at Object.<anonymous> (/app/src/hooks/useDailySheet.ts:441:7)',
  ];
  for (const raw of internals) {
    const out = rpcError(new Error(raw));
    expect(out).not.toBeNull();
    expect(out as string).not.toMatch(/[a-zA-Z]/);
  }
});
```

**Diagnostics are preserved**
- After `rpcError(new Error('anything'))`, assert `errorSpy` was called and that
  its first argument is `'[rpcError] technical detail:'`. That locks in the
  contract from the module header: "The raw technical detail is always logged to
  the console so it stays available for debugging without ever reaching the end
  user."

**Verify**:

```bash
npm run test:unit
```

**Verify**: exit 0, all three test files reported, no `console.error` noise in
the output.

### Step 7: Wire the unit tests into CI

Add one step to the `validate` job in `.github/workflows/ci.yml`, immediately
after the `Lint` step (fast, no DB, so it belongs early):

```yaml
      # Pure unit tests over src/utils — no DB, no browser. Fast enough to run
      # before the build so a broken util fails the job in seconds.
      - name: Unit tests
        run: npm run test:unit
```

**Verify**:

```bash
grep -c "npm run test:unit" .github/workflows/ci.yml
grep -c "npm test" .github/workflows/ci.yml
```

**Expected**: `1` and `0`. The second must stay zero — the pre-existing red
`test` script must not enter CI.

If `python3` is available, confirm the YAML still parses:

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"
```

### Step 8: Full verification from a clean install

```bash
npm ci
npm run check:conflicts
npx tsc --noEmit
npm run lint 2>&1 | tail -5
npm run test:unit
npm run build
```

**Verify**: `npm ci` exits 0 (proves the lockfile carries vitest correctly);
`check:conflicts` exits 0; `tsc` exits 0 with no output; the lint problem count
is **identical** to the baseline captured before Step 2; `test:unit` exits 0;
`build` exits 0.

Then confirm the diff is confined to scope:

```bash
git status --short
```

**Verify**: exactly these paths are modified or added — `package.json`,
`package-lock.json`, `tsconfig.json`, `vitest.config.ts`,
`src/utils/persianNumbers.test.ts`, `src/utils/jalaliDate.test.ts`,
`src/utils/rpcError.test.ts`, `.github/workflows/ci.yml`. Nothing else. In
particular `src/utils/persianNumbers.ts`, `src/utils/jalaliDate.ts`, and
`src/utils/rpcError.ts` must be **unmodified**.

## Test plan

This plan *is* a test plan, so the meta-question is what kind of tests these
are and how a reviewer should read them.

They are **characterization tests**: they encode what the code does today, not
what it should ideally do. That is deliberate and is the only safe first move on
untested code that drives real accounting numbers. Two consequences a reviewer
must understand:

1. **Five `it(...)` cases assert wrong behaviour on purpose.** Every one is
   titled `KNOWN DEFECT (plan 015):` and carries a comment. They are the
   deliverable, not an oversight — plan 015 will invert them, and the fact that
   they currently pass is the evidence that plan 015's change is confined to the
   fallback path.
2. **Two conversion anchors are derived from `date-fns-jalali`, not from an
   independent calendar.** They will catch a library upgrade that changes
   conversion; they will not catch a pre-existing conversion error. Verifying the
   Jalali calendar itself against an authority is out of scope and would need a
   reference table.

The structural pattern to follow for a no-credentials, hard-failing check is
`services/export-api/contracts-test.mjs`. The new files keep its spirit — one
assertion per behaviour, readable failure text — while using vitest instead of a
hand-rolled runner, because vitest gives per-case isolation and the fake-timer
support that Step 5's fallback tests require.

Coverage after this plan: 3 of 13 modules in `src/utils/`, zero hooks, zero
components. That is the floor, not the goal. See "Maintenance notes".

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c '"vitest"' package.json` → at least `1` (in `devDependencies`)
- [ ] `grep -c '"test:unit"' package.json` → `1`
- [ ] `grep -c '"test": "node scripts/test-spa-reports.mjs"' package.json` → `1`
      (the pre-existing script is untouched)
- [ ] `vitest.config.ts` exists at the repository root
- [ ] `grep -c "vitest.config.ts" tsconfig.json` → `1`
- [ ] `git ls-files src/utils | grep -c "\.test\.ts$"` → `3` (after staging)
- [ ] `npm run test:unit` exits 0
- [ ] The `test:unit` output reports **at least 60 passing tests** across the
      three files
- [ ] `grep -c "KNOWN DEFECT (plan 015)" src/utils/jalaliDate.test.ts` → at
      least `5`
- [ ] `npm ci` exits 0
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` problem count **identical** to the captured baseline
- [ ] `npm run build` exits 0
- [ ] `grep -c "npm run test:unit" .github/workflows/ci.yml` → `1`
- [ ] `grep -c "npm test" .github/workflows/ci.yml` → `0`
- [ ] `git diff --name-only a9257dd..HEAD -- src/utils/persianNumbers.ts src/utils/jalaliDate.ts src/utils/rpcError.ts` prints **nothing**
- [ ] `plans/README.md` status row for 013 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 finds existing test files, a `vitest.config.*`, or vitest already in
  `package.json`. Someone else has started this; reconcile before proceeding.
- `npm i -D vitest` reports a peer-dependency conflict with Vite 7. **Do not**
  retry with `--force` or `--legacy-peer-deps` — a forced install produces a
  lockfile that `npm ci` may reject in CI. Report the conflict text.
- `npm run lint` problem count **increases**. Your test files tripped a rule.
  Fix the test files. Do **not** edit `eslint.config.js`, and do **not** add an
  `eslint-disable` comment to make it pass — if the only apparent fix is
  disabling a rule, stop and report.
- `npx tsc --noEmit` reports errors in the new test files that you cannot
  resolve without loosening `tsconfig.json` (e.g. by adding
  `"vitest/globals"` to `types`, or turning off `strict`). Use explicit imports
  and `as unknown as T` double assertions instead; if that is not enough, report.
- Any expectation listed in Steps 4–6 fails. **Do not edit the module under
  test to make it pass.** Record the actual observed value, keep the test
  asserting reality, add a comment, and list every such discrepancy in your
  report — a mismatch means this plan's reading of the code was wrong and a
  human needs to see it.
- A test needs a mock of Supabase, the network, `window`, or a React hook. That
  means you have drifted out of the three pure modules; stop.
- `npm run build` fails after adding vitest. The dev-dependency must not reach
  the bundle; if it does, the test files are being imported by application code
  somewhere, which is a real problem worth reporting rather than working around.

## Maintenance notes

For whoever owns this next:

- **`npm run test:unit` is the unit-test entry point; `npm test` is a different,
  older, currently-red thing.** That is confusing and should be resolved, but
  resolving it means either fixing `scripts/test-spa-reports.mjs` or deleting
  it — a decision this plan deliberately did not make. Whoever fixes that script
  should consider making `test` chain `test:unit`, at which point CI can call the
  single name.
- **The five `KNOWN DEFECT (plan 015)` cases in `jalaliDate.test.ts` must be
  inverted by plan 015, not deleted.** If plan 015 lands and those tests are
  simply removed, the fallback behaviour has been changed with no test proving
  what it changed to. A reviewer of plan 015 should check that each one became an
  assertion about the *new* behaviour.
- A reviewer of *this* plan should scrutinise three things: that the three source
  modules are genuinely unmodified (`git diff` on them must be empty); that the
  Persian string literals in the tests were copy-pasted, not retyped (a retyped
  ZWNJ silently produces a different string that still *looks* right in a diff);
  and that the `rpcError` leak-invariant test really asserts
  `not.toMatch(/[a-zA-Z]/)` rather than a weaker substring check.
- **Deferred: the remaining ten modules in `src/utils/`.** `validators.ts`,
  `helpers.ts`, `farmHelpers.ts`, `localization.ts`, and `userHelpers.ts` are the
  next-highest value — they are pure or nearly so and sit on the same accounting
  paths. `imageCompression.ts`, `cn.ts`, `rpc.ts`, and `seedAdmin.ts` need
  browser or network doubles and should wait until there is a reason.
- **Deferred: component and hook tests.** Those need `jsdom` plus
  `@testing-library/react`, i.e. three or four more dev-dependencies and a second
  vitest environment. Worth doing, but only once there is a specific component
  whose regressions have actually cost something — otherwise the setup cost buys
  nothing.
- **Deferred: `toEnglishDigits` does not convert Arabic-Indic `٠-٩`
  (U+0660–U+0669).** A test in Step 4 documents the gap. Whether it matters
  depends on which keyboards operators actually use; if any of them produce
  Arabic-Indic digits, this is a live data-entry bug and deserves its own plan.
  Widening the regex to `/[۰-۹٠-٩]/g` with a matching index lookup would be the
  fix, but it must be done in `formatNumberWithSeparator`'s strip-regex too or
  the two will disagree.
- **Deferred: `toPersianNumbers` and `toPersianDigits` are byte-identical.** One
  test documents it. Consolidating them is a mechanical rename across the
  codebase; a previous audit round already considered and rejected a broader
  "formatter consolidation" plan, so do not start it without a reason.
