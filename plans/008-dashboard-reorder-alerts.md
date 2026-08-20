# Plan 008: Surface reorder alerts on the dashboards (count badge via existing RPC)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Your reviewer maintains `plans/README.md` — do
> not edit it.
>
> **Drift check (run first)**: `git diff --stat f3395fe..HEAD -- src/components/dashboard/ src/navigation/ src/hooks/`
> Plans 003 and 006 (same branch, earlier) reshape the dashboards
> (manifest-driven tiles; logs tile enabled) — EXPECTED. Anything else: STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/003-sidebar-nav-and-reorder-discoverability.md
- **Category**: direction (DIRECTION-03 phase 1)
- **Planned at**: commit `f3395fe`, 2026-07-20

## Why this matters

The reorder engine is fully built server-side — `reporting_reorder_point_v3`
computes on-hand, ABC class, and a `reorder_recommended` boolean per item —
but its output is visible only if someone opens the reports page or the (until
plan 003, unreachable) reorder page. For a feed operation, a stockout is a
production incident; the users who decide purchases are exactly the ones not
staring at a report daily. Phase 1 of the alerting channel: a count badge on
every dashboard, fed by the existing RPC, linking to the reorder page.

## Current state

- RPC contract — `scripts/migrations/014_reporting_v3_enhancements.sql:733+`:
  `reporting_reorder_point_v3(p_farm_id uuid DEFAULT NULL, p_basis text DEFAULT 'value', p_abc_class text DEFAULT NULL, p_reorder_needed_only boolean DEFAULT FALSE)`
  RETURNS TABLE(... `reorder_recommended boolean` ...). SECURITY INVOKER —
  RLS scopes rows per JWT, so operators/supervisors automatically see only
  their farm.
- SPA invocation exemplar — `src/components/reports/ReorderPointSection.tsx:100-106`:

```tsx
const { rows, totalCount, isLoading, error, refetch } = useReportSection<ReorderRow>(
  'reporting_reorder_point_v3',
  {
    p_farm_id: farm_id,
    p_basis: basis,
    p_abc_class: abcClass,
    p_reorder_needed_only: reorderNeededOnly,
```

  `useReportSection` (src/hooks/useReportSection.ts) is the abort-safe RPC
  hook returning `{rows, totalCount, isLoading, error, refetch}` — reuse it;
  do not write a new fetch hook.
- Dashboards after plan 003: each maps `navItemsForRole(role)` to `Tile`s;
  the reorder item exists in `src/navigation/manifest.ts` with
  `path: 'reorder'`.
- `Tile` (`src/components/ui/Tile.tsx`) accepts
  `{icon, label, color, to, onClick, disabled}` — NO badge prop yet. It is
  `memo`-wrapped; a new optional primitive prop is memo-safe.
- Profile/farm context: `useAuthStore` exposes `profile` with `role` and
  `farm_id` (`src/components/dashboard/OperatorDashboard.tsx:13` shows the
  read pattern).
- Persian digits: `toPersianDigits` from `@/utils/persianNumbers`.

## Commands you will need

Run inside the execution worktree (deps preinstalled).

| Purpose   | Command           | Expected on success |
|-----------|-------------------|---------------------|
| Typecheck | `npx tsc --noEmit`| exit 0              |
| Lint      | `npm run lint`    | exit 0; no NEW errors beyond the 7 pre-existing at f3395fe |
| Build     | `npm run build`   | exit 0              |

## Scope

**In scope**:
- `src/hooks/useReorderAlertCount.ts` (create — thin wrapper over useReportSection)
- `src/components/ui/Tile.tsx` (optional `badgeCount?: number` prop)
- `src/components/dashboard/AdminDashboard.tsx`
- `src/components/dashboard/SupervisorDashboard.tsx`
- `src/components/dashboard/OperatorDashboard.tsx`
- `dist/index.html` (rebuild artifact)

**Out of scope**:
- Push/SMS/Telegram channels (phase 2 — product decision, see plan 009).
- Any change to the RPC or migrations.
- `useReportSection` internals.
- Login-time toast (deliberately dropped: a badge is persistent; a toast on
  every login is noise).

## Git workflow

- Shared advisor branch; one commit, e.g.
  `feat(dashboard): reorder-alert count badge on the reorder tile`.
- Rebuild `dist/index.html` same commit. Do NOT push.

## Steps

### Step 1: Create `src/hooks/useReorderAlertCount.ts`

```ts
import { useReportSection } from '@/hooks/useReportSection';

/**
 * Count of items currently at/below their reorder point, for the badge on
 * the dashboard tile. Server-side RPC (SECURITY INVOKER — RLS scopes rows
 * to the caller's farm for non-admins). p_farm_id stays null: admins see
 * the fleet-wide count, operators are scoped by RLS anyway.
 */
export function useReorderAlertCount(): number | null {
  const { rows, isLoading, error } = useReportSection<Record<string, unknown>>(
    'reporting_reorder_point_v3',
    {
      p_farm_id: null,
      p_basis: 'quantity',
      p_abc_class: null,
      p_reorder_needed_only: true,
    },
  );
  if (isLoading || error) return null; // badge hidden until known
  return rows.length;
}
```

Check `useReportSection`'s actual signature first (params object shape, extra
options argument) and conform; the exemplar call above is from
ReorderPointSection.tsx:100.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Add `badgeCount` to `Tile.tsx`

Optional prop `badgeCount?: number | null`. When a positive number, render in
the tile's top-left corner (opposite the icon, which sits top-right):

```tsx
{typeof badgeCount === 'number' && badgeCount > 0 && (
  <span className="absolute top-2 left-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[var(--c-destructive)] text-white text-xs font-bold flex items-center justify-center">
    {toPersianDigits(String(badgeCount))}
  </span>
)}
```

inside the existing `content` div (already `relative`). Import
`toPersianDigits`. Null/0/undefined render nothing.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Feed the badge from the three dashboards

In each dashboard: `const reorderCount = useReorderAlertCount();` and pass
`badgeCount={item.path === 'reorder' ? reorderCount : undefined}` in the
manifest map. (One RPC call per dashboard mount; the RPC is a server-side
aggregate — acceptable. Do NOT add it to the sidebar, which mounts on every
page.)

**Verify**: `grep -ln "useReorderAlertCount" src/components/dashboard/` → all
three dashboard files; tsc exit 0.

### Step 4: Build and commit

`npm run build` → exit 0; commit + `dist/index.html`.

## Test plan

No SPA test runner; no live DB in the worktree. Gates: tsc, lint, build.
Report must note: badge hides (returns null) on loading AND on error — a
failed RPC must never render «۰» (that would be a false all-clear, the same
dishonesty class as AGENTS.md RULE 4 warns about).

## Done criteria

- [ ] tsc / lint (no new errors) / build pass
- [ ] Hook exists and returns null on loading/error, count otherwise
- [ ] Tile renders the badge only for positive counts
- [ ] All three dashboards pass the count to the reorder tile only
- [ ] Only in-scope files committed; `dist/index.html` included

## STOP conditions

- `useReportSection`'s signature can't express this call.
- Plan 003's manifest structure is absent (dependency not landed).
- Excerpts drifted otherwise; verification fails twice.

## Maintenance notes

- Phase 2 (out-of-app alerting) is a product decision — see plan 009's
  decision brief. The hook is the natural data source for it.
- If dashboards ever gain more RPC-fed stats, batch them into one summary RPC
  (performance finding PERF-01's territory) rather than stacking calls.
- Reviewer: verify the badge's null-vs-zero semantics in the diff.
