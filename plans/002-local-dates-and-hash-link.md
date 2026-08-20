# Plan 002: Fix the two local-date defects and the broken hash-router voucher link

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Your reviewer maintains `plans/README.md` — do
> not edit it.
>
> **Drift check (run first)**: `git diff --stat f3395fe..HEAD -- src/pages/DailySheetPage.tsx src/pages/ReorderPointPage.tsx src/pages/InventoryPage.tsx src/utils/jalaliDate.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UX-02, UX-03)
- **Planned at**: commit `f3395fe`, 2026-07-20

## Why this matters

Two small defects corrupt user flows daily. (1) The daily sheet's default date
uses `toISOString()` — the **UTC** date. Iran is UTC+3:30, so between 00:00 and
03:30 local the sheet preselects *yesterday's* voucher and consumption is
recorded against the wrong day. The same pattern shifts ReorderPointPage's
7-day window boundary. (2) The only cross-link from inventory history to its
source voucher is a raw `<a href>` under a hash router (`createHashRouter` in
`src/router/index.tsx:4`) — clicking it triggers a full browser navigation
outside the `#/` space, which 404s or reloads the SPA and dumps state.

## Current state

- `src/pages/DailySheetPage.tsx:36`:

```tsx
const dateParam = searchParams.get('date') || new Date().toISOString().split('T')[0];
```

- `src/utils/jalaliDate.ts` has the correct helpers (all local-time):
  - `getJalaliToday()` (line 66) — Jalali `yyyy/MM/dd` from `new Date()`
  - `jalaliToGregorian(jalali)` (line 87) — Jalali → Gregorian ISO `yyyy-MM-dd`
  - internal `getTodayIso()` (line 6, not exported) — local ISO date
- `src/pages/ReorderPointPage.tsx:74-77` (inside `fetch7DayAvgConsumption`):

```ts
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
const fromDate = sevenDaysAgo.toISOString().split('T')[0];
```

- `src/pages/InventoryPage.tsx:719-721` builds `targetLink` =
  `` `${basePath}/consumption/...?date=${txn.txn_date}` `` and lines 744-749
  render it as:

```tsx
<a
  href={targetLink}
  className="text-primary hover:underline"
>
  مشاهده سند
</a>
```

- `InventoryPage.tsx` already imports from `react-router-dom` — check its
  import list; `Link` may need adding.
- Convention: `DailySheetPage` consumes `dateParam` as a Gregorian ISO string
  (`yyyy-MM-dd`) — the replacement must produce exactly that shape.

## Commands you will need

Run inside the execution worktree (deps preinstalled).

| Purpose   | Command           | Expected on success |
|-----------|-------------------|---------------------|
| Typecheck | `npx tsc --noEmit`| exit 0              |
| Lint      | `npm run lint`    | exit 0; no NEW errors beyond the 7 pre-existing at f3395fe |
| Build     | `npm run build`   | exit 0              |

## Scope

**In scope**:
- `src/utils/jalaliDate.ts` (export one helper)
- `src/pages/DailySheetPage.tsx` (line 36 only)
- `src/pages/ReorderPointPage.tsx` (lines 74-77 only)
- `src/pages/InventoryPage.tsx` (the anchor at 744-749 + imports)
- `dist/index.html` (rebuild artifact)

**Out of scope**:
- Any other `toISOString()` call sites (e.g. LoginForm's `last_login_at` — a
  timestamp, correctly UTC).
- `jalaliToGregorian`'s today-fallback behavior — separately tracked; do not
  change function semantics, only add an export.
- The `targetLink` construction logic at 719-721 (only the rendering changes).

## Git workflow

- Shared advisor branch (named in your dispatch message); one commit, e.g.
  `fix(dates,nav): local-date defaults and hash-safe voucher link`.
- Rebuild `dist/index.html` in the same commit (AGENTS.md RULE 2).
- Do NOT push.

## Steps

### Step 1: Export a local-ISO-today helper from `src/utils/jalaliDate.ts`

The file has a private `getTodayIso()` at line 6. Export it under a clear
name by adding (near the other exports; keep the private one intact):

```ts
// Local-timezone ISO date (yyyy-MM-dd). Use for DEFAULT DATES instead of
// new Date().toISOString() — toISOString() is UTC and selects yesterday
// between 00:00 and 03:30 Iran time.
export function getTodayLocalIso(): string {
  return getTodayIso();
}
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Fix `DailySheetPage.tsx:36`

```tsx
const dateParam = searchParams.get('date') || getTodayLocalIso();
```

Add `getTodayLocalIso` to the existing `@/utils/jalaliDate` import (the file
already imports from it).

**Verify**: `grep -n "toISOString" src/pages/DailySheetPage.tsx` → no match on
the dateParam line (other hits, if any, must be pre-existing and unrelated —
list them in your report).

### Step 3: Fix the 7-day window in `ReorderPointPage.tsx`

Replace lines 74-77's UTC conversion with local formatting:

```ts
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
const fromDate = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`;
```

(Local arithmetic, no import needed in this standalone module function.)

**Verify**: `grep -n "toISOString" src/pages/ReorderPointPage.tsx` → 0 matches.

### Step 4: Convert the voucher anchor to a router `Link`

In `src/pages/InventoryPage.tsx` replace the `<a href={targetLink}>` block
(lines 744-749) with:

```tsx
<Link
  to={targetLink}
  className="text-primary hover:underline"
>
  مشاهده سند
</Link>
```

Add `Link` to the file's `react-router-dom` import.

**Verify**: `grep -n "href={targetLink}" src/pages/InventoryPage.tsx` → 0
matches; `grep -n "to={targetLink}" src/pages/InventoryPage.tsx` → 1 match.

### Step 5: Build and commit

`npm run build` → exit 0; commit source + `dist/index.html`.

## Test plan

No SPA unit-test runner exists at f3395fe. Gate on tsc/lint/build plus the
greps above. In your report note the manual check a reviewer can do: open
`#/admin/inventory`, history tab, click «مشاهده سند» → URL stays under `#/`
and the daily-sheet page opens with the txn's date.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0, no new errors
- [ ] `npm run build` exits 0
- [ ] `grep -c "toISOString" src/pages/ReorderPointPage.tsx` → 0
- [ ] DailySheetPage line 36 uses `getTodayLocalIso()`
- [ ] InventoryPage uses `<Link to={targetLink}>`
- [ ] Only in-scope files in the commit; `dist/index.html` included

## STOP conditions

- Excerpts don't match (drift).
- `getTodayIso` is absent from `jalaliDate.ts`.
- `targetLink` is consumed anywhere else that depends on full-page navigation.
- A verification fails twice.

## Maintenance notes

- Future date-default code must use `getTodayLocalIso()` / `getJalaliToday()`,
  never `toISOString().split('T')[0]` — worth a lint rule eventually.
- Reviewer: confirm `txn.txn_date` is `yyyy-MM-dd` (it is — DB `date` column)
  so the link param shape is unchanged.
