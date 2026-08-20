# Plan 003: Populate sidebar navigation and surface the orphaned reorder page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Your reviewer maintains `plans/README.md` — do
> not edit it.
>
> **Drift check (run first)**: `git diff --stat f3395fe..HEAD -- src/components/layout/Sidebar.tsx src/components/dashboard/ src/pages/InventoryPage.tsx`
> On any mismatch with the excerpts below, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx/ux (UX-05, UX-04)
- **Planned at**: commit `f3395fe`, 2026-07-20

## Why this matters

The hamburger menu opens a sidebar whose `<nav>` renders only the placeholder
string «فهرست دسترسی‌ها» — no links at all. Every cross-module move requires
backing out to the dashboard first, and a menu that offers nothing but logout
reads as broken. Separately, `ReorderPointPage` is routed for all three roles
but **no link anywhere in the app leads to it** — a management surface
reachable only by typing the URL. One shared, role-aware navigation manifest
fixes both and prevents the sidebar and dashboards from drifting apart.

## Current state

- `src/components/layout/Sidebar.tsx:178-185` (the placeholder):

```tsx
        {/* Nav area */}
        <div className="flex-1 p-4 overflow-y-auto">
          <nav className="space-y-1">
            <div className="text-center text-sm mt-4 text-[var(--c-muted-fg)]">
              فهرست دسترسی‌ها
            </div>
          </nav>
        </div>
```

- Sidebar already: reads `profile` from `useAuthStore` (line 19), has
  `closeSidebar()` (line 30), uses `useNavigate()` (line 27), imports `Button`,
  `Badge`, `ConfirmDialog`. It is an overlay panel (`z-50`, translate-x).
- Dashboard tiles define the de-facto nav per role:
  - `src/components/dashboard/AdminDashboard.tsx:27-102` — consumption,
    purchase, reports, formulas, inventory, users, farms, inputs, suppliers
    (+ 3 `disabled` tiles: packaging, logs, settings).
  - `SupervisorDashboard.tsx:21-50` and `OperatorDashboard.tsx:27-56` —
    consumption, purchase, reports, formulas, inventory.
  - All use `Tile` from `@/components/ui/Tile` with lucide icons
    (`ClipboardList`, `ShoppingCart`, `FileText`, `FlaskConical`, `Package`,
    `Users`, `Warehouse`, `Wheat`, `Truck`, `Activity`, `Settings`).
- Routes (`src/router/routes.tsx`): per role base `/admin|/supervisor|/operator`
  the paths are `consumption`, `purchase`, `reports`, `formulas`, `inventory`,
  `reorder`, plus admin-only `users`, `farms`, `inputs`, `suppliers`.
  **`reorder` exists for all three roles (lines 107-109, 170-172, 225-227) but
  no Tile or link references it anywhere** (repo grep confirms).
- `src/pages/InventoryPage.tsx:350-363` — the amber «نقطه سفارش» stat card (a
  `Card` with `AlertTriangle`, count `stats.lowStock`) is display-only today.
- Icon for reorder: use `AlertTriangle` (already the app's low-stock signifier).
- Conventions: Persian labels; active-route styling can key on
  `useLocation().pathname`.

## Commands you will need

Run inside the execution worktree (deps preinstalled).

| Purpose   | Command           | Expected on success |
|-----------|-------------------|---------------------|
| Typecheck | `npx tsc --noEmit`| exit 0              |
| Lint      | `npm run lint`    | exit 0; no NEW errors beyond the 7 pre-existing at f3395fe |
| Build     | `npm run build`   | exit 0              |

## Scope

**In scope**:
- `src/navigation/manifest.ts` (create)
- `src/components/layout/Sidebar.tsx`
- `src/components/dashboard/AdminDashboard.tsx`
- `src/components/dashboard/SupervisorDashboard.tsx`
- `src/components/dashboard/OperatorDashboard.tsx`
- `src/pages/InventoryPage.tsx` (make the reorder stat card a link)
- `dist/index.html` (rebuild artifact)

**Out of scope**:
- `src/router/routes.tsx` — routes are already correct.
- `src/components/ui/Tile.tsx` — consume as-is.
- The 3 disabled admin tiles' destinations (packaging/logs/settings pages) —
  plan 006 handles the logs page; leave tiles as they are EXCEPT their
  `disabled` state must be preserved here.
- `Header.tsx`.

## Git workflow

- Shared advisor branch; one commit, e.g.
  `feat(nav): role-aware sidebar navigation + reorder page discoverability`.
- Rebuild `dist/index.html` same commit. Do NOT push.

## Steps

### Step 1: Create `src/navigation/manifest.ts`

A single role-aware manifest both surfaces consume:

```ts
import type { LucideIcon } from 'lucide-react';
import {
  ClipboardList, ShoppingCart, FileText, FlaskConical, Package,
  Users, Warehouse, Wheat, Truck, AlertTriangle,
} from 'lucide-react';

export type Role = 'admin' | 'supervisor' | 'operator';

export interface NavItem {
  /** Path relative to the role base, e.g. 'consumption'. */
  path: string;
  label: string;
  icon: LucideIcon;
  /** Tile color token (matches existing Tile usage). */
  color: 'blue' | 'green' | 'orange' | 'purple' | 'teal' | 'red' | 'indigo' | 'amber' | 'cyan' | 'slate' | 'rose';
  /** Roles that see this item. */
  roles: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  { path: 'consumption', label: 'حواله‌های مصرف',  icon: ClipboardList, color: 'blue',   roles: ['admin', 'supervisor', 'operator'] },
  { path: 'purchase',    label: 'خرید و انتقال',   icon: ShoppingCart,  color: 'indigo', roles: ['admin', 'supervisor', 'operator'] },
  { path: 'reports',     label: 'گزارشات',         icon: FileText,      color: 'cyan',   roles: ['admin', 'supervisor', 'operator'] },
  { path: 'formulas',    label: 'مدیریت فرمول‌ها', icon: FlaskConical,  color: 'purple', roles: ['admin', 'supervisor', 'operator'] },
  { path: 'inventory',   label: 'موجودی انبار',    icon: Package,       color: 'teal',   roles: ['admin', 'supervisor', 'operator'] },
  { path: 'reorder',     label: 'نقطه سفارش',      icon: AlertTriangle, color: 'amber',  roles: ['admin', 'supervisor', 'operator'] },
  { path: 'users',       label: 'مدیریت کاربران',  icon: Users,         color: 'rose',   roles: ['admin'] },
  { path: 'farms',       label: 'مدیریت فارم‌ها',  icon: Warehouse,     color: 'indigo', roles: ['admin'] },
  { path: 'inputs',      label: 'تعریف نهاده‌ها',  icon: Wheat,         color: 'amber',  roles: ['admin'] },
  { path: 'suppliers',   label: 'تامین‌کنندگان',   icon: Truck,         color: 'blue',   roles: ['admin'] },
];

export function navItemsForRole(role: string | null | undefined): NavItem[] {
  if (role !== 'admin' && role !== 'supervisor' && role !== 'operator') return [];
  return NAV_ITEMS.filter((i) => i.roles.includes(role));
}

export function roleBase(role: Role): string {
  return `/${role}`;
}
```

Keep the per-role labels the dashboards use today where they differ
(Supervisor: «مشاهده حواله‌ها», «مشاهده خریدها», «فرمول‌ها و آنالیز»; Operator:
«ثبت مصرف روزانه», «ثبت خرید/انتقال», «فرمول‌ها», «انبارداری») — add an
optional `labelByRole?: Partial<Record<Role, string>>` field to `NavItem`,
fill it from the current dashboard labels, and resolve
`labelByRole?.[role] ?? label` in consumers. Existing visible labels must not
change.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Render the manifest in `Sidebar.tsx`

Replace the placeholder nav block (lines 178-185) with a list of links:

- `const items = navItemsForRole(profile?.role);`
- For each item render a row button/Link: icon + resolved label, styles
  matching the app (rounded-[10px], `hover:bg-[var(--c-muted)]`, h-11).
- Active route: `useLocation()`; active when
  `location.pathname.startsWith(`${roleBase(role)}/${item.path}`)`; style with
  `bg-[var(--c-primary-light)] text-[var(--c-primary)] font-semibold` (or the
  nearest existing token pattern).
- On click: `navigate(...)` then `closeSidebar()`.
- Add a "داشبورد" entry at the top linking to `roleBase(role)` (icon `Home`
  from lucide) — active only on exact match.
- Keep the empty-role case rendering nothing (no crash when profile is null).

**Verify**: `npx tsc --noEmit` → exit 0; `grep -n "فهرست دسترسی‌ها" src/components/layout/Sidebar.tsx` → 0 matches.

### Step 3: Drive the three dashboards from the manifest

In each dashboard, replace the hardcoded enabled `Tile` list with a map over
`navItemsForRole(role)` (role literal per file), rendering
`<Tile key={item.path} icon={item.icon} label={resolvedLabel} color={item.color} to={`${base}/${item.path}`} />`.

- AdminDashboard: keep header text and the 3 `disabled` tiles (packaging,
  logs, settings) EXACTLY as they are, appended after the mapped list.
- Supervisor/Operator dashboards keep their header blocks unchanged.
- Net effect on visible tiles: identical set as today PLUS one new
  «نقطه سفارش» tile per role.

**Verify**: `npx tsc --noEmit` → exit 0; `grep -c "to=\"/admin/" src/components/dashboard/AdminDashboard.tsx` → 0 (all destinations now built from the manifest; the 3 disabled tiles use `to` but stay literal — adjust the grep expectation accordingly and report actual).

### Step 4: Link the reorder stat card in `InventoryPage.tsx`

Wrap the amber «نقطه سفارش» stat card (lines 350-363) in a router `Link` to
`${basePath}/reorder` where `basePath` mirrors the role logic already used at
line 718 (`profile?.role === 'admin' ? '/admin' : ...`). Add
`hover:shadow-md transition-shadow cursor-pointer` to the Card. Import `Link`
if not present.

**Verify**: `grep -n "reorder" src/pages/InventoryPage.tsx` → at least one
`/reorder` link.

### Step 5: Build and commit

`npm run build` → exit 0; commit all in-scope files + `dist/index.html`.

## Test plan

No SPA test runner. Gates: tsc, lint, build, greps. Report the resulting
sidebar item count per role (admin 11 incl. dashboard, supervisor/operator 7)
and confirm labels match the pre-change dashboards.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0; `npm run lint` no new errors; `npm run build` exits 0
- [ ] Sidebar renders manifest links; placeholder string gone
- [ ] All three dashboards map the manifest; visible labels unchanged; each
      role gains exactly one new tile (نقطه سفارش)
- [ ] Admin's 3 disabled tiles still render disabled
- [ ] InventoryPage reorder stat card links to the role's `/reorder`
- [ ] Only in-scope files committed; `dist/index.html` included

## STOP conditions

- Excerpts drifted.
- `Tile` component's props don't accept what the manifest provides.
- Preserving per-role labels via the manifest would force changing any visible
  label — report instead of changing copy.
- Verification fails twice.

## Maintenance notes

- New pages should be added to `NAV_ITEMS` once, not to four files.
- Plan 006 (activity-log page) will flip the admin logs tile from disabled to
  live — it depends on this manifest existing only for the sidebar, not tiles;
  no ordering hazard.
- Reviewer: diff the dashboards' rendered tile sets against the pre-change
  lists above.
