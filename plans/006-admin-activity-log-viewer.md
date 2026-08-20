# Plan 006: Build the admin activity-log viewer (/admin/logs)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Your reviewer maintains `plans/README.md` — do
> not edit it.
>
> **Drift check (run first)**: `git diff --stat f3395fe..HEAD -- src/router/routes.tsx src/components/dashboard/AdminDashboard.tsx src/hooks/ src/types/database.types.ts`
> Plans 001 and 003 (same branch, earlier in sequence) legitimately modify
> `routes.tsx` and `AdminDashboard.tsx` — their changes (RoleHomeRedirect on
> `/`; manifest-driven tiles) are EXPECTED and not drift. Anything else
> mismatching the excerpts: STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/003-sidebar-nav-and-reorder-discoverability.md (AdminDashboard shape)
- **Category**: direction (DIRECTION-05 / DIRECTION-02)
- **Planned at**: commit `f3395fe`, 2026-07-20

## Why this matters

The app writes an audit trail (`user_activity_logs`) on every user-management
action, ships an admin-only SELECT RLS policy for it, documents it in the
README as the "admin action audit log", and renders a dashboard tile
(«لاگ فعالیت‌ها») for it — but no page reads the table and the tile is
disabled, dead-ending at the UnderDevelopment wildcard. A write-only audit log
has zero product value; "who changed that user and when" is a question an
admin of a three-role production system will eventually ask urgently. Every
layer except the page already exists — this is the cheapest genuine feature in
the repo.

## Current state

- Writes: `src/hooks/useUsers.ts:16-28` — `logActivity` inserts
  `{user_id, action, resource_type: 'user', resource_id}`. Actions written
  today (lines 177/232/261/278/299/323): `user_created`, `user_updated`,
  `user_deactivated`, `user_deleted`, `user_activated`, `password_reset`.
- Read policy: `scripts/migrations/004_rls_policies.sql:198-205` —
  `user_activity_logs_select_admin` FOR SELECT gated on the caller being an
  active admin profile. The SPA's JWT-bound client can select directly; no RPC
  needed.
- Row shape: `src/types/database.types.ts:101-110`:

```ts
user_activity_logs: {
  Row: {
    id: string;
    user_id: string | null;
    action: string;
    resource_type: string | null;
    resource_id: string | null;
    details: Json | null;
    created_at: string;
  };
```

  (No FK relationship entry is declared in the generated types — do NOT use a
  PostgREST embedded select `profiles(...)`; fetch usernames separately.)
- Tile: `src/components/dashboard/AdminDashboard.tsx:89-95` — `to="/admin/logs"`
  with `disabled` (after plan 003 this tile is one of the three literal
  disabled tiles appended after the manifest map).
- Routing: `src/router/routes.tsx:118-121` — `/admin/*` wildcard →
  `UnderDevelopment`; new routes must be registered BEFORE it (alphabetical
  position within the children array is irrelevant; any position before the
  `'*'` entry works).
- Data-layer convention — hand-rolled hook returning
  `{data, isLoading, error, refetch}`; exemplar: `src/hooks/useSuppliers.ts`
  (~45 lines with `useState`/`useEffect`/`useCallback`). Match it. Do NOT
  introduce TanStack Query.
- Table conventions: pages render plain `<table>` with sticky header (see the
  history tab of `src/pages/InventoryPage.tsx:700+`) or `ReportTable`
  (`src/components/reports/ReportTable.tsx` — presentational, needs
  columns/rows/page/sort props). For this page use a plain table modeled on
  InventoryPage's history tab — `ReportTable`'s column-chooser/sort machinery
  is overkill for v1 and its props demand sort state you don't need.
- Date display: `formatJalaliDate`/`getJalaliDateTime` FROM `@/utils/jalaliDate`;
  Persian digits via `toPersianDigits` from `@/utils/persianNumbers`.
- Persian empty-state rule (AGENTS.md RULE 1/4): when no rows, show an honest
  empty state — no fabricated sample rows, ever.

## Commands you will need

Run inside the execution worktree (deps preinstalled).

| Purpose   | Command           | Expected on success |
|-----------|-------------------|---------------------|
| Typecheck | `npx tsc --noEmit`| exit 0              |
| Lint      | `npm run lint`    | exit 0; no NEW errors beyond the 7 pre-existing at f3395fe |
| Build     | `npm run build`   | exit 0              |

## Scope

**In scope**:
- `src/hooks/useActivityLogs.ts` (create)
- `src/pages/AdminLogsPage.tsx` (create)
- `src/router/routes.tsx` (add `logs` route before the admin wildcard)
- `src/components/dashboard/AdminDashboard.tsx` (enable the logs tile)
- `dist/index.html` (rebuild artifact)

**Out of scope**:
- Widening WHAT gets logged (inventory/voucher mutations) — follow-up.
- Any SQL/migration change (the RLS policy already exists).
- `rpc_admin_log_activity` and its guard status — do not call it; the page is
  read-only.
- Log retention/pruning.
- Supervisor/operator access (admin-only by policy).

## Git workflow

- Shared advisor branch; one commit, e.g.
  `feat(admin): activity-log viewer at /admin/logs`.
- Rebuild `dist/index.html` same commit. Do NOT push.

## Steps

### Step 1: Create `src/hooks/useActivityLogs.ts`

Model on `useSuppliers.ts`. Shape:

```ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface ActivityLogRow {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
  /** Resolved client-side from profiles; null when the actor was deleted. */
  actor_name: string | null;
}

const PAGE_SIZE = 25;

export function useActivityLogs(page: number, actionFilter: string | null) {
  // state: rows, totalCount, isLoading, error
  // fetch: supabase.from('user_activity_logs')
  //   .select('id, user_id, action, resource_type, resource_id, created_at', { count: 'exact' })
  //   .order('created_at', { ascending: false })
  //   .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  //   [+ .eq('action', actionFilter) when set]
  // THEN resolve actor names: collect distinct non-null user_ids,
  //   supabase.from('profiles').select('id, username, first_name, last_name').in('id', ids)
  //   map into actor_name = `${first_name} ${last_name}`.trim() || username.
  // CHECK BOTH { error } RESULTS and set error state (do not swallow).
  // return { rows, totalCount, isLoading, error, refetch, PAGE_SIZE };
}
```

Write the real implementation (the comment block above is the contract, not
literal code). Both Supabase calls must destructure and handle `{ error }`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Create `src/pages/AdminLogsPage.tsx`

Structure (match InventoryPage/InputsPage page conventions — motion.div
wrapper, Card, header with icon):

- Header: `Activity` icon + «لاگ فعالیت‌ها» title + subtitle
  «سوابق عملیات مدیریتی کاربران».
- Filter row: a `<select>` over the six known actions + «همه» (values:
  '' → null, `user_created`, `user_updated`, `user_activated`,
  `user_deactivated`, `user_deleted`, `password_reset`) with Persian labels:
  ایجاد کاربر / ویرایش کاربر / فعال‌سازی / غیرفعال‌سازی / حذف کاربر /
  بازنشانی رمز. Unknown actions in data render as their raw string.
- Table columns: تاریخ (Jalali date+time, `dir="ltr"` Persian digits) |
  کاربر (actor_name or «—») | عملیات (Persian label chip — reuse `Badge`
  variants: destructive for deleted/deactivated, success for
  created/activated, info for updated/password_reset) | شناسه منبع
  (resource_id truncated, `dir="ltr"`, or «—»).
- Loading: `Skeleton` rows (see `ReportTable`'s skeleton usage) or centered
  `Spinner` — either is acceptable; pick one and say which in the report.
- Error: red inline Card with the error message and a «تلاش مجدد» retry
  Button calling `refetch` (mirror ConsumptionPage's error affordances).
- Empty: centered muted «هیچ فعالیتی ثبت نشده است».
- Pagination: قبلی/بعدی Buttons + «صفحه N از M» (Persian digits), disabled at
  bounds. Reset page to 1 when the filter changes.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Register the route

In `src/router/routes.tsx`, inside the `/admin` children BEFORE the `'*'`
wildcard entry, add:

```tsx
{
  path: 'logs',
  element: <LazyPage><AdminLogsPage /></LazyPage>,
},
```

with `const AdminLogsPage = lazy(() => import('@/pages/AdminLogsPage'));`
beside the other lazy imports.

**Verify**: `grep -n "logs" src/router/routes.tsx` → the new route present,
positioned before the wildcard line.

### Step 4: Enable the dashboard tile

In `AdminDashboard.tsx` remove `disabled` from the «لاگ فعالیت‌ها» tile
(keep packaging/settings disabled). If plan 003 landed, this tile is one of
the literal appended tiles — just delete its `disabled` prop.

**Verify**: `grep -n -A5 "لاگ فعالیت‌ها" src/components/dashboard/AdminDashboard.tsx`
→ no `disabled` in that tile block.

### Step 5: Build and commit

`npm run build` → exit 0; commit + `dist/index.html`.

## Test plan

No SPA test runner. Gates: tsc, lint, build. Data-dependent behavior can't be
exercised without a live DB (none in the worktree): state this plainly in the
report. Enumerate in the report: both `{error}` checks in the hook, the
page-reset-on-filter-change effect, and the RLS note (non-admins get 0 rows —
the route is also role-gated at `/admin`).

## Done criteria

- [ ] tsc / lint (no new errors) / build pass
- [ ] `src/hooks/useActivityLogs.ts` exists; both queries check `{error}`
- [ ] `/admin/logs` route registered before the wildcard
- [ ] Logs tile no longer disabled; packaging/settings tiles still disabled
- [ ] Page has loading, error+retry, empty, and pagination states
- [ ] No PostgREST embedded join on profiles (two-step name resolution)
- [ ] Only in-scope files committed; `dist/index.html` included

## STOP conditions

- Excerpts drifted beyond plans 001/003's expected changes.
- `user_activity_logs` types differ from the shape above.
- You find yourself needing a migration or RPC change.
- Verification fails twice.

## Maintenance notes

- Follow-up candidates (explicitly deferred): log inventory-transaction
  deletes and voucher submits/reverts; add date-range filter; retention
  policy. The log's trust model note: entries are client-inserted, so treat
  as operational history, not forensic evidence.
- If actions are added to `useUsers.ts`, extend the filter label map.
- Reviewer: check the `.in('id', ids)` chunk isn't called with an empty array
  (guard: skip the profiles query when no user_ids).
