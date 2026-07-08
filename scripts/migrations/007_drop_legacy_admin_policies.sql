-- =====================================================================
-- migration: 007_drop_legacy_admin_policies.sql
--
-- Purpose  : Drop every overbroad legacy RLS policy that the live
--            Morvarid-FARM DB still carries, so the new farm-scoped
--            policies shipped in 004 (plus 005 and 006) actually
--            restrict access instead of being OR'd alongside the old
--            admin-allow-all from earlier lives.
--
-- Scope (cross-walked against pg_policies on the live DB):
--   * The nine *_admin_all / _admin_read names the team explicitly
--     called out:
--       farms_admin_all, farm_items_admin_all,
--       daily_vouchers_admin_all,
--       inv_txn_admin_all,
--       profiles_admin_all,
--       logs_admin_read,
--       halls_admin, formulas_admin, formula_items_admin.
--   * Plus three legacy entries the live probe surfaced:
--       daily_voucher_lines_admin_all       — same broom as
--                                             daily_vouchers_admin_all,
--                                             not in user's text but
--                                             strictly analogous.
--       inventory_transactions."Allow all access to transactions"
--                                           — cmd=ALL, roles=anon /
--                                             authenticated. Wider than
--                                             inv_txn_admin_all.
--       suppliers."Allow all access to authenticated users"
--                                           — cmd=ALL, roles=anon /
--                                             authenticated. Wider than
--                                             suppliers_select_authenticated.
--
-- Cross-walk (every dropped policy has a 004/005/006 replacement
-- already in pg_policies on the live DB):
--   farms                       -> farms_select_admin_or_staff             ✓
--   farm_items                  -> farm_items_select_farm_access           ✓
--   farm_halls                  -> farm_halls_select_farm_access           ✓
--   farm_feed_formulas          -> farm_feed_formulas_select_farm_access   ✓
--   farm_formula_items          -> farm_formula_items_select_farm_access   ✓
--   daily_vouchers              -> daily_vouchers_select_farm_access       ✓
--   daily_voucher_lines         -> daily_voucher_lines_select_farm_access  ✓
--   inventory_transactions      -> inventory_txn_select_farm_access        ✓
--   profiles                    -> profiles_select_self                    ✓
--   user_activity_logs          -> user_activity_logs_select_admin         ✓
--   inputs                      -> inputs_select_authenticated             ✓
--   suppliers                   -> suppliers_select_authenticated          ✓
--   farm_staff                  -> farm_staff_select_self_or_admin         ✓
--
-- Idempotency: every DROP is `DROP POLICY IF EXISTS` keyed on the
-- exact legacy policy name. Re-apply is a no-op once the policies
-- are gone.
--
-- Transactionality: this whole file is intended to run inside a
-- single BEGIN; ... COMMIT; so a failure at any DROP rolls back the
-- whole cleanup. The Management API call wraps the file in a
-- transaction at submission time.
--
-- Why explicit-per-name (not a wildcard sweep):
--   Wildcard DROP patterns (DROP POLICY IF EXISTS '%_admin_all')
--   would also drop the new policies we just authored if any of
--   them share the suffix. The 004 replacements are intentionally
--   named *_select_* so they don't collide. To stay defensive
--   against future renames, include explicit per-name drops so the
--   intent is reviewable from the file alone.
-- =====================================================================

-- ---------- farms -----------------------------------------------------
DROP POLICY IF EXISTS "farms_admin_all"                     ON public.farms;

-- ---------- farm_items ------------------------------------------------
DROP POLICY IF EXISTS "farm_items_admin_all"                ON public.farm_items;

-- ---------- farm_halls ------------------------------------------------
DROP POLICY IF EXISTS "halls_admin"                         ON public.farm_halls;

-- ---------- farm_feed_formulas ----------------------------------------
DROP POLICY IF EXISTS "formulas_admin"                      ON public.farm_feed_formulas;

-- ---------- farm_formula_items ----------------------------------------
DROP POLICY IF EXISTS "formula_items_admin"                 ON public.farm_formula_items;

-- ---------- daily_vouchers + daily_voucher_lines ---------------------
DROP POLICY IF EXISTS "daily_vouchers_admin_all"            ON public.daily_vouchers;
DROP POLICY IF EXISTS "daily_voucher_lines_admin_all"       ON public.daily_voucher_lines;

-- ---------- inventory_transactions ------------------------------------
-- Two drops: the explicit admin_all the user named AND the broader
-- anon/authenticated ALL that the live probe surfaced.
DROP POLICY IF EXISTS "inv_txn_admin_all"                    ON public.inventory_transactions;
DROP POLICY IF EXISTS "Allow all access to transactions"    ON public.inventory_transactions;

-- ---------- profiles --------------------------------------------------
DROP POLICY IF EXISTS "profiles_admin_all"                  ON public.profiles;

-- ---------- user_activity_logs ----------------------------------------
DROP POLICY IF EXISTS "logs_admin_read"                     ON public.user_activity_logs;

-- ---------- inputs ---------------------------------------------------
-- (No legacy admin_all target was named by the team on inputs; the
--  001/004/006 "inputs_select_authenticated" policy is the
--  intentional authenticated-read grant and stays in place.)

-- ---------- suppliers -------------------------------------------------
-- Two drops: the supplier-side broader anon/authenticated ALL the
-- live probe surfaced. suppliers_select_authenticated (per 004/006)
-- remains in place.
DROP POLICY IF EXISTS "Allow all access to authenticated users" ON public.suppliers;

-- ---------- farm_staff ------------------------------------------------
-- (No legacy policy on farm_staff was reported in pg_policies; the
--  table is new (006). The 006 four policies are the only ones.)

-- =====================================================================
-- Post-drop expectation
-- =====================================================================
-- Announcement only — no DDL.
-- After this commit + apply, every table's effective RLS state should
-- match the policies shipped in 003/004/005/006. No policy name
-- collision remains. Non-admin reads are now governed by the
-- `*_select_*` farm-scoped predicates (and the explicit SELF-OR-ADMIN
-- predicates for profiles, user_activity_logs, farm_staff).
--
-- If you want to add a manual sanity check outside this migration:
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE schemaname='public'
--      AND tablename IN ('farms','farm_items','farm_halls',
--                        'farm_feed_formulas','farm_formula_items',
--                        'daily_vouchers','daily_voucher_lines',
--                        'inventory_transactions','profiles',
--                        'user_activity_logs','inputs','suppliers',
--                        'farm_staff')
--    ORDER BY tablename, policyname;
-- Expected: only the *_select_* / *_admin (narrow 004/006) names.
-- =====================================================================
