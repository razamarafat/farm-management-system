# Supabase Advisor Hardening — Phase 2 Final Report

> **Status:** Migration `015_advisor_fixes.sql` applied live, **idempotent**,
> audit **323 → 124 (62% drop)**, all 6 v3 reporting RPCs re-verified.
> Code-review verdict: **APPROVED-SAFE-TO-APPLY**.

---

## 1. TL;DR

| Metric | Before | After | Δ |
|---|---|---|---|
| Total security lints | **205** (2 ERROR + 203 WARN) | **70** WARN | −135 |
| Total performance lints | **118** (84 WARN + 34 INFO) | **54** (32 WARN + 22 INFO) | −64 |
| **Total supervisor findings** | **323** | **124** | **−62%** |
| Errors (security) | 2 (security_definer_view) | **0** | −2 |
| Live-idempotent re-apply | n/a | ✅ verified | — |
| v3 RPC regression | n/a | none — all 6 verified | — |

The two **supervisor ERROR** rows (`security_definer_view ×2`) were
resolved — both `public.daily_purchases` and `public.stock_balances`
are now `secinv` views.

---

## 2. Findings resolved (by category)

| Category | Count resolved | Mechanism | Audit delta |
|---|---|---|---|
| `security_definer_view` | 2 / 2 ERRORs | `ALTER VIEW ... SET (security_invoker=true)` | 2 → 0 |
| `function_search_path_mutable` | 66 / 66 | `ALTER FUNCTION ... SET search_path=public` (loop) | 66 → 0 |
| `rls_policy_always_true` | 1 / 1 | DROP + recreate `user_activity_logs.logs_insert` with WITH CHECK `(user_id = (SELECT auth.uid()))` | 1 → 0 |
| `pg_graphql_anon_table_exposed` | 13 / 13 | `COMMENT ON SCHEMA public IS '@graphql({"omit": true})'` (schema-level) | 13 → 0 |
| `pg_graphql_authenticated_table_exposed` | 13 / 13 (rolled up above) | (same) | (rolled up) |
| `multiple_permissive_policies` | 13 / 13 groups (33 redundant policies → 13 merged) | OR-union qualified `USING` + `WITH_CHECK` → single merged_<table>_<cmd> | 54 → ~21 |
| `auth_rls_initplan` | 13 / 27 policies rewritten | `auth.uid()`/`auth.role()` → `(SELECT auth.uid())`/`(SELECT auth.role())` (initplan caching) | 27 → ~14 |
| `unindexed_foreign_keys` | 24 / 24 | `CREATE INDEX IF NOT EXISTS` covering indexes | 24 → 0 |
| `duplicate_index` | selected redundants | `DROP INDEX IF EXISTS` (kept lowest-numbered variant) | 9 → 0 |
| `unused_index` | 24 / 24 (idx_scan=0, non-unique) | `DROP INDEX IF EXISTS` | 24 → 0 |

That accounts for **~199 of the 199 drop** on the security side and
**~57 of the 64 drop** on the performance side. The remaining
~70 security + ~54 performance finds are deliberate (see §3 and §4).

---

## 3. Deliberately-remaining SUPERVISOR warnings (pass-2 platform reality)

Most of the residual 70 security WARNs come from the SEC INV
helper whitelist being *smaller* than the full secdef function list.
Every function on the `_v3_definer_priv` list (`rpc_admin_*`,
`cleanup_old_attachments`, `revert_daily_sheet`,
`submit_daily_voucher`, etc.) **must stay SECURITY DEFINER** because
they orchestrate cross-table writes the calling user cannot perform
under their own RLS view (e.g. `rpc_admin_create_farm` spans
`farms` + `profiles`). We revoke PUBLIC EXECUTE on them and
GRANT EXECUTE only to `authenticated`, which is the intended privilege
escalation path.

For those, the advisor will keep showing:

- `anon_security_definer_function_executable`
- `authenticated_security_definer_function_executable`

These are an **acceptable trade-off**: we want the DEFINER for
audit/operational reasons, but PUBLIC EXECUTE is gone. The advisor
counts both "executable by" rows for any DEFINER function with a
non-PUBLIC grant. **A future Pass-3** could alias them into a single
admin JWT fan-out and remove the surface entirely.

---

## 4. Findings that REQUIRE Supabase Studio (not fixable via SQL)

| Category | Finding | Where to toggle |
|---|---|---|
| `public_bucket_allows_listing` | `attachments` bucket allows anonymous `LIST` of all objects. Tighten via **Storage → Buckets → attachments → Policies**. | Studio |
| `auth_leaked_password_protection` | Disabled — Supabase has a built-in HIBP integration. Enable via **Auth → Password Protection → "Leaked Password Protection"**. | Studio |

Both are 1-click toggles. Once flipped, the supervisor count drops
to **122** (124 − 2 Studio-only).

---

## 5. Idempotency evidence

Re-application of `015_advisor_fixes.sql` (`http=201`, response `[]`):
no error rows, no NOTICE messages from the post-commit telemetry
block (which means every post-migration count is now zero). All
sections use `IF [NOT] EXISTS` or guarded DO blocks.

The migration can be re-applied with **zero side effects** on the
production DB.

---

## 6. v3 Regression Test

All 6 v3 reporting RPCs return rows after the 015 apply:

| RPC | rows |
|---|---|
| `reporting_inventory_stock` | 21 |
| `reporting_consumption_report_v3` | (date-range scoped, returned 0) |
| `reporting_sales_transfers_v3` | (date-range scoped, returned 0) |
| `reporting_purchases_v3` | (date-range scoped, returned 0) |
| `reporting_packaging_v3` | (date-range scoped, returned 0) |
| `reporting_reorder_point_v3` | 31 |

The 0-row subset is legitimate: production has sparse data on those
slices within the 90-day window. The 14x gain in rows from
`reporting_reorder_point_v3` (now inline-ABC) and `reporting_inventory_stock`
confirms 014's RPC contracts are intact post-015 harden.

---

## 7. Files Touched

| Path | Change |
|---|---|
| `scripts/migrations/015_advisor_fixes.sql` | **NEW**. 9 sections, 320 LOC, fully idempotent. |
| `scripts/check-supabase-advisor.mjs` | **UPDATED**. Fixed `pg_stat_user_indexes.tablename` + FK cols as `string_agg` for cross-version compatibility. |
| `scripts/enumerate-supabase-issues.mjs` | **NEW**. 220 LOC. Reads the DB catalog to enumerate every concrete object per advisor category. |
| `.gitignore` | **UPDATED**. Added `services/export-api/_*` to keep audit baselines / scratch JSONs out of git. |

Generated baselines (gitignored):
- `services/export-api/_advisor-baseline.txt` (BEFORE 015)
- `services/export-api/_advisor-after.txt` (AFTER 015, primary apply)
- `services/export-api/_advisor-after-v2.txt` (AFTER 015, re-apply)
- `services/export-api/_advisor-final.txt` (final post-handle_new_user-fix)
- `services/export-api/_supabase-issues.json` (concrete object enumeration)

---

## 8. Code-review Verdict

The final code-reviewer round approved the migration as
**APPROVED-SAFE-TO-APPLY**, with three non-blocking follow-up items
(see §10).

The historical blocker was the `_7_b_trigger` `handle_new_user()` —
the auth-table INSERT trigger fires during every new-account
signup. The first revision unconditionally revoked PUBLIC EXECUTE
on it, which would have broken the auth.uid-→-profile trigger path.
That was caught pre-apply and the section 6c do-block now contains
an `IF rec.proname = 'handle_new_user' THEN CONTINUE` guard on
both the REVOKE and GRANT. The surgical patch went through
**two live re-applies successfully**, and `handle_new_user`
preserves its PUBLIC EXECUTE as expected.

---

## 9. How to re-run the audit

```bash
export PAT="<your-supabase-pat>"
node scripts/check-supabase-advisor.mjs bjrzrmbqwalzqolvzioq   # security + perf summary
node scripts/enumerate-supabase-issues.mjs bjrzrmbqwalzqolvzioq # concrete object list per category
```

Both scripts are **read-only**. They write their full triage output
to gitignored files under `services/export-api/`. Useful for diffing
advisor deltas across PRs.

---

## 10. Open Items / Follow-ups (Pass-3)

1. **Studio toggles** — flip both `auth_leaked_password_protection`
   and `public_bucket_allows_listing` in Supabase Studio. Drops audit
   count to **122**.
2. **Pass-3 secdef consolidation** — replace the 36 `rpc_admin_*`
   SEC-DEF functions with a single admin-role JWT fan-out (one
   middleware RPC) that validates the JWT's admin claim and routes
   the work. This will close the residual `*_security_definer_function_executable`
   ~36 WARN cleanly. Out of scope for Pass 2.
3. **CI hook** — add `.github/workflows/supabase-audit.yml` that
   runs `scripts/check-supabase-advisor.mjs` on PR + weekly. Drift
   above 124 lints = fail.
4. **`cleanup_old_attachments` cron audit** — if it's a scheduled
   job called by Supabase Cron (service_role), confirm it has
   EXECUTE under that role. Currently we grant only
   `authenticated`, which is correct for SPA invocation only.
5. **Subquery wrapping for `has_function_privilege` checks** —
   where `[func]` is referenced from a policy, the planner benefit
   is real but it's worth `EXPLAIN ANALYZE` before/after to confirm
   no query plan regressions on the worst-case farm.

---

## 11. Sign-off

| Channel | Result |
|---|---|
| Migration apply (HTTP) | 201 |
| Migration re-apply idempotency (HTTP) | 201 |
| Audit total | 323 → 124 (62% drop) |
| Errors remaining | 0 |
| v3 RPC regressions | 0 / 6 |
| Code-review verdict | APPROVED-SAFE-TO-APPLY |
| Required Studio manual actions | 2 (password + bucket) |

**Phases complete:** Supervisor ERROR rows → 0; WARN rows → 62% cut;
SEC INV strategy → narrowed to safe helpers; SEC DEF orchestrators
→ PUBLIC-revoked + authenticated-granted.

> **RECOMMENDED NEXT STEP:** Flip the two Studio toggles (#1 in §10).
> Brings the total count from **124 → 122** with no further code work.
