-- Morvarid-FARM consolidated migration suite (generated from live schema)
-- 004_policies.sql - row-level security enablement + policies

-- ============ ENABLE RLS ============
ALTER TABLE public.daily_voucher_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_feed_formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_formula_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_halls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES ============
CREATE POLICY "daily_voucher_lines_operator_manage" ON public.daily_voucher_lines AS PERMISSIVE FOR ALL USING ((EXISTS ( SELECT 1
   FROM daily_vouchers dv
  WHERE ((dv.id = daily_voucher_lines.voucher_id) AND (dv.farm_id = get_user_farm_id()) AND (get_user_role() = 'operator'::text))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM daily_vouchers dv
  WHERE ((dv.id = daily_voucher_lines.voucher_id) AND (dv.farm_id = get_user_farm_id()) AND (get_user_role() = 'operator'::text)))) OR is_current_user_admin()));
CREATE POLICY "merged_daily_voucher_lines_select" ON public.daily_voucher_lines AS PERMISSIVE FOR SELECT USING (((EXISTS ( SELECT 1
   FROM daily_vouchers v
  WHERE ((v.id = daily_voucher_lines.voucher_id) AND (has_farm_access_v2(v.farm_id) OR is_current_user_admin())))) OR (EXISTS ( SELECT 1
   FROM daily_vouchers dv
  WHERE ((dv.id = daily_voucher_lines.voucher_id) AND (dv.farm_id = get_user_farm_id()))))));
CREATE POLICY "daily_vouchers_manage" ON public.daily_vouchers AS PERMISSIVE FOR ALL USING ((((farm_id = get_user_farm_id()) AND (get_user_role() = 'operator'::text)) OR is_current_user_admin())) WITH CHECK ((((farm_id = get_user_farm_id()) AND (get_user_role() = 'operator'::text)) OR is_current_user_admin()));
CREATE POLICY "daily_vouchers_select" ON public.daily_vouchers AS PERMISSIVE FOR SELECT USING ((has_farm_access_v2(farm_id) OR is_current_user_admin()));
-- Formula writes are admin-only. The app performs all create/update/delete/toggle/duplicate
-- through SECURITY DEFINER rpc_admin_* functions (which guard with is_admin_user()).
-- A previous FOR ALL policy here let supervisors/operators bypass those guards with direct
-- table writes (insert/update/delete) on their own farm. Split into admin-only write policies.
CREATE POLICY "farm_feed_formulas_admin_insert" ON public.farm_feed_formulas AS PERMISSIVE FOR INSERT WITH CHECK (is_current_user_admin());
CREATE POLICY "farm_feed_formulas_admin_update" ON public.farm_feed_formulas AS PERMISSIVE FOR UPDATE USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());
CREATE POLICY "farm_feed_formulas_admin_delete" ON public.farm_feed_formulas AS PERMISSIVE FOR DELETE USING (is_current_user_admin());
CREATE POLICY "merged_farm_feed_formulas_select" ON public.farm_feed_formulas AS PERMISSIVE FOR SELECT USING ((has_farm_access_v2(farm_id) OR is_current_user_admin() OR (farm_id = current_user_farm_id())));
CREATE POLICY "farm_formula_items_select" ON public.farm_formula_items AS PERMISSIVE FOR SELECT USING ((EXISTS ( SELECT 1
   FROM farm_feed_formulas f
  WHERE ((f.id = farm_formula_items.formula_id) AND (has_farm_access_v2(f.farm_id) OR is_current_user_admin())))));
-- Halls are admin-managed (FarmHallsPanel writes directly, admin-only UI; no RPC).
-- The prior FOR ALL policy let supervisors/operators create/edit/delete halls on their
-- own farm via direct table writes. Split into admin-only write policies.
CREATE POLICY "farm_halls_admin_insert" ON public.farm_halls AS PERMISSIVE FOR INSERT WITH CHECK (is_current_user_admin());
CREATE POLICY "farm_halls_admin_update" ON public.farm_halls AS PERMISSIVE FOR UPDATE USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());
CREATE POLICY "farm_halls_admin_delete" ON public.farm_halls AS PERMISSIVE FOR DELETE USING (is_current_user_admin());
CREATE POLICY "farm_halls_select" ON public.farm_halls AS PERMISSIVE FOR SELECT USING ((has_farm_access_v2(farm_id) OR is_current_user_admin() OR (farm_id = get_user_farm_id())));
CREATE POLICY "farm_items_operator_manage" ON public.farm_items AS PERMISSIVE FOR ALL USING (((farm_id = get_user_farm_id()) AND (get_user_role() = 'operator'::text))) WITH CHECK ((((farm_id = get_user_farm_id()) AND (get_user_role() = 'operator'::text)) OR is_current_user_admin()));
CREATE POLICY "merged_farm_items_select" ON public.farm_items AS PERMISSIVE FOR SELECT USING ((has_farm_access_v2(farm_id) OR is_current_user_admin() OR (farm_id = get_user_farm_id())));
CREATE POLICY "farms_admin_all" ON public.farms AS PERMISSIVE FOR ALL USING (is_user_admin(( SELECT auth.uid() AS uid))) WITH CHECK (is_user_admin(( SELECT auth.uid() AS uid)));
CREATE POLICY "merged_farms_select" ON public.farms AS PERMISSIVE FOR SELECT USING ((is_current_user_admin() OR (current_user_farm_id() = id) OR has_farm_access_v2(id) OR (id = current_user_farm_id())));
CREATE POLICY "inputs_delete_admin" ON public.inputs AS PERMISSIVE FOR DELETE USING (is_current_user_admin());
CREATE POLICY "inputs_insert_admin" ON public.inputs AS PERMISSIVE FOR INSERT WITH CHECK (is_current_user_admin());
CREATE POLICY "inputs_select_authenticated" ON public.inputs AS PERMISSIVE FOR SELECT USING ((( SELECT auth.role() AS role) = 'authenticated'::text));
CREATE POLICY "inputs_update_admin" ON public.inputs AS PERMISSIVE FOR UPDATE USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());
-- Inventory transactions: direct writes are the intended design for admin (all
-- mutations) and operator (purchase/transfer inserts). Supervisor is read-only in
-- the UI and must not write. The prior FOR ALL policy let supervisors
-- insert/update/delete on their own farm and let operators update/delete
-- arbitrary rows; replaced with granular, farm-scoped policies. Daily-voucher
-- consumption rows are deleted by the SECURITY DEFINER revert_daily_voucher RPC,
-- so operator direct DELETE is no longer required (delete is admin-only).
CREATE POLICY "inventory_transactions_insert" ON public.inventory_transactions AS PERMISSIVE FOR INSERT WITH CHECK ((is_current_user_admin() OR ((get_user_role() = 'operator'::text) AND (farm_id = get_user_farm_id()))));
CREATE POLICY "inventory_transactions_update" ON public.inventory_transactions AS PERMISSIVE FOR UPDATE USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());
CREATE POLICY "inventory_transactions_delete" ON public.inventory_transactions AS PERMISSIVE FOR DELETE USING (is_current_user_admin());
CREATE POLICY "merged_inventory_transactions_select" ON public.inventory_transactions AS PERMISSIVE FOR SELECT USING (((farm_id = get_user_farm_id()) OR (has_farm_access_v2(farm_id) OR is_current_user_admin())));
CREATE POLICY "admins_delete_profiles" ON public.profiles AS PERMISSIVE FOR DELETE USING (is_user_admin(( SELECT auth.uid() AS uid)));
CREATE POLICY "admins_insert_profiles" ON public.profiles AS PERMISSIVE FOR INSERT WITH CHECK (is_user_admin(( SELECT auth.uid() AS uid)));
CREATE POLICY "profiles_select_self" ON public.profiles AS PERMISSIVE FOR SELECT USING (((id = ( SELECT auth.uid() AS uid)) OR is_current_user_admin()));
CREATE POLICY "profiles_update_self" ON public.profiles AS PERMISSIVE FOR UPDATE USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK (((id = ( SELECT auth.uid() AS uid)) AND ((role)::text = get_user_role()) AND (NOT (farm_id IS DISTINCT FROM current_user_farm_id())) AND (NOT (is_active IS DISTINCT FROM is_self_active()))));
CREATE POLICY "suppliers_select_authenticated" ON public.suppliers AS PERMISSIVE FOR SELECT USING ((( SELECT auth.role() AS role) = 'authenticated'::text));
CREATE POLICY "user_activity_logs_insert_self" ON public.user_activity_logs AS PERMISSIVE FOR INSERT WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "user_activity_logs_select" ON public.user_activity_logs AS PERMISSIVE FOR SELECT USING ((is_user_admin(( SELECT auth.uid() AS uid)) OR (user_id = ( SELECT auth.uid() AS uid))));
