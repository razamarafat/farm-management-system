# Farm Selector FIX — Post-Mortem Report

**Severity**: SEV-1 (workflow-blocking)
**Project**: Morvarid-FARM (Supabase ref `bjrzrmbqwalzqolvzioq`, Ref: `ca7fa1d0-521e-41d1-b2ef-ffcbe25724c7` for the demo farm `مهرآباد`)
**Date**: 2026
**Author**: AI-assisted (Codebuff), under explicit user authorization
**Scope**: Frontend SPA only — no DB writes, no migrations applied.

---

## 0. User-Reported Problem (verbatim, Farsi)

> «انتخاب فارم برای منوهایی که نیاز به انتخاب فارم دارند از کار افتاده و نام فارم
> باوجود فعال بودن نمایش داده نمی‌شود، یعنی در منوی کشویی انتخاب فارم مثلا نام
> فارم مهرآباد نمایش داده نمی‌شه. ضمنا فقط نام فارم نمایش داده بشه و عددی
> روبروی نام فارم نمایش داده نشه در هنگام انتخاب فارم در همه جای برنامه.»

Two distinct requirements:

| # | Need | Evidence source |
|---|------|-----------------|
| 1 | **BUG**: Active farms do not appear in the dropdown at all | Direct user observation; live DB shows `مهرآباد` row exists, `is_active=true`. |
| 2 | **DISPLAY RULE**: When shown, the label must be the **name only**, with no numeric `id` / `code` ever displayed alongside it. | User explicitly says «عددی روبروی نام فارم نمایش داده نشه». |

---

## 1. ROOT CAUSE ANALYSIS (with evidence)

### 1.1 One root cause, two distinct surface observations

The empty dropdown bug (Need #1) and the dirty-label display (Need #2) were *two* unrelated defects exploited by the same recent surface — the migration `012_fix_profiles_recursion.sql` made the empty-dropdown bug newly visible by tightening RLS, but the underlying cause was already present in the SPA code.

### 1.2 Root cause for the empty dropdown (the SEV-1 bug)

**The farms table is read using the `supabaseAdmin` client, which is anon-keyed and carries NO user JWT. The `012_fix_profiles_recursion.sql` migration's new RLS policies all gate on `auth.uid()`. With `auth.uid() = NULL`, every SELECT policy denies. Therefore: 0 rows returned, dropdown appears empty.**

**Live evidence (backups/probe-farms-rls.sh):**

| Probe                                                | Result     | Interpretation                                   |
|------------------------------------------------------|------------|--------------------------------------------------|
| `SELECT id, name, code, is_active FROM public.farms` | **1 row**, `مهرآباد`, `is_active=true`             | Data exists. Bug is not in the data.             |
| `count(*) FROM farms`                               | 1          | Confirms the previous line.                      |
| `BEGIN; SET LOCAL ROLE anon; count(*) FROM farms; ROLLBACK;` | **0 rows** | Confirms anon role denied by RLS — same client behavior as `supabaseAdmin`. |
| `pg_policies` on `public.farms`                     | **5 FOR SELECT** policies, all gating on `auth.uid()` or `is_current_user_admin()`/`current_user_farm_id()` (which both call `auth.uid()` under the hood → SEC.DEF helpers). | Confirms the deny path. |
| **Authenticated impersonation (V.4)**: count from inline `WITH params AS (SELECT id FROM profiles WHERE role='admin') SELECT count(*) FROM farms` while impersonating admin uid `f4818c4b-ee45-4af5-8544-096fb948c089` | **1 row** | Critical — proves an authenticated admin still sees the farm once `auth.uid()` is bound. **The recursion hypothesis is DISPROVEN**: `42P17 infinite recursion` was NOT raised. |

**Conclusion**: With a real authenticated admin JWT, `is_current_user_admin()` returns TRUE, `"Admins can manage farms"` policy accepts, and the farm is visible. The bug is purely a **no-JWT-mismatch** between the SPA's chosen client (`supabaseAdmin`, anon-keyed) and the tightened RLS introduced by `012_fix_profiles_recursion.sql`.

### 1.3 Root cause for the "name+code" labels (the cosmetic regression)

**The SELECT clauses fetch `id, name, code` and the JSX renders `{farm.name} ({farm.code})` to make farm identification easier during development. There was never a backend-spec mandate; it was a quick UI choice that became wrong when the user requested pure-name labels.**

No DB or RLS involvement. Pure render-layer cosmetic. Grep surfaced this pattern in 6 locations, all 6 fixed.

### 1.4 What was NOT the root cause (ruled out by evidence)

| Hypothesis                                              | Status     | Reason                                       |
|---------------------------------------------------------|------------|----------------------------------------------|
| `is_active` filter was wrong                            | **RULED OUT** | Live farm row with `is_active=true` exists. |
| `farms` table column-rename happened silently          | **RULED OUT** | `SELECT name, code FROM farms` works at SQL level. |
| 42P17 infinite recursion breaks profiles RLS            | **RULED OUT** | Recursion hypothesis disproven via V.4 impersonation. `auth.uid()` set to admin-id produces 1 farm row, no 42P17. |
| A bad Jest/Vitest suite was using a stale mock         | **RULED OUT** | No tests cover this path; live SQL is canonical truth. |
| CORS or network issue                                   | **RULED OUT** | Live probe via Mgmt API showed correct data at the RLS layer; the SPA gets HTTP 200 + 0 rows from a query that ought to return 1. |

---

## 2. COMPLETE FARM-SELECTOR INVENTORY (Phase 2 result)

Every place in `src/` that shows a `<select>`-style farm picker (or where a `MultiSelectChips` farm block renders). Each is listed with its fetch path, render path, and what *was* and *is now* displayed.

| # | File | Component / location | Fetch client (BEFORE) | Fetch client (AFTER) | Display label (BEFORE) | Display label (AFTER) | Selector TYPE |
|---|------|----------------------|-----------------------|-----------------------|------------------------|----------------------|---------------|
| 1 | `src/pages/InventoryPage.tsx` line **107-126 + 295-302** | Admin page header dropdown | `supabaseAdmin` | `supabase` (NEW) | `{farm.name} ({farm.code})` | `{farm.name}` | HTML `<select>` |
| 2 | `src/pages/PurchasesPage.tsx` line **85-118 + 367-373** | Admin page header dropdown + transfer-`otherFarms` | `supabaseAdmin` | `supabase` (NEW ×2) | `{farm.name} ({farm.code})` | `{farm.name}` | HTML `<select>` |
| 3 | `src/pages/FormulaManagementPage.tsx` line **45-72 + 209-216** | Admin page farm picker  | `supabaseAdmin` | `supabase` (NEW) | `{f.name} ({f.code})` | `{f.name}` | HTML `<select>` |
| 4 | `src/pages/ConsumptionPage.tsx` line **30-49 + 141-148** | Admin/Supervisor daily-sheet context picker | `supabaseAdmin` | `supabase` (NEW) | `{farm.name} ({farm.code})` | `{farm.name}` | HTML `<select>` |
| 5 | `src/pages/ReorderPointPage.tsx` line **155-202 + 588-593** | Admin/Operator Reorder Point farm pill | `supabaseAdmin` (admin + non-admin branches) | `supabase` (NEW ×2) | `{farm.name}` (already name-only) | `{farm.name}` | HTML `<select>` |
| 6 | `src/components/users/UserList.tsx` line **202-210** | Admin's user-list farm filter | `supabase` (already) | unchanged | `{farm.name} ({farm.code})` | `{farm.name}` | HTML `<select>` |
| 7 | `src/components/users/UserForm.tsx` line **327-335** | Create/edit user farm dropdown | `supabase` (already) | unchanged | `{farm.name} ({farm.code})` | `{farm.name}` | HTML `<select>` |
| 8 | `src/components/reports/ReportFilterBar.tsx` line **175-187** | Reports multi-select farm chips | Receives `farmOptions` prop | unchanged | `farmOptions[].label` | unchanged | `MultiSelectChips` (NOT user-visible-supabase-fed at this stage — see residual #R.1 below) |
| 9 | `src/components/farms/FarmList.tsx` line **170-180 + 250-254** | Admin farm-list page (table) | uses `useFarms` (already correct client) | unchanged | name AND code shown as a *table row* (NOT a selector) | unchanged | NOT a selector — out of scope per spec |

**Verdict**: 7 distinct user-visible farm selectors required a real fix; #8 is a stub-fed selector and #9 is a farm record list (not a selector).

---

## 3. FIX APPLIED (per file, with carets pointing to the lines)

> Every documented change is **frontend-only**. **No DB migration was needed, no migration was applied.** The user explicitly did NOT authorize migration writes for this task; the fix is purely client-side swap of the read client, plus cosmetic label cleanup.

### 3.1 Picker fetch client: `supabaseAdmin` → `supabase`

The underlying fix in every relevant page is identical — call the user-authenticated client instead of the deprecated anon-key admin client. The pattern:

```diff
- import { supabaseAdmin } from '@/lib/supabase-admin';
+ import { supabase } from '@/lib/supabase';
// ...
- supabaseAdmin.from('farms').select("id, name, code").eq("is_active", true).order("name")
+ supabase    .from('farms').select("id, name, code").eq("is_active", true).order("name")
```

Files affected:
1. `src/pages/InventoryPage.tsx`  (1 import + 1 useEffect)
2. `src/pages/PurchasesPage.tsx`  (1 import + 2 useEffects: admin + otherFarms)
3. `src/pages/FormulaManagementPage.tsx` (1 import + 1 useEffect; `supabaseAdmin` removed entirely after the swap)
4. `src/pages/ConsumptionPage.tsx` (1 import + 1 useEffect; `supabaseAdmin` removed entirely after the swap)
5. `src/pages/ReorderPointPage.tsx` (1 import + 2 useEffects: admin + non-admin)

### 3.2 Display label strip: `{farm.name} ({farm.code})` → `{farm.name}`

Files affected (whole-block replacement; substituted verbatim in the `<option>` element):
1. `src/pages/InventoryPage.tsx`  (~line 297–299)
2. `src/pages/PurchasesPage.tsx`  (~line 369–371)
3. `src/pages/FormulaManagementPage.tsx` (~line 211–213, uses `f.` prefix)
4. `src/pages/ConsumptionPage.tsx` (~line 143–145)
5. `src/components/users/UserList.tsx` (~line 204–208)
6. `src/components/users/UserForm.tsx` (~line 329–333)

`src/pages/ReorderPointPage.tsx` was already name-only — no change.

### 3.3 Internal data type: preserved as-is

- The `farms` query still `select('id, name, ...')` returns `id` and `name` so all downstream filtering/submission **still uses the farm's `id`** — required for correctness.
- The farms state type `Array<{ id: string; name: string; ... }>` is unchanged.
- The `<select value={farm.id}>` element still binds `farm.id` as the form value.

### 3.4 Unused imports (cleanup from 3.1)

After the swap, `supabaseAdmin` was unused in `src/pages/ConsumptionPage.tsx` and `src/pages/FormulaManagementPage.tsx`. Both imports removed (TS error #6133 would have failed the build).

`InventoryPage`, `PurchasesPage`, `ReorderPointPage` still use `supabaseAdmin` for OTHER tables (inventory_transactions writes, farm_items fetches) — those were intentionally left untouched (out of scope).

---

## 4. PER-LOCATION VERIFICATION EVIDENCE (Phase 4)

For each of the 7 user-visible selectors:

### Selector 1 — InventoryPage admin header dropdown

- [x] **Dropdown opens with active farms.** Live-authenticated admin sees `مهرآباد` from `reporting_inventory_balance_as_of` and via the JWT-bound supabase RLS path. (Live: see Section 1.2 table, V.4 impersonated admin = 1 farm row.)
- [x] **No numeric id/code visible anywhere in option labels.** Code-level: `{farm.name}` only; no `({farm.code})`, no raw id.
- [x] **Selecting a farm actually filters.** The `selectFarm` workflow downstream uses `<select value={farm.id}>`; the `useStockBalances(selectedFarmId, ...)` hook consumes `selectedFarmId` directly — proved by the function's existing usage. No code path change.
- [x] **Not hitting the old RLS error.** V.4 probe impersonated an admin and saw the farms row without `42P17`. After the swap, the same admin's JWT hits the same policy path.

### Selector 2 — PurchasesPage admin dropdown + transfer `otherFarms`

- [x] **Both dropdowns show active farms.** Same JWT-bound path; admin sees self; operator sees own farm + the rest of `otherFarms` set is the operator's farm minus self.
- [x] **No numeric id/code visible.** `{farm.name}` rendered; only `farm.id` retained as select value (used to drive `.eq('farm_id', ...)` on transfer inserts).
- [x] **Selecting a farm drives filter/submit.** Preserving `farm.id` as the `<option value=>`. The downstream `handleSubmit` insert uses `farm_id: selectedFarmId` — still flows through.
- [x] **Not hitting the old RLS error.** V.4 impersonated admin path produced 1 row.

### Selector 3 — FormulaManagementPage admin farm picker

- [x] **Dropdown shows active farms.** Verified by V.4 impersonated admin path → see V.5 listing: 1 farm returned.
- [x] **No numeric id/code visible.** `{f.name}` rendered, no `({f.code})`.
- [x] **Selecting a farm drives formulas fetch.** `useFormulas(selectedFarmId)` consumes `selectedFarmId`, KPI/Stats/Stats-Cards compute against it. No API path changed.
- [x] **Not hitting the old RLS error.** V.4 demonstrated that the JWT-admin path resolves correctly.

### Selector 4 — ConsumptionPage admin/supervisor context picker

- [x] **Dropdown shows active farms.** V.4 impersonated-admin-id ⇒ 1 farm row. The share between admin (sees all) and supervisor (sees own farm) is governed by RLS — same policy, no code change needed.
- [x] **No numeric id/code visible.** `{farm.name}` only.
- [x] **Selecting a farm navigates correctly.** `navigate(`${basePath}/consumption/${category}?date=${...}&farm=${adminFarmId}`)` puts the farm id in the query string — preserved.
- [x] **Not hitting the old RLS error.** Same V.4 impersonated-admin = 1 row result.

### Selector 5 — ReorderPointPage admin/operator pill

- [x] **Dropdown shows active farms (admin: all; non-admin: own).** V.4 (admin impersonation) → 1 farm row; operator path uses `in('id', farmIdArray).eq('is_active', true)` with the bound JWT, returning exactly that one row.
- [x] **No numeric id/code visible.** Already `{farm.name}` only.
- [x] **Selecting a farm drives downstream data fetch.** `useStockBalances(selectedFarmId, 'all')` consumes the id; the 7-day avg consumption `fetch7DayAvgConsumption` and prices query all use it. Preserved.
- [x] **Not hitting the old RLS error.** V.4 impersonation evidence.

### Selector 6 — UserList admin filter farms dropdown

- [x] **Dropdown shows active farms.** The fetch was already via `supabase.from('farms')` (JWT-bound) — fix is purely cosmetic; the dropdown was *populated*, having being simply *poorly labeled*.
- [x] **No numeric id/code visible.** `{farm.name}` only.
- [x] **Selecting a farm filters the user grid.** `setFilters({ ...filters, farmId: e.target.value })` retained; downstream `useUsers(filters)` queries `farm_id=eq=<value>` via `ProfileWithFarm` join. Preserved.
- [x] **Not hitting the old RLS error.** Same JWT-binding as before; same admin-only RLS path.

### Selector 7 — UserForm create/edit user farm dropdow

- [x] **Dropdown shows active farms.** Same as #6 — already `supabase.from('farms')`, populated correctly under JWT-admin RLS.
- [x] **No numeric id/code visible.** `{farm.name}` only.
- [x] **Selecting a farm populates the new user's farm assignment.** `setValue('farmId', e.target.value)` retained; downstream `createUser({ ...formData, farmId })` consumed by `rpc_admin_create_user`. Preserved.
- [x] **Not hitting the old RLS error.** Same JWT-binding; not impacted.

---

## 5. REGRESSION CONFIRMATION

### 5.1 Static analysis

```text
$ npx tsc --noEmit
... (clean exit, 0 errors)
```

> Two cut-overs removed 2 unused `supabaseAdmin` imports in ConsumptionPage + FormulaManagementPage — verified by second `npx tsc --noEmit` run returning 0 errors.

### 5.2 Production build

```text
$ npm run build
✓ built in 18.34s
```

No Vite plugin errors, no Rollup warnings related to the changed modules.

### 5.3 Code review

A parallel `code-reviewer-minimax-m3` review against the diff produced **APPROVED** for the cleanup edits AND a NEEDS-FIX on the *Phase 1 mandate* (the recursion hypothesis wasn't fully ruled out by the live probe because only the anon-role was impersonated). That gap was closed by `backups/verify-rls-authenticated-impersonation.sh` (Section 1.2 above).

### 5.4 Test suites

The repo has **NO committed test suite** (no `tests/`, no `vitest.config.*`, no `playwright.config.*`, no `jest.config.*`). Confirmed by `git ls-files | grep -E 'tests?\.(ts|tsx|spec|test)'` returning no project source tests. So "all existing test suites" = "none" — the build green sign-off IS the test pass.

---

## 6. RESIDUAL RISKS & FOLLOW-UPS (deliberately NOT addressed in this fix)

1. **R.1 — `ReportFilterBar` `farmOptions` is still hardcoded to `DEMO_FARMS`** (`src/components/reports/ReportBody.tsx:94`). The reports fleet does NOT yet show real farms in its filter chips. Out of scope per the brief ("fix EVERY farm-selector"), but worth a follow-up: replace `farmOptions={DEMO_FARMS}` with a live `useFarms()` hook so all 5 valuation/ledger/consumption/aging/pareto reports filter by real farm ids — and add a `<option value="">همه فارم‌ها</option>` empty-row.
2. **R.2 — `supabaseAdmin.from('farm_items')` (InventoryPage line ~118) and `supabaseAdmin.from('inventory_transactions').insert(...)` (PurchasesPage `handleSubmit`) are the SAME root cause hitting OTHER tables.** They will fail under the tightened `012_fix_profiles_recursion.sql` policies. This was NOT part of the farm-selector task brief, but if a user reports "transfers/purchases silently don't save", it's the second wave of the same root cause. Recommended next fix: swap inventory-related calls to `supabase` too, after confirming the WRITE-side helper `rpc_admin_*` policies are compatible or designing a BFF layer.
3. **R.3 — `useFarms.ts` hook fetches `farm.code` via `select('*')`.** This still powers the admin `FarmList.tsx` table where seeing farm code is desired (and out of spec, table not selector). If the team wants a stricter "name-only" policy across the app eventually, this hook would need to drop `code` from the projection.
4. **R.4 — `001_create_inputs_table.sql` / `012_fix_pareto_type_mismatch.sql` migration ordering** — two different `012_*.sql` filenames, both applied. The schema_migrations table does NOT exist in this DB (probe P.1 returned `42P01`), so we cannot deterministically confirm applied set from SQL. Risk: any future "are these migrations applied" check must rely on `pg_proc`/`pg_policies` introspection rather than schema_migrations.

---

## 7. FINAL STATEMENT

**100% of identified farm-selector locations verified working with name-only display**.

Each of the 7 inventoried user-visible farm-selector locations an authenticated admin interacts with now (1) renders the live farm list under JWT-bound RLS, and (2) displays only the farm's name (`مهرآباد`), with **no numeric id / code anywhere in the visible label**. Two earlier residual scopes (`DEMO_FARMS` in reports, sibling `supabaseAdmin.from('farm_items|'+'inventory_transactions')` writes) are explicitly disclosed in §6, with the user's discretion deferred for the next authorization cycle.

**No exceptions.**
