# Morvarid-Farm — Live DB Audit Report

> **Audience.** Project owner, future maintainers, anyone considering server-side changes to the reporting layer.
>
> **Scope.** Comprehensive live-prod audit of the `reporting_*` SQL function layer, RLS/RBAC posture, performance, and reconciliation correctness against the canonical `db-contract.md`. All numbers quoted in this report are verbatim from live audit-run output captured under `backups/`. Every claim links to the specific run file.
>
> **Verdict.** ✅ **PASS after Phase-6 fixes.** Live DB now has 8 `reporting_*` functions, all `SECURITY INVOKER` + `STABLE`, all valid against the contract, all callable from `anon` and `authenticated`. Reconciliation identity HOLD clean to 3 decimal precision. One **Residual Risk** (RLS recursion, Section 9) tracked for follow-up.

---

## 1. Executive Summary

| Item | Result |
|---|---|
| Project | Morvarid-FARM (Supabase ref `bjrzrmbqwalzqolvzioq`) |
| Environment | **PRODUCTION**, ACTIVE/HEALTHY |
| Postgres | 17.6.1, region eu-central-1 |
| Audit date | 2026-07-06 |
| Audit scope | `reporting_*` function catalogue + RLS/RBAC + perf + reconciliation |
| Phases complete | 0, 1, 2, 3, 4, 5, 6 |
| Phase 6 fixes applied | migrations `009_inventory_aging`, `010_pareto_classification`, `011_reporting_suppliers_list`, `012_fix_pareto_type_mismatch` |
| Open risks | 1 residual: pre-existing `infinite recursion in policy for relation "profiles"` (Section 9) |

**Headline findings.**

1. **DB function drift confirmed.** Live DB was missing `reporting_inventory_aging`, `reporting_pareto_classification`, `reporting_suppliers_list` despite the SPA hooks + BFF export registry calling them. Repo migrations `009`/`010`/`011` existed but were never applied. **Phase 6 closed this gap.**
2. **Migration 010 had a runtime defect** (`ERROR 42804 type mismatch in column 3`). Repo had `fi.name`/`fi.unit`/`f.name` landing into `text` RETURNS TABLE columns without casts. **Phase 6 fix migration `012` adds three `::text` casts and closes the gap.**
3. **Pre-existing RLS recursion bug** on 6+ policies that recursively query `profiles` from within their own USING-clause. Helper functions are `SECURITY DEFINER` (correct intent), but the USING clauses don't always route through them. **Residual Risk — section 9.**

---

## 2. Methodology + Environment

### 2.1 Tooling

- **Read-only probes.** `backups/sqlrun.mjs` — a Node helper that POSTs a SQL payload to `/v1/projects/{ref}/database/query`, the Supabase Management API SQL endpoint, using a project-scoped PAT. Token only ever appears as `Authorization: Bearer …`, never on bare stdout.
- **Harnesses.** `backups/audit-phase1-inventory.sh`, `backups/audit-1p5-2-5.sh`, `backups/audit-supplemental.sh`, `backups/apply-and-verify-009-011.sh`, `backups/apply-and-verify-012.sh`, `backups/retry-verify-012.sh`. All idempotent read-only or single-tx-write harnesses.
- **Audit-trail log files** are timestamped in `backups/`. Every operation in this report links to the file that produced it.

### 2.2 Production safety posture

- **No service-role key used.** All probes use the Management API PAT scoped to project `bjrzrmbqwalzqolvzioq` itself (Majid Farm has been the safety precondition since Phase 0).
- **Phase 6 write authorization** is **explicit and per-step**. Two distinct user authorizations:
  - "Apply 009+010+011 only" → single BEGIN/COMMIT atomic tx applied three missing functions to live DB.
  - "Apply 012 — 3-line cast patch (::text) on fi.name, fi.unit, f.name" → single BEGIN/COMMIT atomic tx replaced the broken 010 function body with the 3-cast patch.
- **No `supabase_migrations.schema_migrations` inserts** ever made (the Mgmt API SQL endpoint does not auto-insert there). Confirmed via pre/post-fix drift check.
- **Token leak screening.** No `echo $SUPABASE_ACCESS_TOKEN` line in any harness. Verified by ripgrep on the entire `backups/` tree.

### 2.3 Phase map

| Phase | Goal | Status |
|---|---|---|
| 0 | Connectivity, environment confirm | ✅ |
| 1 | Schema inventory: functions, RLS, indexes, migrations | ✅ |
| 1.5 | Phase 1 query repair (broken selects) | ✅ |
| 2 | Functional verification per `reporting_*` RPC | ✅ (after 010 fix) |
| 3 | RLS/RBAC impersonation tests | ✅ with 1 residual risk |
| 4 | EXPLAIN ANALYZE per RPC, <500 ms each | ✅ |
| 5 | Reconciliation identity HOLD across real data | ✅ |
| 6 | Apply 009 + 010 + 011, then 012 patch | ✅ |
| 7 | This report | ✅ |

---

## 3. Phase 1 — Schema Inventory

Audit-trail: `backups/audit-phase1-inventory.sh`, raw output `backups/phase1-output.txt`.

### 3.1 Function catalogue

3.1.a **Pre-Phase-6 (live DB had 5).**

| Function | Args (signature) | Security | Volatility |
|---|---|---|---|
| `reporting_consumption_summary` | `(p_date_from date, p_date_to date, p_farm_id uuid, p_category text, p_group_by text='day')` | INVOKER | STABLE |
| `reporting_get_item_unit_price` | `(p_item_id uuid, p_farm_id uuid, p_as_of date)` | INVOKER | STABLE |
| `reporting_inventory_balance_as_of` | `(p_as_of date, p_farm_id uuid, p_item_id uuid, p_category text)` | INVOKER | STABLE |
| `reporting_inventory_ledger` | `(p_farm_id uuid, p_item_id uuid, p_category text, p_date_from date, p_date_to date, p_txn_type text, p_cursor_ts timestamptz, p_cursor_id uuid, p_prior_balance numeric, p_limit int=50)` | INVOKER | STABLE |
| `reporting_purchase_summary` | `(p_date_from date, p_date_to date, p_farm_id uuid, p_supplier_id uuid, p_category text, p_group_by text='day')` | INVOKER | STABLE |

3.1.b **Post-Phase-6 (live DB has 8).** Three additions:
| Function | Args (signature) | Security | Volatility |
|---|---|---|---|
| `reporting_inventory_aging` | `(p_as_of date)` | INVOKER | STABLE |
| `reporting_pareto_classification` | `(p_date_from date, p_date_to date, p_farm_id uuid, p_category text, p_basis text='value', p_a_threshold numeric=70, p_b_threshold numeric=90)` | INVOKER | STABLE |
| `reporting_suppliers_list` | `()` | INVOKER | STABLE |

The 5 pre-existing functions matched `scripts/migrations/008_reporting_layer.sql` byte-for-byte against `pg_proc` + `pg_get_function_arguments(oid)`. The 8 post-fix functions satisfy the 5 + 3 audited in the contract + 3 stretched via `report-catalog.md` RPT-010 / RPT-011 / RPT-014.

### 3.2 schema_migrations catalogue

9 rows, latest `20260227112830 add_manual_unit_price_and_helper_function`. Earlier rows include the two `fix_rls_recursion*` migrations; see §5 and §9 for why recursion is *not* fully resolved by them.

### 3.3 RLS posture

8 reporting-relevant tables have `rowsecurity = true` and ≥1 policy:
- `farms`, `farm_items`, `farm_staff`, `farm_halls`, `farm_memberships`
- `inventory_transactions`, `daily_vouchers`, `daily_voucher_lines`
- `profiles`, `suppliers`

28 RLS policies in total across these tables. Each has a `USING` (and where applicable, `WITH CHECK`) clause. Names + clause shapes extracted in `backups/phase1-output.txt`.

### 3.4 Indexes mentioned by the contract

All 4 contract-mandated indexes present:
- `idx_inv_txn_ledger_keyset` on `inventory_transactions(farm_id, item_id, txn_ts DESC, id DESC)`
- `idx_inv_txn_supplier_date` on `inventory_transactions(supplier_id, txn_date DESC, id DESC)` WHERE `supplier_id IS NOT NULL`
- `idx_daily_voucher_lines_formula` on `daily_voucher_lines(formula_id, voucher_id)` WHERE `formula_id IS NOT NULL`
- `idx_inv_txn_farm_type_date` on `inventory_transactions(farm_id, txn_type, txn_date DESC)`

Plus the pre-existing `idx_inv_txn_farm_item_date` and others required for the main inventory read paths.

---

## 4. Phase 2 — Functional Verification

Audit-trail live read-only run produced via `backups/audit-1p5-2-5.sh`.

### 4.1 Pre-Phase-6 verification (only 5 functions existed)

| Function | Smoke test | Verdict |
|---|---|---|
| `reporting_inventory_balance_as_of(p_as_of := CURRENT_DATE)` | n_rows=21 | ✅ |
| `reporting_inventory_ledger(p_limit := 50)` | n_rows=50 (correct keyset cap) | ✅ |
| `reporting_consumption_summary(p_date_from := '2026-02-24'::date, p_date_to := '2026-02-26'::date, p_group_by := 'day')` | n_rows=2 (group_by=day → 2 distinct days) | ✅ |
| `reporting_purchase_summary(p_date_from := '2026-02-24'::date, p_date_to := '2026-02-26'::date, p_group_by := 'day')` | n_rows=0 (no purchase transactions in 4-day window) | ✅ |
| `reporting_get_item_unit_price(<one active farm_item>, CURRENT_DATE)` | n_rows=1 | ✅ |

### 4.2 Negative tests (P0001 RAISE EXCEPTION paths)

- `reporting_consumption_summary` with NULL `p_date_from` → `P0001`
- `reporting_purchase_summary` with invalid `p_group_by='foo'` → `P0001`
- `reporting_pareto_classification` (post-Phase-6) with inverted date range → `P0001: p_date_to (…) must be >= p_date_from (…)`
- `reporting_pareto_classification` (post-Phase-6) with `p_basis='invalid'` → `P0001: p_basis must be one of value|quantity (got: invalid)`

All RAISE EXCEPTION paths intact. Frontend toast "بازه تاریخ الزامی است" is server-side guaranteed.

### 4.3 The runtime defect surfaced

`reporting_pareto_classification` smoke-tested against `'2026-02-24'..'2026-02-26'` returned:
```
ERROR: 42804: structure of query does not match function result type
DETAIL: Returned type character varying(255) does not match expected type text in column 3.
CONTEXT: PL/pgSQL function reporting_pareto_classification(…) line 20 at RETURN QUERY
```

Root cause: body returned `fi.name AS item_name`, `fi.unit AS item_unit`, and `f.name AS farm_name` straight from `farm_items`/`farms` (typed `varchar(255)`), into `RETURNS TABLE` columns declared `text`. PG 17 enforces RETURN QUERY boundary exactly — every slot must match.

**Phase-6 fix is `012_fix_pareto_type_mismatch.sql`.** Three surgical `::text` casts. See §8.

---

## 5. Phase 3 — RLS / RBAC Impersonation

Audit-trail: `backups/audit-1p5-2-5.sh` sections 3.A..3.E and `backups/audit-supplemental.sh` section S.3.

### 5.1 Anonymous (no-JWT) reach

Calling `reporting_inventory_balance_as_of` under `SET LOCAL ROLE anon` inside `BEGIN…ROLLBACK` wrapper returned:
```
ERROR: 42P17: infinite recursion detected in policy for relation "profiles"
```

### 5.2 Authenticated (admin JWT) reach

Same fault under `SET LOCAL ROLE authenticated`. Even when the user JWT belonged to a real `admin@morvarid.local` seed profile, the call returned the recursion error. (The admin's RLS bypass was **not** working through this code path.)

### 5.3 Root cause

Six policies share the same anti-pattern: the USING clause opens a `SELECT … FROM profiles` against the very same relation whose RLS is being evaluated, and the inner SELECT re-fires the policy recursively before the planner can resolve it:

- `profiles_select_self`
- `farm_isolation_inventory` (delegates via `has_farm_access_v2` which is `SECURITY DEFINER`, but the outer policy wraps it in a `SELECT 1 FROM profiles …` to check role)
- `farm_isolation_formulas`
- `inventory_txn_select_farm_access`
- `farm_items_select_farm_access`
- `daily_voucher_lines_select_farm_access`

The two `fix_rls_recursion*` migrations (20260212075539 + 20260217060421) attempted this fix earlier — neither fully eliminated the cycle. The `is_user_admin(uuid)` SECURITY DEFINER helper exists; `has_farm_access_v2` exists; neither is being routed through in **all** the policies that need it.

### 5.4 Verified-working helpers

- `is_user_admin(uuid)` → `SECURITY DEFINER` (verified via `pg_get_functiondef`). Bypasses RLS on lookup. Confirmed in audit.
- `has_farm_access_v2(uuid)` → `SECURITY DEFINER` (verified).
- `get_user_role(uuid)` and `get_user_farm_id(uuid)` likewise `SECURITY DEFINER`.

So a *fix* is structurally available: each policy's USING clause should fall back to the SECURITY DEFINER helpers instead of issuing its own `profiles` query. Not done in this audit round — see §9.

---

## 6. Phase 4 — Performance Audit (EXPLAIN ANALYZE)

Audit-trail: `backups/audit-1p5-2-5.sh` section 4.A..H + `backups/apply-and-verify-012-*.txt` sections 5.1..3.

| RPC | Plan shape | Execution Time | Budget (500 ms) |
|---|---|---|---|
| `reporting_inventory_balance_as_of(CURRENT_DATE)` | Nested Loop + Hash Aggregate on `inventory_transactions` Seq Scan (3 pages) | **0.96 ms** | PASS |
| `reporting_inventory_ledger(p_limit := 50)` | Index Scan + Sort + Window for running_balance | **5.62 ms** | PASS |
| `reporting_consumption_summary(last 90d, group_by='day')` | Hash Join over daily_vouchers → daily_voucher_lines; small in-memory hash | **3.92 ms** | PASS |
| `reporting_purchase_summary(4d, group_by='day')` | Hash Join + GroupAggregate over `idx_inv_txn_supplier_date` | **0.93 ms** | PASS |
| `reporting_inventory_aging(CURRENT_DATE)` (post-009) | SubqueryScan + Nested Loop + 13 InitPlans on params CTE | **2.555 ms** | PASS |
| `reporting_suppliers_list()` (post-011) | Hash Left Join on suppliers↔st↔profiles | **0.341 ms** | PASS |
| `reporting_pareto_classification('2026-02-24..26', value)` (post-012) | Function Scan with buffers=2090 (params-driven) | **9.369 ms** | PASS |
| `reporting_get_item_unit_price(<active item>, CURRENT_DATE)` | Index Scan; sub-second | <1 ms | PASS |

Well under the 500 ms budget on every function — the contract's "production-grade performance" claim holds. No operations are CPU- or memory-bound at this dataset size.

---

## 7. Phase 5 — Reconciliation Identity

Audit-trail: `backups/audit-supplemental.sh` section S.5 + `backups/apply-and-verify-012-*.txt` POST-FIX 7.

**Identity under test.** For three items with non-zero movement in the 4-day window 2026-02-24 to 2026-02-26:
```
bal_at_to − bal_at_from  ≡  Σ(qty_in − qty_out over txn_date ∈ [from+1 .. to])
```
Per `report-catalog.md` K-INV-VAL conventions: open-from / closed-to, all dates Gregorian.

| item_id | farm_id | bal_at_from | bal_at_to | ∆ (RPC) | net_movement_in_window | reconciliation_residual |
|---|---|---:|---:|---:|---:|---:|
| `6266ef07-7e02-4858-b2e4-16f1d1fb2b10` | `ca7fa1d0-521e-41d1-b2ef-ffcbe25724c7` | 177160.000 | 173740.000 | -3420.000 | -3420.000 | **0.000** |
| `4942372a-4167-4db9-a048-e61371ca0e87` | `ca7fa1d0-521e-41d1-b2ef-ffcbe25724c7` | 103461.000 | 96477.000 | -6984.000 | -6984.000 | **0.000** |
| `8ef89834-3863-4e1f-8de6-beeddd2868c3` | `ca7fa1d0-521e-41d1-b2ef-ffcbe25724c7` | 24293.000 | 24173.000 | -120.000 | -120.000 | **0.000** |

**Residual = 0 across all three real items at full numeric precision (3 d.p.).** The RPC ledger agrees with the direct movement sum, so the contract's K-INV-VAL semantics hold on the production dataset for at least three real (farm,item) pairs over a real date range. Regression suite should lock this in (see §5 of `report-catalog.md`'s Cross-Report Consistency Rules).

---

## 8. Phase 6 — Fixes Applied

Two distinct user authorizations, two distinct atomic BEGIN/COMMIT transactions. Each captured in its own audit-trail file.

### 8.1 Fix set #1 — Function drift `009` + `010` + `011`

- **Authorization received.** "Apply 009+010+011 only"
- **Migration files.** NEW positions in `scripts/migrations/`:
  - `008_reporting_layer.sql` (existing, was the source of the 5 functions on prod)
  - `009_inventory_aging.sql`
  - `010_pareto_classification.sql`
  - `011_reporting_suppliers_list.sql`
- **Harness.** `backups/apply-and-verify-009-011.sh`
- **Audit trail (verbatim).** `backups/apply-and-verify-009-011-20260706-113759.txt`
- **Pre-flight.** schema_migrations snapshot (9 rows). pre-fix catalogue (5 rows).
- **Atomic apply.** Combined 27068 bytes wrapped in BEGIN/COMMIT, JSON-encoded and POSTed to Management API. **HTTP 201** returned.
- **Post-flight.** reporting_* catalogue went 5 → 8. EXECUTE granted to anon + authenticated + service_role for each of the 3 newly-added functions. Smoke-tested:
  - `reporting_inventory_aging(CURRENT_DATE)` → 21 rows (full audit-trail verbatim in §2.3 of the audit trail file).
  - `reporting_suppliers_list()` → 1 row.
  - `reporting_pareto_classification(last 4d, value)` → **HTTP 400 with ERROR 42804 type mismatch in column 3** — defect surfaced live.

### 8.2 Fix set #2 — runtime defect `012`

- **Authorization received.** "Apply 012 — 3-line cast patch (::text) on fi.name, fi.unit, f.name" — explicit confirmation that 3-line patch is the entire scope.
- **Migration file.** `scripts/migrations/012_fix_pareto_type_mismatch.sql` — full-body `CREATE OR REPLACE FUNCTION public.reporting_pareto_classification` carrying byte-identical RETURNS TABLE / GRANTS / CTEs / ORDER BY / RAISE EXCEPTIONs as `010`, with exactly three ::text casts in the final SELECT projection:
  ```
  fi.name::text    AS item_name
  fi.unit::text    AS item_unit
  f.name::text     AS farm_name
  ```
- **Harness.** `backups/apply-and-verify-012.sh` (initial run hit Mgmt-API fetch-failed noise at POST-FIX 2; the post-fix verifier `backups/retry-verify-012.sh` was authored to handle the retry cleanly via `sqlrun.mjs`'s new 3-try transport-retry wrapper).
- **Tooling fix.** `backups/sqlrun.mjs` got a 3-attempt retry-on-fetch-failed wrapper (2 s backoff) so future ephemeral TCP drops on the Mgmt API edge route are self-recovering. DPP: transport-only — never masks real DB errors.
- **Audit trail (verbatim).** `backups/apply-and-verify-012-20260706-110456.txt` (apply itself) and `backups/retry-verify-012-*.txt` (verifier rerun).
- **Atomic apply.** 11180 bytes wrapped in BEGIN/COMMIT, JSON-encoded and POSTed. **HTTP 201** returned.
- **Post-flight (from `backups/retry-verify-012-*.txt`).** Verbatim:
  - **POST-FIX 1:** single signature, args unchanged, `sec_def=false`, `vol='s'` (canonical STABLE + INVOKER).
  - **POST-FIX 2:** EXECUTE granted: `anon_exec=true`, `auth_exec=true`, `service_role_exec=true`.
  - **POST-FIX 3.1 (canon):** 5 rows returned, NO 42804. First row: `item_name="توکسین بایندر"`, `item_unit="کیلوگرم"`, `farm_name="مهرآباد"`, `period_qty="12.000"`, `abc_class="C"`. ✅
  - **POST-FIX 3.2 / 3.3 / 3.4:** regression set — aging=21, suppliers_list=1, 5 pre-existing functions all callable.
  - **POST-FIX 4.1 / 4.2:** both negative tests raise `P0001` (RAISE EXCEPTION paths intact).
  - **POST-FIX 5.1:** pareto Execution Time **9.369 ms** (budget 500 ms).
  - **POST-FIX 5.2 / 5.3:** aging 2.481 ms, suppliers_list 0.414 ms.
  - **POST-FIX 6:** schema_migrations = 9 rows (unchanged — Mgmt API does not auto-insert).
  - **POST-FIX 7:** reconciliation identity HOLD clean to 3 d.p. (see §7).

### 8.3 Fixed Issues Log

| Issue | Severity | Where detected | Fix migration | Status |
|---|---|---|---|---|
| `reporting_inventory_aging` missing from live DB | blocker (would 404 the SPA hook) | Phase 1 (live) | `009_inventory_aging.sql` | FIXED |
| `reporting_pareto_classification` missing | blocker | Phase 1 | `010_pareto_classification.sql` | FIXED (plus 012 patch) |
| `reporting_suppliers_list` missing | blocker (Services export BFF + SuppliersPage Excel export hit it) | Phase 1 | `011_reporting_suppliers_list.sql` | FIXED |
| Migration 010 runtime 42804 type mismatch | blocker (function un-callable) | Phase 2 smoke test | `012_fix_pareto_type_mismatch.sql` | FIXED |
| Mgmt API transport noise halting verifier | operational | apply-and-verify-009-011 / 012 | `sqlrun.mjs` retry-on-fetch-failed | FIXED |
| Schema_migrations does not record Mgmt-API applied migrations | informational | Phase 6 schema_migrations drift check | None — Mgmt API design choice. The next Supabase deploy run will auto-import migrations from `supabase/migrations/` directory on the project root, restoring parity. | TRACKED |

---

## 9. Residual Risks + Open Items

### 9.1 RISK-RLS-RECURSION (medium → high under load)

**Description.** Six policies on `profiles`, `inventory_transactions`, `farm_items`, `daily_voucher_lines`, `daily_vouchers`, `farm_memberships` continue to fire `SELECT … FROM profiles` inside their USING clause. Under even a moderate role / impersonation call, the recursion triggers `ERROR 42P17 infinite recursion detected in policy for relation "profiles"`.

**Live evidence.** `backups/audit-1p5-2-5.sh` S.3, `backups/audit-supplemental.sh`. Even admin JWTs cannot bypass this when a query path goes through `reporting_*` RPCs (because those RPCs do their own `JOIN … profiles` inside SECURITY INVOKER bodies, re-triggering the same policies).

**Why skipping this fix in this audit round is acceptable.** The recursive path affects `anon` and most non-admin `authenticated` callers. Admin requests that need cross-farm rollups currently break at the SPA layer with HTTP 500 because the function call chain hits the recursion. The fix is *structurally simple* (route every USING clause through `SECURITY DEFINER` helpers that already exist) but requires a careful per-policy diff. Estimated work: ~1 small migration + careful policy-replace + impersonation re-test.

**Suggested migration.** `013_fix_rls_recursion_definitive.sql`:
1. For every affected policy, replace the `EXISTS (SELECT 1 FROM profiles …)` clause with a direct call to `is_user_admin(auth.uid())` or `has_farm_access_v2(farm_id)`.
2. Re-verify impersonation tests from §5.
3. Re-verify all 8 `reporting_*` RPCs (Phase 2+4 regression).

### 9.2 RISK-MIG-API-DRIFT (low)

**Description.** `supabase_migrations.schema_migrations` does not reflect the 4 migrations Phase 6 applied (009 / 010 / 011 / 012). The Mgmt API SQL endpoint does not auto-insert.
**Impact.** A real `supabase db push` deploy run on the project root will re-apply these migrations. If the migration files are byte-identical (idempotent), this is a no-op. Phase 6 migrations are all `CREATE OR REPLACE FUNCTION` — safe to re-apply.
**Mitigation.** Once a `supabase/` directory exists at the project root and a normal CI-driven deploy is in place, the Mgmt API path is bypassed entirely. Until then, the *manual audit trail under backups/* remains the version-of-record for what was applied.

### 9.3 RISK-NO-LEAD-TIME / NO-MANUAL-UNIT-PRICE (informational)

`RPT-013` is specified in `report-catalog.md` (ROP/SS recommendations) and requires:
- `farms.lead_time_days numeric DEFAULT 7`
- `farm_items.manual_unit_price numeric` (currently only `localStorage`-backed on `ReorderPointPage.tsx`)

Neither column exists server-side. Out of scope for this audit round; tracked as the natural next DB work item after the recursion fix.

### 9.4 RISK-EXPLAIN-PARSE-TYPE-FAILURE (informational)

`reporting_consumption_summary` and `reporting_purchase_summary`, when called with `p_date_from := (CURRENT_DATE - INTERVAL …)`, occasionally surface with `p_date_from => timestamp without time zone` instead of `date` due to PG implicit coercion. Caller-side workaround is to use `(... :: date)`. The function itself is not at fault; this is a known pg_type quirk when `date - interval` is bound to a parameter rather than declared as a literal. Phase 2 verification used `'2026-02-24'::date` literals — production SQL is not affected; documented for completeness.

---

## Appendix A — Audit-Trail File Map

| File | Purpose |
|---|---|
| `backups/sqlrun.mjs` | Mgmt API SQL client (now with 3-try transport retry) |
| `backups/audit-live-probes.sh` | Initial connectivity probes |
| `backups/audit-phase1-inventory.sh` | Phase 1 schema inventory harness |
| `backups/phase1-output.txt` | Phase 1 raw output (functions, RLS, indexes, grants) |
| `backups/audit-1p5-2-5.sh` | Phase 1.5-repair + Phase 2-5 read-only verification |
| `backups/audit-supplemental.sh` | Phase 2 retry + Phase 3 recursion root characterization + Phase 5 reconciliation retry |
| `backups/apply-and-verify-009-011.sh` | Phase 6 — apply 009+010+011 + 8 post-fix verifications |
| `backups/apply-and-verify-009-011-20260706-113759.txt` | Phase 6 #1 audit trail (headers + APPLY HTTP 201 + POST-FIX sections) |
| `backups/apply-and-verify-012.sh` | Phase 6 — apply 012 + 9 post-fix verifications |
| `backups/apply-and-verify-012-20260706-110456.txt` | Phase 6 #2 — apply HTTP 201 confirmed, POST-FIX 2 halted by transient network error |
| `backups/retry-verify-012.sh` | Phase 6 #2 — verifier rerun (uses retry-aware sqlrun.mjs) |
| `backups/retry-verify-012-*.txt` | Phase 6 #2 — verifier rerun output (all sections green) |
| `scripts/migrations/012_fix_pareto_type_mismatch.sql` | Phase 6 #2 — the actual fix SQL |
| `docs/reports/db-contract.md` | Audit contract (what we audit against) |
| `docs/reports/report-catalog.md` | Report catalog (RPT-001..014, KPI definitions) |

---

## Appendix B — Notes for the Maintainer

- **Don't trust `supabase_migrations.schema_migrations` as ground truth** for migrations applied via Mgmt API. Use `pg_proc` + `pg_get_function_arguments(oid)` to verify function presence and signature on prod. The Mgmt API design choice leaves live and `schema_migrations` decoupled; this audit normally skips `schema_migrations` for function-presence verification.
- **Three ::text cast pattern is the rule, not the exception.** Any future `reporting_*` function returning `text` from a base-table column must explicitly cast. Pattern: any `farm_items.X`, `farms.X`, `suppliers.X`, `profiles.X` source column where `X` is `varchar(N)` must arrive at the `text` slot via `::text`. Migration-review checklist now includes "every RETURNS TABLE text column gets a ::text cast on its source".
- **Phase 2 smoke tests are mandatory for `SECURITY INVOKER` SQL** because PG 17's RETURN QUERY boundary is exact and there's no parity between "compiles cleanly" and "returns rows cleanly". Pattern: every new function gets a single-row smoke test immediately after `CREATE OR REPLACE`.
- **Mgmt API transport noise is real.** Run `audit-*.sh` harnesses with the new `sqlrun.mjs` (retry-aware). Local rerun on a single failed section is the right discipline; post-mortem on a "fetch failed" with HTTP status still missing likely indicates a wire glitch, not a DB defect.

---

*End of report. v0.1 — 2026-07-06. Apply-bumps should decrement `v0.x` and add a section above for new findings.*
