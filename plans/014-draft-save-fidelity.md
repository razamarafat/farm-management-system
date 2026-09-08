# Plan 014: Make daily-sheet draft saves atomic, error-visible, and single-round-trip

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a9257dd..HEAD -- src/hooks/useDailySheet.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/013-vitest-unit-test-floor.md (vitest floor must be landed — new hook tests use it)
- **Category**: bug
- **Planned at**: commit `a9257dd`, 2026-09-07

## Why this matters

The daily sheet is the heartland operator flow (twice daily: feed + packaging).
Today three defects compound in `saveDraft`/`submitSheet`: (1) each per-line
`upsert` ignores the `{ error }` supabase-js returns (it never throws on
RLS/validation failure), so a rejected line is discarded while the UI shows
"ذخیره شد"; (2) `submitSheet` awaits a void `saveDraft` and submits regardless,
so a failed flush submits stale quantities; (3) every autosave issues N
sequential round trips (one per dirty line). Fixing all three in one rewrite of
`saveDraft` removes a silent-data-loss bug and the highest-frequency write
amplification in the app.

## Current state

The relevant file and its role:

- `src/hooks/useDailySheet.ts` — daily-sheet state + draft autosave + atomic
  submit/revert via `submit_daily_voucher` / `revert_daily_voucher` RPCs
  (631 lines).

Excerpts as they exist today (verified 2026-09-07):

```ts
// src/hooks/useDailySheet.ts:440-480 — saveDraft ignores per-row errors
const saveDraft = useCallback(async () => {
  if (!data || dirtyLinesRef.current.size === 0) return;
  ...
  try {
    const lines = Array.from(dirtyLinesRef.current.values());
    for (const line of lines) {
      await supabase.from('daily_voucher_lines').upsert(
        { voucher_id: data.voucher.id, item_id: line.item_id, ... },
        { onConflict: 'voucher_id,item_id' }
      ); // <-- no { error } destructured; supabase-js does NOT throw
    }
    dirtyLinesRef.current.clear(); // <-- runs even when rows were rejected
    ...
    setSaveStatus('saved');
```

```ts
// src/hooks/useDailySheet.ts:483-485 — submit proceeds regardless of flush outcome
const submitSheet = useCallback(async (): Promise<boolean> => {
  if (!data) return false;
  if (dirtyLinesRef.current.size > 0) await saveDraft(); // void; no success signal
```

Repo conventions that apply here, with exemplar:

- Persian user-facing toasts via `sonner` (`toast.error('خطا در ...')`), raw
  detail to `console.error` only — see `submitSheet` at
  `src/hooks/useDailySheet.ts:541-563` (logs `r.detail`, renders mapped message).
  Match it.
- RPC/error mapping via `rpcError()` in `src/utils/rpcError.ts`. Match it.
- AGENTS.md RULE 1: no fabricated/demo business data anywhere, including tests.
  Hook tests must double the Supabase client (mock `from().upsert`), never touch
  a live database. RULE 2: after changing `src/`, run `npm run build` and keep
  the rebuilt `dist/index.html` in the same change; grep it for demo strings.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Unit tests | `npx vitest run src/hooks/useDailySheet.test.ts` (path per plan 013's layout) | all new tests pass |
| Full unit suite | `npm run test:unit` (added by plan 013; if named differently there, use that name) | all pass |
| Build | `npm run build` | exit 0 |
| Bundle hygiene | `node -e 'const h=require("fs").readFileSync("dist/index.html","utf8");for(const s of ["demo-1","فارم مرکزی","فارم شماره"])if(h.includes(s))throw new Error(s)'` | exit 0, no output |

## Scope

**In scope** (the only files you should modify):

- `src/hooks/useDailySheet.ts` (rewrite `saveDraft`, adjust `submitSheet` gate)
- `src/hooks/useDailySheet.test.ts` (create; follow plan 013's test layout)

**Out of scope** (do NOT touch, even though they look related):

- `src/pages/DailySheetPage.tsx` and `src/components/consumption/DailySheetTable.tsx`
  — the `has_stock_source` gate and cell-disabled logic there are correct as-is
  (verified: `has_initial` sums all inbound `qty_in`, so transfers count).
- `src/hooks/useOfflineSync.ts` dead queue — a separate decision, not this fix.
- The stale-closure shape of dirty tracking (`updateLine` reads render-time
  `data` at `:418`) — behavior-preserving only; file as follow-up if observed,
  do not redesign here.
- `supabase/migrations/*` — no schema change in this plan.

## Git workflow

- Branch: `advisor/014-draft-save-fidelity`
- Commit per step; message style matches repo (`feat:`, `fix(ux):`, `chore:` —
  e.g. `git log --oneline -5` shows `fix(ux): ...`, `feat(dashboard): ...`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Rewrite `saveDraft` as one bulk upsert with error check + boolean return

In `src/hooks/useDailySheet.ts`, replace the per-line loop (`:447-464`) with:

1. Build the array payload from `dirtyLinesRef.current.values()` (same row
   shape, same `onConflict: 'voucher_id,item_id'` target).
2. Issue ONE `await supabase.from('daily_voucher_lines').upsert(rows, ...)`
   call; destructure `{ error }`.
3. On `error`: `throw` (so the existing `catch` marks `saveStatus='error'`
   with the Persian toast) and do NOT clear `dirtyLinesRef` — lines stay dirty
   for the next retry.
4. On success: clear dirty lines, mark items clean, `setSaveStatus('saved')`
   (unchanged).
5. Change signature to `Promise<boolean>`: `return true` on success,
   `return false` when there was nothing to save or the save failed. Keep the
   early `if (!data || dirtyLinesRef.current.size === 0) return false;`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Gate `submitSheet` on the flush result

At `submitSheet` (`:485`), change to:

```ts
if (dirtyLinesRef.current.size > 0) {
  const flushed = await saveDraft();
  if (!flushed) {
    setIsSaving(false);
    return false; // saveDraft already toasted the draft error
  }
}
```

Nothing else in `submitSheet` changes (the atomic `submit_daily_voucher` RPC
call, NEGATIVE_STOCK handling, and error mapping stay exactly as-is).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Cover the three behaviors with hook tests

Create `src/hooks/useDailySheet.test.ts` (or plan 013's equivalent hook-test
location — check where 013 put hook tests, if anywhere, and match it). Double
the Supabase client at the module boundary (mock `from('daily_voucher_lines')`
→ `{ upsert }` returning `{ error: null }` / `{ error: {...} }` on demand).
Cases:

1. Failed bulk upsert → `saveStatus` becomes `'error'`, dirty lines retained,
   Persian error toast shown.
2. Failed flush + submit → submit RPC (`submit_daily_voucher`) is NEVER called,
   `submitSheet` returns `false`.
3. Successful flush → exactly ONE `upsert` call carrying all dirty rows with
   `onConflict: 'voucher_id,item_id'`, dirty lines cleared.

No live Supabase, no real farms/items (AGENTS.md RULE 1). No timers beyond what
the hook already uses; call `saveDraft`/`submitSheet` through the hook harness
directly rather than waiting on the 800 ms debounce.

**Verify**: `npx vitest run <test-file>` → 3+ new tests pass; then
`npm run test:unit` (or 013's name) → all pass.

### Step 4: Rebuild the shipped bundle and confirm hygiene

Run `npm run build` (exit 0), then the bundle-hygiene command from the table
above (exit 0, no output).

**Verify**: both commands exit 0.

## Test plan

- New tests in `src/hooks/useDailySheet.test.ts`: the 3 cases in Step 3.
- Structural pattern: whatever hook-test harness plan 013 established; if 013
  added only util tests, model the Supabase doubling on the lightest existing
  mock in the repo and keep the file self-contained.
- Regression: full `test:unit` green; `tsc` clean; manual smoke (dev server,
  edit two cells fast, observe single save + `saved` status) is optional and
  must use only the operator's real farm — create nothing.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run test:unit` (or 013's equivalent) exits 0, including the 3 new tests
- [ ] `grep -n "for (const line of lines)" src/hooks/useDailySheet.ts` returns no matches
- [ ] `grep -n "await saveDraft();" src/hooks/useDailySheet.ts` returns no matches (all call sites check the boolean)
- [ ] `npm run build` exits 0 and the dist hygiene check passes
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at `useDailySheet.ts:441-485` doesn't match the excerpts (drift).
- Plan 013 has not landed (no vitest runner) — do not invent a second test
  framework; report blocked-on-013.
- The bulk `upsert` with an array payload is rejected by RLS/typecheck in a way
  the per-row loop was not (then keep per-row calls but WITH the `{ error }`
  check + boolean gate, and note the deviation).
- The fix appears to require touching `DailySheetPage.tsx`, migrations, or RPC
  definitions.

## Maintenance notes

- If server-side pagination or a balance RPC later replaces the client ledger
  reduce, the draft path is unaffected (it writes lines, not balances).
- Reviewers: scrutinize that failed lines STAY dirty (retry must re-send the
  same payload, not duplicates — `onConflict` makes retries idempotent).
- Deferred: `updateLine` stale-closure dirty tracking (`:418-431`) and the
  `updateTransaction` falsy-zero `total_price` bug in `useInventory.ts:424` are
  separate follow-ups.
