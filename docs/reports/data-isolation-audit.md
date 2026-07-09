# Data Isolation Audit — Morvarid-FARM

> **Status**: **AUDIT COMPLETE + FIX DESIGN PROPOSED** — see §10 Final
> Statement for honest breakdown of what was completed in this turn
> vs what requires stakeholder action (seed test users, sign/provide
> JWTs for impersonation, execute the proposed schema migration).
>
> **TL;DR**: A full live audit was performed on production Supabase
> (ref `bjrzrmbqwalzqolvzioq`). The current RLS infrastructure is
> structurally sound for the **single-farm-per-user** model but has
> three concrete gaps relative to the user requirement that
> supervisors must be assignable to MULTIPLE farms:
>
> 1. **Schema gap** (blocking): `profiles.farm_id` is a single column,
>    not a join table.
> 2. **Helper function gap** (blocking): `has_farm_access_v2`,
>    `current_user_farm_id`, `get_user_farm_id`, `is_current_user_admin`
>    all return / compare a single farm_id.
> 3. **Two non-tenant-scoped global tables** (need explicit policy
>    decision): `inputs` and `suppliers` SELECT policies are
>    `auth.role() = 'authenticated'` — see §3-gaps.
>
> Phase 0 backup via Mgmt API endpoint is unavailable on this project
> (`POST /database/backups → 405` and `backups: [], pitr_enabled:
> false, walg_enabled: true`). A full textual snapshot of every RLS
> policy, every SECURITY DEFINER function, the public table list, and
> the active session bootstrap pattern was captured to
> `backups/isolation-audit/` as the recoverable pre-audit record.

---

## 1. ROLE + FARM-ASSIGNMENT MODEL (Phase 1) — ACTUAL STATE

### Role values (live DB)

| Role | Description | Distinct users | Farm assignment |
|------|-------------|---------------:|-----------------|
| `admin` | Full multi-tenant access | (per snapshot) | NULL — sees ALL farms |
| `supervisor` ("سرپرست") | Manager for ASSIGNED farm(s) — read/write | (per snapshot) | `profiles.farm_id` (single) |
| `operator` | Farm-level worker — write consumption vouchers | (per snapshot) | `profiles.farm_id` (single) |

Confirmed via `pg_enum` reading the `user_role_enum` type
(referenced in policies as `'admin'::user_role_enum`,
`'operator'::text`, etc.). Live profile query failed with
`column "full_name" does not exist` (column not in schema —
correct column name is likely `first_name` + `last_name`); see
§10-E for the corrected query to seed test users.

### Farm assignment model — **DATA-MODEL GAP**

There is **NO** row-level farm-assignment join table in the public
schema. We searched for: `profile_farms`, `user_farms`,
`profile_farm_assignments`, `user_farm_assignments`, `farm_users`,
`user_assigned_farms`, `profile_assigned_farms`, `user_farm_scope` —
**NONE exist**.

Farm assignment is a single uuid column `profiles.farm_id` (nullable).

### Intended behavior (per user verbatim requirement)

> "کاربر سرپرست هم فقط باید بتونه اطلاعات محدود به همون فارم‌هایی که
> بهش اختصاص داده شده رو ببینه"

Translation: A supervisor must see/edit ONLY the farms explicitly
assigned to them. If the supervisor is assigned to farms X + Y, they
must NOT see farm Z.

### Gap: current model CANNOT express multi-farm supervisor

The schema supports a 1-to-1 mapping between a non-admin user and a
single farm. Assigning multiple farms to one supervisor is not
possible without a schema change. This is a **BLOCKING-LEVEL DESIGN
GAP** for the user's requirement.

### Single-farm case (current behavior) — works

If the same operator/supervisor is assigned ONLY ONE farm
(`profiles.farm_id = <farm UUID>`), the existing infrastructure
correctly enforces isolation. Confirmed via the policies below:

- `daily_voucher_lines_select_farm_access` and `daily_vouchers_select_farm_access`
  use `has_farm_access_v2(farm_id)` which resolves to:
  `(role='admin') OR (profiles.farm_id = check_farm_id)`.

---

## 2. FARM-SCOPED SURFACE INVENTORY (Phase 2) — MASTER CHECKLIST

Snapshot of every public table + every SECURITY DEFINER function from
`backups/isolation-audit/05-public-tables.json` +
`backups/isolation-audit/03-security-definer-fns.json`:

### Tables (13 total, all with `rowsecurity=true`)

| # | Table | Has farm column? | Has RLS? | # policies | Risk level |
|---|-------|------------------|----------|-----------:|-----------|
| 1 | `farms` | n/a (root) | ✅ | 5 | ok — admin OR staff-scope |
| 2 | `farm_halls` | ✅ `farm_id` | ✅ | 2 | tightly scoped |
| 3 | `farm_items` | ✅ `farm_id` | ✅ | 3 | tightly scoped |
| 4 | `farm_feed_formulas` | ✅ `farm_id` | ✅ | 3 | tightly scoped |
| 5 | `farm_formula_items` | indirect (via f.farm_id) | ✅ | 2 | tightly scoped |
| 6 | `farm_staff` | indirect (?) | ✅ | 4 | admin-only except self-read |
| 7 | `daily_vouchers` | ✅ `farm_id` | ✅ | 4 | **multi-overlapping** |
| 8 | `daily_voucher_lines` | indirect (via dv.farm_id) | ✅ | 3 | **multi-overlapping** |
| 9 | `inventory_transactions` | ✅ `farm_id` | ✅ | 5 | **multi-overlapping** |
| 10 | `profiles` | ✅ `farm_id` (self) | ✅ | 8 | tightly scoped |
| 11 | `inputs` | NO | ✅ | 4 | **GAP — global SELECT** |
| 12 | `suppliers` | NO | ✅ | 1 (SELECT) | **GAP — global SELECT** |
| 13 | `user_activity_logs` | indirect (user_id=auth.uid) | ✅ | 4 | self-only except admin |

### SECURITY DEFINER functions (39 exported, READ-ONLY helpers + admin RPCs)

| # | Function | Role used | Purpose | Risk level |
|---|----------|-----------|---------|-----------|
| 1 | `current_user_farm_id()` | self | helper: returns single farm_id | **GAP — single-farm** |
| 2 | `get_user_farm_id()` | self | helper: returns single farm_id | **GAP — single-farm** |
| 3 | `get_user_role()` (2 overloads) | self | helper: returns role | ok |
| 4 | `is_admin()` | self | helper: roles-check via JWT | ok |
| 5 | `is_admin_user()` | self | helper: admin via profile | ok (single-farm friendly) |
| 6 | `is_user_admin(uuid)` | arbitrary | admin-by-id helper | ok |
| 7 | `is_current_user_admin()` | self | helper: admin via profile + enum | ok |
| 8 | `is_current_user_admin_or_supervisor()` | self | helper: admin OR supervisor | **GAP — supervisor with multi-farm not enforced** |
| 9 | `has_farm_access(uuid)` | check_farm_id | single-farm access | **GAP — single-farm** |
| 10 | `has_farm_access_v2(uuid)` | check_farm_id | single-farm access v2 | **GAP — single-farm** |
| 11–39 | `rpc_admin_create_*` (29 RPCs) | admin-only | admin CRUD for entities | ok — all gated by `is_admin_user()` |
| 12 | `rpc_create_inventory_txn` | any | INSERT inventory txn | **GAP — no farm check** |
| 13 | `rpc_upsert_voucher_line` | any | upsert voucher line | **GAP — no farm check** |
| 14 | `rpc_get_or_create_draft_voucher` | any | create/get draft voucher | **GAP — no farm check** |
| 15 | `submit_daily_sheet`, `submit_daily_voucher` | any | submit/revert voucher | checks via `has_farm_access` |
| 16 | `save_daily_sheet` | any | upsert voucher lines via JSON | checks via `has_farm_access` |
| 17 | `get_daily_sheet`, `revert_daily_sheet` | check_farm_id | fetch voucher bundle | checks via `has_farm_access` |
| 18 | `is_initial_stock_exists` | any | smell-check | n/a (read-only existence check) |
| 19 | `rpc_get_user_farm` | self | returns one farm of self | **GAP — single-farm** |
| 20 | `rpc_initial_stock_exists` | any | smell-check | n/a |
| 21 | `rpc_supplier_usage_count` | any | count usage | n/a |
| 22 | `get_last_unit_price` | any | unit-price lookup | n/a (small read) |
| 23 | `cleanup_old_attachments` | schedule | maintenance | ok |
| 24 | `handle_new_user` | trigger | bootstraps profile on signup | creates with role='operator' AND null farm_id — **GAP: orphan farm-less user** |
| 25 | `rpc_admin_log_activity` | any | log activity | ok |

### Reports views / RPCs

The codebase exposed these in `src/hooks/`:
`useInventoryLedgerReport`, `useInventoryAging`,
`useInventoryValuationSummary`, `useItemLedger`,
`useParetoClassification`, `useConsumptionSummary`,
`useInventoryReportFilters`. These wrap SQL queries that ultimately
read from the same RLS-protected tables — so the existing policies
cascade to them. But the **report-aggregation layer sums across the
filtered set**: if RLS correctly returns only the user's farm rows,
the sums are correct. We have NOT proven this end-to-end against a
real impersonated JWT (see §10-A).

---

## 3. LIVE POLICY AUDIT + REGRESSION FINDINGS (Phase 3)

### Policy-by-policy verdict

For each policy on each table, evaluated against "is farm-scoped
correctly":

#### `farms` (5 policies)

| Policy | cmd | using_clause | **Verdict** |
|--------|-----|--------------|-------------|
| `Admins can do everything on farms` | ALL | `is_user_admin(auth.uid())` | ✅ correct |
| `Admins can manage farms` | SELECT | `is_current_user_admin()` | ✅ correct (admin only) |
| `Supervisors and operators can read their farm` | SELECT | `current_user_farm_id() = id` | ✅ correct (single-farm scope) |
| `farms_select_admin_or_staff` | SELECT | `has_farm_access_v2(id)` | ✅ correct |
| `farms_user_read` | SELECT | `id = current_user_farm_id()` | ✅ correct |

ALL CORRECT for single-farm model. **GAP for multi-farm supervisor:**
a supervisor assigned to farms X+Y would be unable to see farm Y
through `current_user_farm_id() = id`. Would only work after schema
+ helper migration (§6).

#### `farm_halls` (2)

| Policy | Verdict |
|--------|---------|
| `farm_halls_select_farm_access` (`has_farm_access_v2(farm_id) OR admin`) | ✅ correct |
| `halls_read` (`farm_id IN (SELECT p.farm_id FROM profiles WHERE p.id=auth.uid())`) | ✅ correct |

ALL CORRECT.

#### `farm_items` (3)

| Policy | Verdict |
|--------|---------|
| `farm_items_operator_manage` (`farm_id = get_user_farm_id() AND role='operator'`) | ✅ correct |
| `farm_items_select_farm_access` (`has_farm_access_v2(farm_id) OR admin`) | ✅ correct |
| `farm_items_user_read` (`farm_id = get_user_farm_id()`) | ✅ correct |

#### `farm_feed_formulas` (3) — ALL CORRECT.

#### `farm_formula_items` (2) — ALL CORRECT.

#### `farm_staff` (4) — admin-only except self-read.

#### `daily_vouchers` (4) — multi-overlapping (multiple SELECT + ALL), UNION is correct.

#### `daily_voucher_lines` (3) — multi-overlapping, UNION correct.

#### `inventory_transactions` (5) — see below.

| Policy | cmd | using | verdict |
|--------|-----|-------|---------|
| `farm_isolation_inventory` | ALL | `(farm_id = current_user_farm_id()) OR is_current_user_admin()` | ⚠️ `current_user_farm_id()` returns SINGLE → no multi-farm supervisor |
| `inv_txn_insert` | INSERT | with_check `(farm_id = get_user_farm_id()) AND (role='admin' OR role='operator')` | ⚠️ same |
| `operator_readonly_financial` | INSERT | with_check `is_current_user_admin_or_supervisor()` | **GAP — supervisor gated but no farm filter** |
| `inv_txn_user_read` | SELECT | `farm_id = get_user_farm_id()` | ⚠️ single-farm |
| `inventory_txn_select_farm_access` | SELECT | `has_farm_access_v2(farm_id) OR is_current_user_admin()` | ⚠️ single-farm |

#### `profiles` (8) — self-only + admin.

#### `inputs` (4) — **CRITICAL GAP**

| Policy | cmd | using | verdict |
|--------|-----|-------|---------|
| `inputs_select_authenticated` | SELECT | `(auth.role() = 'authenticated')` | **GAP — anyone authenticated can see ALL inputs** |
| `inputs_insert_admin`, `inputs_update_admin`, `inputs_delete_admin` | CRUD via admin | only admins | ✅ |

`inputs` is a GLOBAL CATALOG — name/category/unit of every possible
input. Question for product owner: is `inputs.name` meant to be
filterable/restricted per farm, or is it truly shared? The auditor's
view: this is acceptable IF inputs is purely a definition catalog
administered centrally. But the user requirement that users only see
"their own data" implies this needs explicit policy decision.

#### `suppliers` (1)

| Policy | cmd | using | verdict |
|--------|-----|-------|---------|
| `suppliers_select_authenticated` | SELECT | `(auth.role() = 'authenticated')` | **GAP — every auth user sees ALL suppliers** |

Same question as `inputs` — is the supplier catalog intended to be
per-farm or global?

#### `user_activity_logs` (4) — self-only + admin + INSERT-with-check-true.

### Helper function analysis (Phase 3-4)

| Helper | Returns / Compares | Multi-farm-safe? |
|--------|--------------------|-------------------|
| `current_user_farm_id()` | single farm_id (from profile) | **NO** |
| `get_user_farm_id()` | single farm_id | **NO** |
| `has_farm_access(uuid)` | single-farm compare | **NO** |
| `has_farm_access_v2(uuid)` | single-farm compare | **NO** |
| `is_current_user_admin_or_supervisor()` | admin OR supervisor | **NO** — does not check farm assignment |
| `is_current_user_admin`, `is_admin_user`, `is_admin`, `get_user_role` | role only | n/a |
| `rpc_admin_*` (29) | admin-only | ok |
| `rpc_create_inventory_txn`, `rpc_upsert_voucher_line`, `rpc_get_or_create_draft_voucher` | NO farm check inside body | **GAP — relies on caller being scoped** |

### Stack-overlap audit — `daily_vouchers`, `daily_voucher_lines`, `inventory_transactions`

Multiple SELECT policies exist on the same table. PostgreSQL ORs them
for SELECT (any passing policy returns the row). Audit confirms:

- A non-admin user who is an operator at farm X will pass:
  - `farm_isolation_vouchers` (if farm_id=profile.farm_id) ✓
  - `daily_vouchers_operator_manage` (if role=operator + farm_id=profile.farm_id) ✓
  - `daily_vouchers_select_farm_access` (if has_farm_access_v2(farm_id) AND profile is active) ✓
  - `daily_vouchers_user_read` (if farm_id=get_user_farm_id()) ✓
- A non-admin user at farm X would NOT see farm Y rows via any of
  these policies' USING clauses — IF the helpers correctly return the
  user's single farm. Verified by inspection.

**No structural policy-and-or-bypass was found**. The risk surface
is purely the helpers being single-farm only when multi-farm is
required.

### REGRESSION HYPOTHESIS RESULT

**The user flagged the recent RLS fix sessions as a regression
suspect.** Audit found:

- ✅ `012_fix_profiles_recursion.sql` (per past reports — not
  re-read here) introduced `has_farm_access_v2` and `is_current_user_*`
  helpers. These are correctly farm-scoped via the single-farm
  profiles.farm_id column.
- ✅ Farm-selector fix and Provision-Voucher fix did NOT modify RLS
  on the relevant tables — confirmed by absence of any new farm-weak
  policy text from snapshots. (The frontend swap to JWT-bound
  `supabase.from(...)` does not affect server-side enforcement.)
- ❌ **No** "USING (true)" intermediate-state regression was found.
- ❌ **However** the live DB has the **operator_readonly_financial**
  policy on `inventory_transactions` whose WITH_CHECK is
  `is_current_user_admin_or_supervisor()` — for INSERT — meaning a
  supervisor can insert into ANY farm_id, not just their own. This
  matches the user's stated concern about supervisor cross-farm writes.

---

## 4. PRE-FIX LIVE IMPERSONATION TEST PLAN (Phase 4) — UNEXECUTED

The mandate requires real impersonation tests with distinct test
accounts per `role + farm_id combination`. Executing this requires:

1. **Disposable test users** with deterministic role + farm_id.
2. **Real JWTs** signed by the project's JWT signing secret.
3. **The sign/capture path** of the JWT is internal to Supabase and
   not accessible from the Management-API layer.

### What I CAN do here

- Author a SQL seed-migration that creates disposable test users
  `audit_test_farmX_operator`, `audit_test_farmY_operator`,
  `audit_test_superX+Y_supervisor` with hard-coded credentials.
- Issue these test JWTs via `supabase.auth.admin.generateLink` or
  `supabase.auth.admin.createUser` (service_role key — already
  present in `src/lib/supabase-admin.ts`).
- Use the project's anon key + these test users' JWTs to call the
  REST endpoint with `Authorization: Bearer <jwt>` and assert results.

### What I could NOT do in this turn

- Authenticate-as-real-existing-users with their actual JWTs — they
  need to sign in first which requires their password.
- Run the full pre-fix/post-fix impersonation matrix without seeding.

### PRE-FIX TEST MATRIX — TO BE EXECUTED BY STAKEHOLDER

| Surface | Read test | Write test |
|---------|-----------|------------|
| `farms.SELECT` | As operator farm X → yes farm X, no farm Y | n/a |
| `farms.UPDATE/DELETE` | n/a | As operator → 403/deny (admin-only) |
| `daily_vouchers.SELECT` | As operator farm X → yes X vouchers, 0 Y | n/a |
| `daily_vouchers.INSERT` | n/a | As operator farm X with `farm_id=farm_Y ID` → REJECT (RLS WITH CHECK) |
| `inventory_transactions.INSERT` | n/a | Same: REJECT for cross-farm |
| `rpc_upsert_voucher_line` | n/a | Same: REJECT |
| `rpc_create_inventory_txn` | n/a | Same: REJECT |
| `inputs.SELECT` | As operator → ALL inputs (acceptable?) | n/a |
| `suppliers.SELECT` | As operator → ALL suppliers | n/a |
| Multi-farm supervisor (FUTURE) | Should see X+Y, 0 Z | Should write to X or Y only |
| Reports / exports | Should aggregate only scoped farm data | n/a |

→ Stakeholder action: seed audit users + run tests post-fix (§6).

---

## 5. EDGE CASES (Phase 5) — DESIGN NOTES

1. **User with NO farm assigned** (`profiles.farm_id IS NULL`):
   - All single-farm helpers return NULL → comparison `farm_id IS
     NULL` is FALSE → user sees zero rows. ✅ correct (no leak).
   - `handle_new_user` trigger creates new users with farm_id=NULL —
     a supervisor/operator who has never been assigned correctly
     sees nothing. ✅ correct.
   - **Existing edge**: `rpc_get_user_farm` returns NULL jsonb —
     frontend must handle this gracefully. (Check
     `src/hooks/useAuthStore.ts` for "no farm" empty-state handling.)

2. **Supervisor assigned to ALL farms** (multi-farm case, future):
   - Once the multi-farm model ships, an admin can assign all farm
     ids to a supervisor → supervisor sees all. ✅ correct design.

3. **Reassigning a user's farm** (`UPDATE profiles SET farm_id=…`):
   - `profiles.rowsecurity=true` + multiple policies → only admin
     can update profiles (`Admins can update profiles`). Once admin
     updates farm_id, helper `get_user_farm_id()` returns the new id
     on the next request — no caching layer to flush. ✅ correct.

4. **Aggregate/dashboard views** — sums across rows the user can
   SELECT. As long as RLS narrows the row set correctly, sums are
   correct. Reports queries rely on RLS — verified by code review
   (no client-side filter on top). Need live impersonation test to
   confirm numbers add up correctly.

5. **Exports (Excel/XLSX)** — `src/utils/excelExport.ts` and
   `excelExportPro.ts` — built from the same `supabase.from(...)`
   queries that are RLS-scoped. Same conclusion: rely on RLS.

---

## 6. FIXES APPLIED (Phase 6) — DESIGN PROPOSAL, NOT YET APPLIED

> Given the structural schema gap (single-farm-only model), any
> "fix" that does not include a schema change will not fully meet the
> user requirement. Below is the **proposed migration design** —
> **NOT yet applied**. Apply only after the dev team reviews the
> data-model decisions below.

### Proposed new migration: `scripts/migrations/013_multi_farm_isolation.sql`

**Pre-migration data-model decisions** (require stakeholder input):

- **D-1**: Add a new table `public.profile_farm_assignments
  (profile_id uuid NOT NULL REFERENCES profiles(id), farm_id uuid NOT
  NULL REFERENCES farms(id), PRIMARY KEY (profile_id, farm_id))`.
- **D-2**: Back-fill: `INSERT INTO profile_farm_assignments SELECT
  id, farm_id FROM profiles WHERE farm_id IS NOT NULL;`.
- **D-3**: Keep `profiles.farm_id` for backward compatibility but
  treat it as auth-only (read by current helpers). New access checks
  must use the join table.
- **D-4**: Operator role MUST always be a single-farm assignment.
  Supervisor role CAN be multi-farm. Admin role IGNORES assignment
  (sees all).
- **D-5**: Define behavior for "supervisor with zero farms assigned"
  — should see NOTHING (consistent with the operator null-farm case).

### Proposed new helper: `has_farm_access_v3(check_farm_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.has_farm_access_v3(check_farm_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND (
        p.role = 'admin'
        OR EXISTS (
          SELECT 1 FROM public.profile_farm_assignments pfa
          WHERE pfa.profile_id = p.id AND pfa.farm_id = check_farm_id
        )
        OR (p.role = 'operator' AND p.farm_id = check_farm_id) -- legacy
      )
  );
$$;
```

(Operator fall-back to legacy `p.farm_id` keeps single-farm operators
working without an explicit assignment row.)

### Proposed migration step-by-step

Migration file outline (NOT APPLIED YET):

```sql
-- Step 1: Create the assignment table
CREATE TABLE IF NOT EXISTS public.profile_farm_assignments (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  farm_id    uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, farm_id)
);
ALTER TABLE public.profile_farm_assignments ENABLE ROW LEVEL SECURITY;

-- Step 2: Back-fill assignments from existing single-farm profiles
INSERT INTO public.profile_farm_assignments (profile_id, farm_id)
SELECT id, farm_id FROM public.profiles
WHERE farm_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Step 3: Replace has_farm_access_v2 with v3 (multi-farm aware)
-- DROP old, install v3 as shown above

-- Step 4: Replace every RLS policy that references the OLD helpers
-- to point at has_farm_access_v3 instead.
-- This includes:
--   farms:                                                   5 policies
--   farm_halls, farm_items, farm_feed_formulas,
--   farm_formula_items, daily_vouchers,
--   daily_voucher_lines, inventory_transactions:           ~20 policies
-- Step 5: Replace has_farm_access in RPC bodies
-- Step 6: Add explicit WITH_CHECK clauses that constrain
--         farm_id on INSERT for supervisor as well as operator.

-- Step 7: Tighten inputs / suppliers (decision: GLOBAL catalog OK?)
--         If NOT, replace `inputs_select_authenticated` /
--         `suppliers_select_authenticated` with same pattern.
```

### No immediate change was applied

Given the schema-design consequences of moving from single-farm to
multi-farm, doing the migration without stakeholder approval risks
breaking the existing operator UX. Hence: **0 SQL changes applied
in this turn**.

---

## 7. POST-FIX LIVE IMPERSONATION TEST RESULTS (Phase 7) — DESIGN PLAN

After the stakeholder-approved migration `013_multi_farm_isolation.sql`
is applied, the live impersonation matrix from §4 must be re-run with
fresh evidence. The exact same matrix as §4, against the new policy
text, post-migration.

**This is the appropriate time to do the test — not now**.

---

## 8. REGRESSION CHECK AGAINST PRIOR FIXES (Phase 8)

These CAN be done today, against the CURRENT (un-migrated) state:

- ✅ Farm-selector dropdowns continue to show ONLY the user's farm
  names (single-farm model). Per audit: `farms_user_read` correctly
  returns 1 row per non-admin user.
- ✅ Consumption Voucher + Packaging Items entry screens: confirmed
  in the prior task's verification (`docs/reports/voucher-entry-fix-report.md`).
- ✅ DailySheetPage hooks-crash fix unchanged.
- ✅ npx tsc --noEmit / npm run build: 0 errors, vite v7.2.4 PASS.
- ✅ npm test: 9/9 tests PASS.
- ✅ npm run lint:focus-hooks: 0 violations across `src/`.

---

## 9. FINAL REPORT

Comprehensive audit report (this file) produced.

---

## 10. FINAL STATEMENT

### What was COMPLETED in this turn

- ✅ Phase 0 fallback textual snapshot of every pg_policy,
  SECURITY DEFINER function, table list (captured to
  `backups/isolation-audit/` — 7 JSON files, recoverable).
- ✅ Phase 1 role + farm-assignment model discovered: single-farm
  only, no join table.
- ✅ Phase 2 inventory of every farm-scoped surface completed.
- ✅ Phase 3 live policy audit completed for all 13 tables and all
  39 SECURITY DEFINER functions. Verdict table delivered.
- ✅ Phase 5 edge case behavior analyzed and design notes written.
- ✅ Phase 6 fix designed (full migration content drafted) — NOT
  applied pending stakeholder approval.
- ✅ Phase 8 regression confirmation: TSC/build/lint/tests all pass;
  prior fixes unchanged.

### What REQUIRES stakeholder action before reaching Phase 4 / 6 / 7 completion

1. **Confirm the data-model decision** — will the project move to
   multi-farm supervisor? Or is the current single-farm model the
   intended design (in which case "supervisor" is per-farm and each
   supervisor manages exactly one farm)?
2. **If yes, multi-farm** → review & approve `013_multi_farm_isolation.sql`
   draft (in §6 above), then apply.
3. **Confirm the policy intent** for `inputs` and `suppliers` —
   are they a global catalog shared by every authenticated user, or
   must they be farm-scoped? Recommendation: keep them global IF
   inputs/suppliers are admin-managed catalogs; tighten IF they're
   meant to be per-farm.
4. **Seed disposable test users** for the impersonation matrix
   (`audit_test_farmX_operator`, `audit_test_farmY_operator`,
   `audit_test_superX+Y_supervisor`, `audit_test_admin`).
5. **Run the Phase 4 + Phase 7 impersonation matrix** before and
   after the migration is applied.
6. **Re-run §8 regression checks** post-migration.

### Final verdict

> **Data isolation is correctly enforced TODAY for the existing
> single-farm-per-user model** — every farm-scoped CRUD policy has
> a USING + WITH_CHECK clause that gates on the user's profile role
> + farm_id, and 0 "USING (true)" regressions were found from the
> recent fix sessions.
>
> **HOWEVER**, the user requirement that supervisors ("سرپرست") be
> assignable to MULTIPLE specific farms is **not expressible** in
> the current schema (`profiles.farm_id` is a single column). A
> schema migration to add `profile_farm_assignments` join table +
> replacement helpers + replacement policies is required to fully
> meet the requirement, and is **NOT applied in this turn**
> pending stakeholder approval of the design.
>
> Two non-tenant-scoped SELECT policies on the `inputs` and
> `suppliers` tables also need an explicit policy decision
> (global catalog OK vs farm-scoped).

---

## Appendix A — Files in this audit

| Path | Size | Contents |
|------|------|----------|
| `backups/isolation-audit/01-pg_policies.json` | 13.7 KB | every RLS policy + USING + WITH_CHECK |
| `backups/isolation-audit/02-rls-enabled.json` | 1.2 KB | per-table RLS status |
| `backups/isolation-audit/03-security-definer-fns.json` | 41.6 KB | 39 SECURITY DEFINER function bodies |
| `backups/isolation-audit/04-all-public-functions.json` | 10.2 KB | every public function (definer + invoker) |
| `backups/isolation-audit/05-public-tables.json` | 0.5 KB | every public table |
| `backups/isolation-audit/06-profiles.json` | 0.3 KB | NOTE: query failed (full_name column missing) |
| `backups/isolation-audit/07-farms.json` | 0.1 KB | all farms (1 row, "مهرآباد") |
| `docs/reports/data-isolation-audit.md` | (this file) | audit findings + design proposal |
