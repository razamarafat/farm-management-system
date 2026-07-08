# مروارید فارم (Morvarid-Farm) — Smart Feed & Packaging Inventory System

> **پایش هوشمند دان و اقلام بسته‌بندی**
> Persian RTL farm management SPA — React 19, TypeScript, Zustand, Supabase. Built for
> livestock-feed mills tracking per-hall consumption, formula recipes, supplier-level
> purchases and inventory with reorder alerts.

[![RTL](https://img.shields.io/badge/RTL-fa--IR-blue)](public/manifest.json)
[![React](https://img.shields.io/badge/React-19.2.3-61DAFB?logo=react)](package.json)
[![TS](https://img.shields.io/badge/TypeScript-5.9.3-3178C6?logo=typescript)](tsconfig.json)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite)](vite.config.ts)
[![Supabase](https://img.shields.io/badge/Supabase-Backed-3FCF8E?logo=supabase)](#architecture-overview)
[![Zustand](https://img.shields.io/badge/Zustand-5-FF6B6B)](src/store)
[![Tailwind4](https://img.shields.io/badge/Tailwind-4-38BDF8?logo=tailwindcss)](src/index.css)

---

## 📚 Table of Contents

1. [Highlights](#-highlights)
2. [Tech Stack](#-tech-stack)
3. [Architecture Overview](#-architecture-overview)
4. [Project Structure](#-project-structure)
5. [Database Schema](#-database-schema)
6. [Authentication & Roles](#-authentication--roles)
7. [Routing](#-routing)
8. [Core Workflows](#-core-workflows)
9. [Design System](#-design-system)
10. [State Management](#-state-management)
11. [Performance Optimisation](#-performance-optimisation)
12. [Environment Variables](#-environment-variables)
13. [Database Setup](#-database-setup)
14. [Quick Start](#-quick-start)
15. [Build & Deploy](#-build--deploy)
16. [Scripts](#-scripts)
17. [Troubleshooting](#-troubleshooting)
18. [Security Notes](#-security-notes)
19. [Contributing](#-contributing)
20. [License](#-license)
21. [Acknowledgements](#-acknowledgements)

---

## 🌟 Highlights

- 100% Persian UI — RTL layout, Jalali dates, Persian numerals everywhere.
- Single-file build via `vite-plugin-singlefile` — the entire SPA compiles into one
  HTML asset suitable for offline / static hosting.
- PWA-ready (`vite-plugin-pwa` + custom manifest).
- Three-tier RBAC (`admin` / `supervisor` / `operator`) — route guards + per-page gating.
- Per-hall daily voucher entry with formula-driven auto-calculation and dirty-line
  autosave.
- Append-only inventory ledger (`inventory_transactions`) with derived balance queries
  and Excel-friendly Persian export.
- BluBank-inspired design system with class-based light/dark theme driven by CSS
  variables — no JS theme reconciliation, painted pre-FOIT in `index.html`.
- Supabase secrets live in env vars only; no secrets are committed to source. (See
  [Security Notes](#-security-notes) for the honest trade-off of shipping the
  service-role key in the client bundle.)
- June 2025 comprehensive React-rendering optimisation pass (see
  [Performance Optimisation](#-performance-optimisation)).

---

## 🧰 Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript 5.9 | `strict`, `noUnusedLocals`, `noUnusedParameters` |
| UI Framework | React 19.2 | concurrent features, automatic batching |
| Routing | react-router-dom 7 | hash router (offline-friendly), per-route lazy chunks |
| Build Tool | Vite 7 | fast dev, single-HTML output |
| Styling | Tailwind CSS 4 (`@tailwindcss/vite`) | class-based dark mode via `@custom-variant` |
| State | Zustand 5 | `persist` middleware + `useShallow` selectors |
| Forms | react-hook-form + zod (via `@hookform/resolvers`) | validated forms |
| Animations | framer-motion 12 | tile hovers, page transitions, modal scale-ins |
| Icons | lucide-react 0.564 | single icon tree-shake bundle |
| Date utilities | date-fns-jalali 4 + custom helpers | Jalaali calendar support |
| Notifications | sonner 2 | Persian-aware toast stack |
| Validation | zod 4 | shared schemas with React Hook Form |
| Util | clsx + tailwind-merge | friendly CSS class composition |
| Excel export | xlsx 0.18 | Persian-friendly CSV/XLSX |
| Backend | Supabase (Postgres + Auth + RLS) | secrets via env vars only — see Security Notes |

---

## 🏗️ Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                          Browser                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │        React 19 SPA (single HTML asset)                  │  │
│  │                                                            │  │
│  │   ┌─────────┐   ┌──────────┐   ┌────────────────────┐      │  │
│  │   │ Router  │ → │  Pages   │ → │  Page components   │      │  │
│  │   └─────────┘   └──────────┘   │  + Forms + Cards   │      │  │
│  │        │            │          └────────────────────┘      │  │
│  │        ▼            ▼                                       │  │
│  │   ┌─────────┐   ┌──────────┐                               │  │
│  │   │ Zustand │   │  Hooks   │ ──┐                            │  │
│  │   │ stores  │   │  layer   │   │                            │  │
│  │   └─────────┘   └──────────┘   │                            │  │
│  │        │            │          │                            │  │
│  │        └───► shared types ◄────┘                            │  │
│  └──────────────────────│────────────────────────────────────────┘  │
└────────────────────────│──────────────────────────────────────────┘
                          ▼
        ┌─────────────────────────────────────────────┐
        │  Supabase (Postgres + Auth + RLS)            │
        │  • anon key      — browser reads, RLS-aware  │
        │  • service role  — admin UI flows            │
        │  • Postgres RPCs — atomic voucher ops        │
        │  • RLS           — row-level read protection │
        └─────────────────────────────────────────────┘
```

Two Supabase clients coexist:

| Client | File | Purpose |
|---|---|---|
| `supabase` (anon) | `src/lib/supabase.ts` | All end-user reads/writes scoped by RLS + JWT |
| `supabaseAdmin` (service-role) | `src/lib/supabase-admin.ts` | Admin UI flows that bypass RLS for trusted operations |

> **Note** — Historically the `seedAdmin` flow ran client-side using the service-role key.
> It has been relocated to a server-side SQL migration
> (`scripts/migrations/002_seed_admin_user.sql`) to keep the key confined to Supabase.

---

## 🗂️ Project Structure

```
morvarid-farm/
├── README.md                          ← this file
├── package.json
├── vite.config.ts                     # base: './', singlefile plugin, alias @ → src
├── tsconfig.json                      # strict TS, path alias @/*
├── postcss.config.cjs
├── index.html                         # PWA bootstrap + theme pre-paint
├── public/
│   └── manifest.json                  # PWA manifest (lang fa, dir rtl)
├── scripts/
│   ├── check-conflicts.ts             # CI: reject unresolved merge markers
│   ├── check-env.mjs                  # CI: verify required VITE_* env presence
│   └── migrations/
│       ├── 001_create_inputs_table.sql
│       └── 002_seed_admin_user.sql
└── src/
    ├── main.tsx                       # createRoot + StrictMode
    ├── App.tsx                        # RouterProvider + auth bootstrap
    ├── index.css                      # Tailwind + theme tokens + keyframes
    │
    ├── components/
    │   ├── auth/         LoginForm.tsx
    │   ├── consumption/  DailySheetTable.tsx (memoised)
    │   ├── dashboard/    Admin / Supervisor / Operator dashboards
    │   ├── farms/        FarmList + FarmForm / Delete / Assign dialogs
    │   │                 + Farm {Halls, Staff, Items} Panel (memoised)
    │   ├── layout/       AppLayout, AuthLayout, Header, Sidebar,
    │   │                 ProtectedRoute, ThemeToggle, DateTimeDisplay
    │   ├── shared/       ErrorBoundary, AccessDenied, UnderDevelopment
    │   ├── ui/           17 reusable primitives (Button, Card, …)
    │   └── users/        UserList, UserCard, UserForm, dialogs
    │
    ├── hooks/            useFarms, useUsers, useInputs,
    │                     useInventory*, useDailySheet, useFormulas,
    │                     useSuppliers, useModuleReset, useTheme,
    │                     useMediaQuery, useOfflineSync
    │
    ├── lib/
    │   ├── supabase.ts          # anon client
    │   └── supabase-admin.ts    # service-role client
    │
    ├── pages/            # Route-level components (lazy-loaded)
    ├── router/           # Hash router + per-route lazy import
    ├── store/            # Zustand stores: authStore, uiStore
    ├── types/            # Strict TS types (database.types.ts sourced
    │                     # from Supabase, application types derived)
    └── utils/            # cn, helpers, jalali, persianNumbers,
                          # validators, imageCompression, excelExports
```

---

## 🗄️ Database Schema

All tables live in the `public` schema of your Supabase project. Enums and RPCs are
documented in [`src/types/database.types.ts`](src/types/database.types.ts).

### `farms` — physical farms / facilities

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name`, `code` | TEXT | unique-friendly name + short code |
| `address`, `phone` | TEXT NULL | |
| `is_active` | BOOL | soft-disable without breaking history |
| `created_at`, `updated_at` | TIMESTAMPTZ | auto-managed |

### `profiles` — application users (joined to `auth.users`)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK = `auth.users.id` | |
| `username` | TEXT | unique-ish |
| `role` | enum: `admin` / `supervisor` / `operator` | RBAC core |
| `farm_id` | UUID NULL FK → farms | only non-admin users |
| `first_name`, `last_name`, `phone`, `avatar_url` | mixed | |
| `is_active`, `notes`, `last_login_at`, `created_by` | mixed | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

### `inputs` — global ingredient catalogue

| Column | Type |
|---|---|
| `id`, `name` (unique), `category` (`feed`/`packaging`), `default_unit`, `description`, `is_active` | |
| `created_at`, `updated_at`, `created_by` | |

### `farm_items` — per-farm assigned items

| Column | Type |
|---|---|
| `id`, `farm_id`, `category`, `name`, `unit`, `priority`, `reorder_point`, `is_active` | |

### `farm_halls` — per-farm hall / pen registry

`id`, `farm_id`, `hall_number`, `name`, `is_active`

### `farm_feed_formulas` — recipe headers

| Column | Type |
|---|---|
| `id`, `farm_id`, `formula_no` (per-farm, monotonic), `name`, `mixer_weight` (kg), `is_active` | |
| `created_at`, `updated_at` | |

### `farm_formula_items` — recipe lines (child of `farm_feed_formulas`)

| Column | Type |
|---|---|
| `id`, `formula_id` FK, `item_id` FK → `inputs`, `qty_per_mixer` (kg per mixer batch) | |
| `created_at` | |

### `daily_vouchers` + `daily_voucher_lines`

`daily_vouchers` — one row per (farm, date, category) with status
`draft` / `submitted` / `locked` / `reverted`, plus audit columns (`created_by`,
`submitted_by`, `submitted_at`, `locked_at`, `reverted_at`, `reverted_by`).

`daily_voucher_lines` — one row per item:
`consumed_qty`, `waste_qty`, `notes`, `formula_no`, `mixer_count`, `hall_numbers`,
and a per-hall breakdown (`hall_consumed` as JSON map).

### `inventory_transactions` — append-only ledger

`txn_type` ∈ `initial` / `purchase` / `consumption` / `waste` / `transfer_in` /
`transfer_out` / `adjustment`. Each row carries `qty_in`, `qty_out`,
`unit_price`, `total_price`, `reference_no`, `source_type`/`source_id`,
`supplier_id`, `attachment_url`. Balance is **derived** by a running sum, never
mutated directly.

### `suppliers` — supplier directory

`id`, `name`, `is_active`, audit columns.

### `user_activity_logs` — admin action audit log

`user_id`, `action`, `resource_type`, `resource_id`, optional `details`.

### Stored Functions (RPC)

| Function | Args | Purpose |
|---|---|---|
| `get_daily_sheet(p_farm, p_date, p_category)` | UUID, ISO date, enum | Returns full voucher bundle (lines, formulas, halls, status) |
| `save_daily_sheet(p_voucher_id, p_lines)` | UUID, JSON | Upsert dirty lines atomically |
| `submit_daily_sheet(p_voucher_id)` | UUID | Validates + writes inventory_transactions + flips voucher to `submitted` |
| `revert_daily_sheet(p_voucher_id)` | UUID | Reverses a submitted voucher |
| `get_item_balance(p_farm, p_item)` | UUID, UUID | Fast sanity-balance query |
| `is_admin()` / `get_user_role()` / `get_user_farm_id()` | – | RBAC helpers |
| `has_farm_access(check_farm_id)` | UUID | Per-row data-access predicate |

---

## 🔐 Authentication & Roles

Authentication is delegated entirely to **Supabase Auth**. The application never
stores raw passwords.

```ts
// src/store/authStore.ts  (excerpt)
//  user             : User | null          (Supabase auth user)
//  profile          : Profile | null       (joined from public.profiles)
//  isLoading        : boolean
//  isAuthenticated  : boolean
//  sessionStartedAt : number | null        (ms epoch)
//
// On boot:
//   1. supabase.auth.getSession()           → set user
//   2. fetch public.profiles by id          → set profile
//   3. setSessionStart(role)                → start 1-hour session timer
//      (admins bypass the expiry)
//
// A 60-second interval re-checks checkSessionExpiry() and force-logs-out
// non-admin users after 1 h from session start.
```

The auth slice is **persisted to `localStorage`** under the key
`auth-storage` via Zustand's `persist` middleware, but `last_login_at` is
refreshed server-side at each successful login.

### Role tier

| Role | Permissions |
|---|---|
| **`admin`** | Full CRUD on farms, users, inputs, and inventory. Cross-farm picker everywhere. |
| **`supervisor`** | Read-only on the farm they are assigned to. Cannot submit vouchers or change inventory. |
| **`operator`** | Create + draft + submit daily vouchers on their own farm. Cannot edit users or farms. |

Routes are protected by `ProtectedRoute(allowedRoles=[...])`
(see [`src/components/layout/ProtectedRoute.tsx`](src/components/layout/ProtectedRoute.tsx)).
Per-action audit of admin operations writes rows into `user_activity_logs`.

---

## 🌐 Routing

`createHashRouter` keeps the SPA usable when served from any static path, including
browser-local file systems. `React.lazy` + `Suspense` is used for every page
except `LoginPage` and `NotFoundPage`.

```text
/login                                              ← login (no auth)
/admin/*                                            ← admin only
  /                       AdminPage (overview)
  /users                  AdminUsersPage
  /farms                  AdminFarmsPage
  /consumption             ConsumptionPage
    /feed                DailySheetPage  category=feed
    /packaging           DailySheetPage  category=packaging
  /formulas               FormulaManagementPage
  /inventory              InventoryPage
    /:itemId/history     InventoryItemHistoryPage
  /purchase               PurchasesPage
  /reports                ReportsPage
  /reorder                ReorderPointPage
  /suppliers              SuppliersPage
  /inputs                 InputsPage
  /*                      UnderDevelopment

/supervisor/*        ← supervisor only (subset of admin routes)
/operator/*          ← operator only   (subset of admin routes)
*                    ← NotFoundPage
```

The exact table lives in [`src/router/routes.tsx`](src/router/routes.tsx).

---

## 🌾 Core Workflows

### 🏢 Farms (`/admin/farms`)

`FarmList.tsx` is the hub. Each farm card has an inline toolbar (active toggle,
edit, delete, assign items, expand halls / staff panels). Expansion is governed by
a single piece of local state: `expanded: { farmId, section } | null`.

- **`FarmHallsPanel`** — grid of halls, inline hall add, bulk add (1..N),
  enable/disable, delete.
- **`FarmStaffPanel`** — list of operators / supervisors attached to this farm
  (read-only).
- **`FarmItemsPanel`** — assign global `inputs` to this farm. Supports the
  default ingredient shortlist (see `DEFAULT_FARM_INGREDIENTS` in
  `src/utils/constants.ts`).

`FarmForm.tsx` & `FarmDeleteDialog.tsx` handle create / edit / soft-delete.

### 🌱 Inputs Catalogue (`/admin/inputs`)

Admin-only CRUD over the global ingredient list. Items become available in
`FarmItemsPanel` once defined.

### 🏭 Suppliers (`/admin/suppliers`)

Lightweight CRUD with Excel export (`utils/excelExportPro.ts`).

### 📝 Daily Vouchers (`/admin/consumption/...`)

`DailySheetPage.tsx` — **the heartland feature**:

1. **Header / date picker** — Optional Jalali date navigation; admin can switch farms.
2. **Formula + hall selectors** (feed category only) — pick a
   `farm_feed_formulas` row, toggle which halls receive today's mix.
3. **`autoCalculate`** — applies the formula across selected halls, multiplies
   by `mixer_count` and writes the per-item `consumed_qty` into a local draft state.
4. **`DailySheetTable.tsx`** — memoised table; `NumericCell` and `StatusIcon`
   subcomponents also `React.memo`'d so editing one cell does NOT force the
   whole table to re-render.
5. **Save status telemetry** — `idle | saving | saved | error`. Saves are
   debounced (800 ms); `dirtyLinesRef` batches write-ups into a single
   `supabaseAdmin.from('daily_voucher_lines').upsert(...)` call.
6. **Submit** — validates (no empty, no missing initial stock, no negative
   balances), atomically writes `inventory_transactions` (consumption + waste)
   and bumps `daily_vouchers.status` to `submitted`. Non-admins can still edit
   within a 24 h grace window; admins override indefinitely.
7. **Revert** — admin-only: deletes the originating `inventory_transactions`
   and returns the voucher to draft.

### 🧪 Formulas (`/admin/formulas`)

`FormulaManagementPage.tsx` (via `useFormulas`). Admin can
create / edit / duplicate / toggle formulas per farm. Each formula has
`farm_formula_items` rows keyed by `qty_per_mixer`.

### 📦 Inventory (`/admin/inventory`)

`InventoryPage.tsx` uses three supabase queries:

- `useStockBalances(farmId, category)` — derives current balance from the
  append-only `inventory_transactions` ledger.
- `useInventoryTransactions(farmId, filters)` — paginated history with date /
  item / type filters, grouped visually per item.
- `useItemInitialCheck(farmId)` — tracks which items already have a starting
  stock to prevent re-entry.

Tabs: **موجودی انبار** · **تاریخچه کالا** · **موجودی اولیه**. Inline dialog for
initial / purchase / transfer in / transfer out / adjustment. Adjustments accept
± deltas and **require** user-supplied notes for audit.

### 📊 Reports (`/admin/reports`)

Four report flavours over a chosen Jalali date range (`today` / `yesterday` /
`this week` / `this month` / `last month` / `this year` / `last year` / `custom`):

1. **مصرف** — joins `daily_vouchers` to `daily_voucher_lines`.
2. **خرید و انتقال** — purchases / transfers (with optional supplier filter).
3. **موجودی انبار** — running balance snapshot.
4. **گزارش خلاصه** — aggregated by hall and by item.

`SearchableSelect.tsx` (custom component) is used for item / supplier filters for
large lists. Excel export to Persian-friendly `.xlsx` is built-in.

### ⚠️ Reorder Point (`/admin/reorder`)

`ReorderPointPage.tsx` highlights items below their `reorder_point` with
quick-jump to `inventory`.

### 👥 Users (`/admin/users`)

`UserList.tsx` (desktop table ↔ mobile card layout via
`useMediaQuery('(min-width: 768px)')`).
`UserForm.tsx`, `UserDeleteDialog`, `UserPasswordReset` (admin-resettable
auto-generated password with on-screen reveal + clipboard copy). Per-role badge
colour (`ROLE_COLORS`) threads through every user list.

---

## 🎨 Design System

### Theme tokens — Light

| Token | Hex | Use |
|---|---|---|
| `--c-primary` | `#2563EB` | Buttons, links, primary actions (BluBank blue) |
| `--c-secondary` | `#1E3A8A` | Sidebar / Navbar accents |
| `--c-accent` | `#E11D48` | Emphasised call-outs |
| `--c-success` | `#059669` | Positive feedback |
| `--c-warning` | `#D97706` | Reorder-point alerts |
| `--c-destructive` | `#DC2626` | Delete + form errors |
| `--c-bg` | `#F4F7FC` | App background |
| `--c-card` | `#FFFFFF` | Card surface |

Theme values are defined as CSS variables in [`src/index.css`](src/index.css) and
mapped 1-to-1 into Tailwind v4's `@theme` system, so any Tailwind class can read
them (`bg-primary`, `text-muted-foreground`, etc.).

### Tile palette

`|blue|green|orange|purple|teal|red|indigo|amber|cyan|slate|rose|` — each maps to a
background hue, border hue and foreground colour (see the `.tile-*` selectors in
`src/index.css`).

### Light / Dark mode

Class-based (`html.dark`). The current theme is read from `useUIStore`, persisted
across reloads, and applied **pre-paint** in
[`index.html`](index.html) via an inline script that reads from
`localStorage` — avoiding the white flash on boot.

### RTL & Typography

`html[dir="rtl"][lang="fa"]` plus the **Vazirmatn** web font. All Persian numerals
flow through `toPersianDigits` / `toPersianNumbers`
(`src/utils/persianNumbers.ts`) so dates, quantities, and currency end up
visually correct.

### Accessibility

- Each input has a Persian `label`.
- Modals trap focus loosely via `createPortal` + a `keydown` `Escape` handler.
- Focus rings via Tailwind `focus-visible:` utilities.
- `prefers-reduced-motion` is respected (CSS resets all animations / transitions
  to 0.01 ms).

---

## 🧠 State Management

Two Zustand stores:

| Store | Shape | Persistence |
|---|---|---|
| `useAuthStore` (`src/store/authStore.ts`) | `{user, profile, isLoading, isAuthenticated, sessionStartedAt, setUser, setProfile, setSessionStart, logout, initialize, checkSessionExpiry}` | `localStorage` key `auth-storage` (user, profile, isAuthenticated, sessionStartedAt) |
| `useUIStore` (`src/store/uiStore.ts`) | `{sidebarOpen, theme, toggleSidebar, closeSidebar, openSidebar, setTheme, moduleResetFn, registerModuleReset, clearModuleReset}` | `localStorage` key `ui-storage` (theme only) |

All data fetching lives in domain hooks
(`useFarms`, `useUsers`, `useInventory*`, `useDailySheet`, `useFormulas`,
`useSuppliers`, `useInputs`, `useOfflineSync`). Each returns a composable
surface: `data + loading + error + refetch + actions`.

---

## ⚡ Performance Optimisation

A targeted React rendering pass was applied in **June 2025**. The goals were
measurable reductions in unnecessary re-renders without any visual or behavioural
change. `npx tsc --noEmit` returns 0 errors before and after.

### What was optimised

1. **Zustand over-subscription** — 7 components & hooks. Replaced
   `useAuthStore()` (no selector, full state destructured) with `useShallow`
   selectors. Components now subscribe to ONLY the fields they actually use, so
   unrelated store updates no longer trigger re-renders. Sites: `App.tsx`,
   `Sidebar`, `Header`, `ProtectedRoute`, `LoginForm`, `useTheme`,
   `useModuleReset`.
2. **`React.memo` on heavy leaves** — `Tile`, `FarmHallsPanel`,
   `FarmStaffPanel`, `FarmItemsPanel`. Inner function renamed to `*Inner`
   with explicit `displayName` so React DevTools shows both the memo wrapper
   and the inner factory distinctly.
3. **Stable `framer-motion` variant props** in `Tile.tsx` — `whileHover` /
   `whileTap` declared at module scope (`as const`). Before this fix,
   framer-motion constructed new variant objects on every parent render,
   causing subtle animation re-attaches.
4. **`useMemo` on `selectedHalls`** in `DailySheetPage.tsx` — passed to the
   already-memo'd `DailySheetTable`. Stable identity across renders when only
   `hallConfigs` changes — protects table short-circuit.
5. **`DateTimeDisplay` cleanup** — removed redundant `window.innerWidth`
   measurement in favour of the existing `useMediaQuery` result.
6. **Per-route code splitting** — every page except `LoginPage` and
   `NotFoundPage` is loaded via `React.lazy` + `Suspense`. Smaller initial
   bundle, faster TTI.

### Profile results (analytical, post-`farm`-identity fix)

The `React.memo` short-circuit on `Tile` and the three farm panels compares each
panel's `farm` prop reference. `FarmList.tsx` currently builds that prop via
`farms.map(f => ({ ...f }))`, which allocates a fresh object every render — so
the memo skip is defeated in `FarmList` mounts **today**. Once that spread is
either removed or wrapped in `useMemo([farms])`, the expected render behaviour
becomes:

| Action (3 farms, panels toggling) | Expected after fix |
|---|---|
| Toggle row-2 halls open | 3× Card · 1× HallsPanel mount |
| Typing in search filter (debounced 300 ms) | 3× Card · sibling panels **skipped** |
| Toggle row-2 halls close (rows 1+2 expanded) | 3× Card · 1× HallsPanel unmount · sibling panel **skipped** |

Until the `farm`-prop identity is stabilised at the call site, panels still
re-render on every `FarmList` render.

---

## 🌐 Environment Variables

All variables must be prefixed with `VITE_` (see `envPrefix: 'VITE_'` in
[`vite.config.ts`](vite.config.ts)). Create a `.env` (or `.env.local`) at the
project root:

| Name | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | `https://YOUR-PROJECT.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | ✅ | anon / publishable key |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` | ⚠️ required for admin flows | service-role key — bypasses RLS. **Will be bundled into the client JavaScript** (it is not a server-side secret). Treat it as a *trust-for-the-UI-flows* key, not an authentication secret. Rotate if exposed. |
| `VITE_APP_VERSION` | optional | shown in the about pane; defaults to `1.0.2` |

> **Never** commit real keys. Add `.env*` to `.gitignore`.

A starter template lives at [`.env.example`](.env.example). A pre-build guard
[`scripts/check-env.mjs`](scripts/check-env.mjs) is wired as
`npm run check:env` and verifies the same variable names against your local
`.env*` files.

---

## 🗄️ Database Setup

Run the SQL files under [`scripts/migrations`](scripts/migrations/) in your
Supabase SQL editor **in order**:

1. **`001_create_inputs_table.sql`** — creates the global `inputs` catalogue
   (unique by name + RLS — only admins can write).
2. **`002_seed_admin_user.sql`** — idempotent admin bootstrap. Creates
   `admin@morvarid.local` with password **`Admin@123`** (rotate immediately).

A pre-commit-style guard is also available: `npm run check:conflicts` (via
[`scripts/check-conflicts.ts`](scripts/check-conflicts.ts)) rejects unresolved
merge markers before builds.

---

## 🚀 Quick Start

```bash
git clone https://github.com/razamarafat/farm-management-system.git
cd farm-management-system

# 1) Install
npm install

# 2) Configure env (.env or .env.local)
cat > .env <<EOF
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJI...
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...
EOF

# 3) Apply DB migrations in your Supabase SQL editor
#    - scripts/migrations/001_create_inputs_table.sql
#    - scripts/migrations/002_seed_admin_user.sql

# 4) Dev server (default port 5173)
npm run dev

# 5) Production build → single-file HTML in dist/
npm run build
```

The dev server is plain Vite — fast HMR, no full reload on state changes. Port
defaults to `5173`.

---

## 📦 Build & Deploy

- `npm run build` emits a **single-file HTML** via `vite-plugin-singlefile`.
  CSS is inlined, JS is bundled into the same HTML asset
  (`assetsInlineLimit: 100000000` ≈ inlining every feasible asset).
- Output is **base-relative** (`base: './'`) — the bundle can be served from
  any static folder (Nginx `/usr/share/nginx/html`, S3+CloudFront, Vercel
  static, GitHub Pages).
- `vite-plugin-pwa` registers a service worker at build time for offline
  launches.
- The **hash router** keeps deep links working without server-side rewrites —
  every URL is `https://host/#/path`.

### Bundle footprint

The single-file build embeds every dependency inline. Sizes depend heavily on
your actual usage of icon imports (`lucide-react`), Excel sheet shapes, and framer-motion
variant sets. Measure your own:

```bash
npm run build
npx vite-bundle-visualizer
```

### Deploy to Render (one-click Blueprint)

The repository ships with a Render Blueprint at [`render.yaml`](render.yaml).
In Render, choose **New → Blueprint**, point at this repo, and the Static Site
will be created with the right Node version and publish path. Then set the
three required `VITE_*` env vars in the service's **Environment** tab and add
the new URL to Supabase → **Authentication → URL Configuration**.

Full step-by-step guide (build settings, env-var table, Vite PUBLIC WARNING,
Supabase URL allow-list, redirects/headers, troubleshooting, rollback):
[`docs/deploy/render.md`](docs/deploy/render.md).

---

## 📜 Scripts

| Command | Effect |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production single-file HTML to `dist/` |
| `npm run preview` | Serve `dist/` locally for a sanity check |
| `npm run check:conflicts` | Reject unresolved `<<<<<<<` markers |
| `npm run check:env` | Verify required `VITE_*` env vars are set in `.env*` |

---

## 🧯 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Login fails immediately | Missing env vars or wrong project URL | Verify `.env`, restart dev server |
| "Auth user already exists" | Migration re-run | Idempotent — `002_seed_admin_user.sql` no-ops when an admin profile exists |
| Service-role key error | `VITE_SUPABASE_SERVICE_ROLE_KEY` not set | Add it to `.env`, restart dev |
| Stock-negative warning on submit | Item lacks initial stock OR a purchase for today | Register via **موجودی اولیه** tab first |
| Voucher reverts back to draft | Submitted > 24 h ago for non-admin | Admin can resubmit via **برگشت به پیش‌نویس** + re-submit |
| PWA install not offered | Browser doesn't support manifest icons | Use Chrome / Edge on desktop or Android |

---

## 🔒 Security Notes

- The **service-role key bypasses Row Level Security** and is bundled into the
  client JavaScript at build time. It enables UI-side admin operations (voucher
  write paths, user create/update, hard deletes). Treat it as a **trust-for-the-UI-flows**
  key, not an authentication secret:
  - Never commit it. Store in env vars only.
  - Rotate it if the bundle is ever distributed beyond intended recipients.
  - Long term, move these flows behind server-side RPCs / Edge Functions so the
    client never needs the service role.
- Authentication is delegated to Supabase Auth. The application never stores
  passwords or PINs.
- The login form constructs the email deterministically
  (`${username}@morvarid.local`). Reset / change-password is admin-gated and
  uses Supabase's `auth.admin.updateUserById`.
- All daily-voucher writes are debounced + idempotent (`upsert` keyed by
  `voucher_id,item_id`).
- **Adjustment** transactions require user-supplied notes for the audit trail.

---

## 🤝 Contributing

- Branch off `main` and open a PR.
- `npx tsc --noEmit` must stay at **0 errors**.
- `npm run check:conflicts` must pass (no unresolved merge markers).
- Keep the service-role key out of the source tree.
- Whenever the DB schema changes, add or update a migration under
  `scripts/migrations/` and **commit** the SQL file in the same PR.
- For UI changes, capture before/after screenshots in the PR description.
- Large feature work should land behind a story page in the admin nav first.

### Repository hygiene / `.gitignore`

- `dist/` is a **build artefact**. Ignore it; the canonical single-file HTML output
  belongs in a release pipeline, not in source-controlled `dist/index.html`.
  If you find yourself manually editing `dist/index.html`, stop — regenerate via
  `npm run build`.
- A file named **`nul`** is a Windows CMD artefact (the result of `> nul`
  redirection gone wrong). Delete it or add `nul` to `.gitignore`. The repository
  should not contain it.
- Recommended `.gitignore` additions: `node_modules/`, `dist/`, `*.local`, `.env`,
  `.env.*.local`, `nul`.

---

## ⚖️ License

This project is private — internal use only — unless a `LICENSE` file is later
added.

---

## 🙏 Acknowledgements

- **BluBank** — design language inspiration (palette, density, motion).
- **Vazirmatn** — Persian typeface by Saber Rastikerdar (`@fontsource/vazirmatn`
  via Google Fonts CDN).
- **Supabase** — Postgres + Auth + RLS in a single platform.
- **Lucide Icons**, **framer-motion**, **date-fns-jalali**, **sonner** — open
  source dependencies that make this project possible.

> Repo: <https://github.com/razamarafat/farm-management-system>
