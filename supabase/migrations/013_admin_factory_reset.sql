-- 013_admin_factory_reset.sql
-- Factory reset RPC for production/public release readiness.
-- Allows authenticated system administrators (role = 'admin') to safely and atomically
-- wipe all transactional and user-created entities from the database, returning the
-- application to a clean/factory default state without locking out the super-admin.

CREATE OR REPLACE FUNCTION public.admin_factory_reset(
  p_keep_inputs boolean DEFAULT true,
  p_delete_non_admin_users boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role user_role_enum;
  v_caller_id uuid;
  v_deleted_counts jsonb;
  v_count_vouchers bigint := 0;
  v_count_voucher_lines bigint := 0;
  v_count_txns bigint := 0;
  v_count_formulas bigint := 0;
  v_count_formula_items bigint := 0;
  v_count_items bigint := 0;
  v_count_halls bigint := 0;
  v_count_farms bigint := 0;
  v_count_suppliers bigint := 0;
  v_count_users bigint := 0;
  v_count_inputs bigint := 0;
  v_count_logs bigint := 0;
BEGIN
  -- 1. Security Check: Only active 'admin' can execute factory reset!
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: احراز هویت الزامی است.';
  END IF;

  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id AND is_active = true;

  IF v_caller_role IS DISTINCT FROM 'admin'::public.user_role_enum THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: فقط مدیر سیستم می‌تواند پاک‌سازی کارخانه را انجام دهد.';
  END IF;

  -- 2. Count before deletion for detailed audit report
  SELECT count(*) INTO v_count_voucher_lines FROM public.daily_voucher_lines;
  SELECT count(*) INTO v_count_vouchers FROM public.daily_vouchers;
  SELECT count(*) INTO v_count_txns FROM public.inventory_transactions;
  SELECT count(*) INTO v_count_formula_items FROM public.farm_formula_items;
  SELECT count(*) INTO v_count_formulas FROM public.farm_feed_formulas;
  SELECT count(*) INTO v_count_items FROM public.farm_items;
  SELECT count(*) INTO v_count_halls FROM public.farm_halls;
  SELECT count(*) INTO v_count_suppliers FROM public.suppliers;
  SELECT count(*) INTO v_count_logs FROM public.user_activity_logs;
  SELECT count(*) INTO v_count_farms FROM public.farms;

  -- 3. Delete transactional & operational records
  DELETE FROM public.daily_voucher_lines;
  DELETE FROM public.daily_vouchers;
  DELETE FROM public.inventory_transactions;

  -- 4. Delete master farm data
  DELETE FROM public.farm_formula_items;
  DELETE FROM public.farm_feed_formulas;
  DELETE FROM public.farm_items;
  DELETE FROM public.farm_halls;
  DELETE FROM public.suppliers;

  -- 5. Delete activity logs
  DELETE FROM public.user_activity_logs;

  -- 6. Disassociate farm from all profiles
  UPDATE public.profiles SET farm_id = NULL;

  -- 7. Delete farms
  DELETE FROM public.farms;

  -- 8. Delete non-admin users if requested
  IF p_delete_non_admin_users THEN
    SELECT count(*) INTO v_count_users
    FROM public.profiles
    WHERE role <> 'admin'::public.user_role_enum AND id <> v_caller_id;

    -- Delete from auth.users (cascades to profiles)
    DELETE FROM auth.users
    WHERE id IN (
      SELECT id FROM public.profiles
      WHERE role <> 'admin'::public.user_role_enum AND id <> v_caller_id
    );

    -- Also clean up any lingering profile rows
    DELETE FROM public.profiles
    WHERE role <> 'admin'::public.user_role_enum AND id <> v_caller_id;
  END IF;

  -- 9. Optionally delete custom inputs if not keeping inputs
  IF NOT p_keep_inputs THEN
    SELECT count(*) INTO v_count_inputs FROM public.inputs;
    DELETE FROM public.inputs;
  END IF;

  -- 10. Record an audit log for the factory reset itself
  INSERT INTO public.user_activity_logs (
    user_id,
    action,
    resource_type,
    details
  ) VALUES (
    v_caller_id,
    'FACTORY_RESET',
    'system',
    jsonb_build_object(
      'timestamp', now(),
      'performed_by', v_caller_id,
      'vouchers_deleted', v_count_vouchers,
      'transactions_deleted', v_count_txns,
      'farms_deleted', v_count_farms,
      'users_deleted', v_count_users
    )
  );

  v_deleted_counts := jsonb_build_object(
    'vouchers', v_count_vouchers,
    'voucher_lines', v_count_voucher_lines,
    'transactions', v_count_txns,
    'formulas', v_count_formulas,
    'formula_items', v_count_formula_items,
    'items', v_count_items,
    'halls', v_count_halls,
    'farms', v_count_farms,
    'suppliers', v_count_suppliers,
    'users', v_count_users,
    'inputs', v_count_inputs,
    'success', true
  );

  RETURN v_deleted_counts;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_factory_reset(boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_factory_reset(boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_factory_reset(boolean, boolean) TO authenticated;
