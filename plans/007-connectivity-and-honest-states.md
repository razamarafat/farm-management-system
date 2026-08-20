# Plan 007: Mount a live connectivity banner and honest empty/loading/error affordances

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Your reviewer maintains `plans/README.md` — do
> not edit it.
>
> **Drift check (run first)**: `git diff --stat f3395fe..HEAD -- src/components/layout/AppLayout.tsx src/components/ui/OfflineBanner.tsx src/pages/InventoryPage.tsx src/pages/PurchasesPage.tsx src/pages/DailySheetPage.tsx src/components/ui/Tile.tsx`
> Plans 002/003/004/005 (same branch, earlier) touch InventoryPage,
> DailySheetPage — their described changes are EXPECTED. Anything else: STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (sequence after 001–006 to avoid merge friction in shared files)
- **Category**: ux (UX-13, UX-11, UX-12)
- **Planned at**: commit `f3395fe`, 2026-07-20

## Why this matters

On farm-grade connections the app gives zero connectivity feedback: a complete
`OfflineBanner` component exists but is mounted nowhere, so failed saves read
as mystery errors. Five farm/item selector fetches on the two heaviest admin
pages silently discard errors and show an empty dropdown indistinguishable
from "no farms exist". And permanently disabled controls (the daily sheet's
Excel button, two dashboard tiles) carry no explanation, training users that
grey means broken. Three small, independent fixes; none requires the offline
sync-queue (explicitly out of scope).

## Current state

- `src/components/ui/OfflineBanner.tsx:12` — presentational component with
  props `{isOnline, pendingCount, isSyncing, onSync}`; zero importers
  (repo-wide grep).
- `src/components/layout/AppLayout.tsx` (full 21-line file) mounts
  Header/Sidebar/Outlet/Toaster only.
- `src/pages/InventoryPage.tsx:110-124` (farms) and `131-143` (farm_items):

```tsx
useEffect(() => {
  if (isAdmin) {
    supabase
      .from('farms')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setFarms(data || []);
        if (data && data.length > 0 && !selectedFarmId) {
          setSelectedFarmId(data[0].id);
        }
      });
  }
}, [isAdmin]);
```

  (error member never read; no loading state on the select.)
- `src/pages/PurchasesPage.tsx:92-106` (farms), `109-121` (otherFarms),
  `124-137` (farm_items) — same `.then(({ data }) => ...)` pattern ×3.
- The done-right exemplar: `src/pages/ConsumptionPage.tsx:28-45` sets
  `isLoadingFarms` around the fetch and renders «در حال بارگذاری...» +
  disabled select (lines 145-155).
- `src/pages/DailySheetPage.tsx:424-427`:

```tsx
<Button variant="outline" disabled className="flex items-center gap-2">
  <FileSpreadsheet className="w-4 h-4" />
  خروجی اکسل
</Button>
```

- `src/components/ui/Tile.tsx:47-49` — disabled branch:
  `if (disabled) { return <div className={containerClasses}>{content}</div>; }`
- `src/components/dashboard/AdminDashboard.tsx` — after plan 006, exactly two
  disabled tiles remain (packaging, settings).
- Toast position: `src/components/ui/Toast.tsx:9` — `position="top-left"`;
  in this RTL app the visual start corner is top-RIGHT.
- Number-format duplicate: `src/utils/persianNumbers.ts:1-11` —
  `toPersianNumbers` and `toPersianDigits` are byte-identical.

## Commands you will need

Run inside the execution worktree (deps preinstalled).

| Purpose   | Command           | Expected on success |
|-----------|-------------------|---------------------|
| Typecheck | `npx tsc --noEmit`| exit 0              |
| Lint      | `npm run lint`    | exit 0; no NEW errors beyond the 7 pre-existing at f3395fe |
| Build     | `npm run build`   | exit 0              |

## Scope

**In scope**:
- `src/hooks/useOnlineStatus.ts` (create)
- `src/components/layout/AppLayout.tsx` (mount banner)
- `src/pages/InventoryPage.tsx` (2 fetches: loading+error state)
- `src/pages/PurchasesPage.tsx` (3 fetches: loading+error state)
- `src/pages/DailySheetPage.tsx` (remove the dead Excel button)
- `src/components/ui/Tile.tsx` (optional «به زودی» badge on disabled)
- `src/components/dashboard/AdminDashboard.tsx` (pass the badge flag)
- `src/components/ui/Toast.tsx` (position → top-right)
- `dist/index.html` (rebuild artifact)

**Out of scope**:
- `useOfflineSync` / `offlineStorage` / service worker / any sync-queue work
  (separate product decision — do not wire, do not delete).
- `OfflineBanner.tsx` itself (consume as-is with `pendingCount={0}`).
- Wiring the daily-sheet Excel export to the export-api (a feature, not this
  cleanup; removing the dead button is honest UX today).
- The `toPersianNumbers`/`toPersianDigits` duplicate consolidation — 100+
  call sites; separate mechanical PR. (Noted here so nobody "fixes" it
  opportunistically inside this plan.)

## Git workflow

- Shared advisor branch; one commit, e.g.
  `fix(ux): connectivity banner, selector load/error states, honest disabled controls`.
- Rebuild `dist/index.html` same commit. Do NOT push.

## Steps

### Step 1: Create `src/hooks/useOnlineStatus.ts`

```ts
import { useEffect, useState } from 'react';

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return isOnline;
}
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Mount `OfflineBanner` in `AppLayout.tsx`

```tsx
const isOnline = useOnlineStatus();
...
<OfflineBanner isOnline={isOnline} pendingCount={0} isSyncing={false} onSync={() => {}} />
```

placed after `<Toaster />`. (With `pendingCount={0}` the banner renders ONLY
when offline — exactly the v1 behavior wanted.)

**Verify**: `grep -n "OfflineBanner" src/components/layout/AppLayout.tsx` → 1 import + 1 render.

### Step 3: Loading + error affordances on the five selector fetches

For `InventoryPage.tsx` (×2) and `PurchasesPage.tsx` (×3), convert each
`.then(({ data }) => ...)` to async/await with full state, following the
ConsumptionPage exemplar:

- Add per-page state: `isLoadingFarms` / `farmsError` (and analogous for
  items; `otherFarms` may share the farms error state — reviewer's call,
  document your choice).
- Destructure `{ data, error }`; on error set the error state and
  `toast.error('خطا در دریافت فهرست فارم‌ها')` (items:
  «خطا در دریافت اقلام فارم») — `toast` is already imported in both pages.
- While loading, disable the affected `<select>`/`SearchableSelect` and show
  the small «در حال بارگذاری...» caption exactly as ConsumptionPage:152-154.
- On error, render a small inline retry affordance:
  `<button onClick={retryFn} className="text-xs text-[var(--c-destructive)] underline">تلاش مجدد</button>`
  next to the selector (wrap each fetch in a `useCallback` so it can be
  retried).
- Behavior preservation: the auto-select-first-farm logic
  (`setSelectedFarmId(data[0].id)`) must remain byte-equivalent in effect.

**Verify**: `grep -c "\.then(({ data })" src/pages/InventoryPage.tsx src/pages/PurchasesPage.tsx` → 0 total; tsc exit 0.

### Step 4: Remove the dead Excel button in `DailySheetPage.tsx`

Delete the `disabled` Excel Button block (lines 424-427) and the
`FileSpreadsheet` import if now unused.

**Verify**: `grep -n "خروجی اکسل" src/pages/DailySheetPage.tsx` → 0 matches.

### Step 5: «به زودی» badge on disabled tiles

In `Tile.tsx`, when `disabled`, render a small badge in the top-left (RTL
visual end) of the tile: `<span className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--c-muted)] text-[var(--c-muted-fg)]">به زودی</span>`
inside the existing disabled `<div>` (it already has `relative overflow-hidden`
on containerClasses). No new prop needed — disabled implies the badge.

**Verify**: `grep -n "به زودی" src/components/ui/Tile.tsx` → 1 match.

### Step 6: Move the Toaster to the RTL start corner

`src/components/ui/Toast.tsx:9`: `position="top-left"` → `position="top-right"`.

**Verify**: `grep -n "top-right" src/components/ui/Toast.tsx` → 1 match.

### Step 7: Build and commit

`npm run build` → exit 0; commit + `dist/index.html`.

## Test plan

No SPA test runner. Gates: tsc, lint, build, step greps. Report should walk:
(a) offline event → banner appears with «حالت آفلاین», online → disappears;
(b) farms fetch failure path → toast + inline retry + select disabled=false
after retry succeeds; (c) confirm no remaining `.then(({ data })` fetch in
either page.

## Done criteria

- [ ] tsc / lint (no new errors) / build pass
- [ ] OfflineBanner mounted in AppLayout via useOnlineStatus
- [ ] Zero `.then(({ data })` selector fetches remain in the two pages; each
      has loading + error + retry affordances
- [ ] Dead Excel button removed
- [ ] Disabled tiles show «به زودی»
- [ ] Toaster at top-right
- [ ] Only in-scope files committed; `dist/index.html` included

## STOP conditions

- Excerpts drifted beyond plans 002-005's expected changes.
- OfflineBanner's props differ from `{isOnline, pendingCount, isSyncing, onSync}`.
- The selector conversion forces changes to `useInventory` hooks.
- Verification fails twice.

## Maintenance notes

- When a real sync queue lands, `pendingCount`/`onSync` are already plumbed.
- If the daily-sheet Excel export is built later, restore the button wired to
  `triggerServerExport` (see `src/lib/excelServer.ts`).
- Reviewer: check the retry callbacks don't refire the auto-select when a
  farm is already selected.
