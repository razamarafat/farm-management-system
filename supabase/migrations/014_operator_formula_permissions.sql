-- 014_operator_formula_permissions.sql
-- Allow operators to create, update, duplicate, toggle, and delete formulas
-- for farms they have access to.

-- 1. rpc_admin_create_formula
CREATE OR REPLACE FUNCTION public.rpc_admin_create_formula(
  p_farm_id uuid,
  p_formula_no integer,
  p_name text,
  p_mixer_weight numeric,
  p_is_active boolean,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  fid uuid;
  item jsonb;
BEGIN
  IF public.get_user_role() NOT IN ('admin', 'operator') THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  IF NOT public.has_farm_access_v2(p_farm_id) THEN
    RAISE EXCEPTION 'دسترسی به این فارم غیرمجاز است';
  END IF;

  IF EXISTS (SELECT 1 FROM public.farm_feed_formulas
              WHERE farm_id = p_farm_id AND formula_no = p_formula_no) THEN
    RAISE EXCEPTION 'شماره فرمول % قبلاً برای این فارم ثبت شده است', p_formula_no;
  END IF;

  INSERT INTO public.farm_feed_formulas (farm_id, formula_no, name, mixer_weight, is_active)
  VALUES (p_farm_id, p_formula_no, NULLIF(trim(p_name),''), p_mixer_weight, p_is_active)
  RETURNING id INTO fid;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.farm_formula_items (formula_id, item_id, qty_per_mixer)
      VALUES (fid, (item->>'item_id')::uuid, COALESCE((item->>'qty_per_mixer')::numeric, 0));
    END LOOP;
  END IF;

  RETURN fid;
END;
$function$;

-- 2. rpc_admin_update_formula
CREATE OR REPLACE FUNCTION public.rpc_admin_update_formula(
  p_formula_id uuid,
  p_name text,
  p_mixer_weight numeric,
  p_is_active boolean,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item jsonb;
  v_farm_id uuid;
BEGIN
  IF public.get_user_role() NOT IN ('admin', 'operator') THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT farm_id INTO v_farm_id FROM public.farm_feed_formulas WHERE id = p_formula_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'فرمول یافت نشد';
  END IF;

  IF NOT public.has_farm_access_v2(v_farm_id) THEN
    RAISE EXCEPTION 'دسترسی به این فارم غیرمجاز است';
  END IF;

  UPDATE public.farm_feed_formulas SET
    name = NULLIF(trim(p_name),''),
    mixer_weight = p_mixer_weight,
    is_active = p_is_active,
    updated_at = now()
  WHERE id = p_formula_id;

  DELETE FROM public.farm_formula_items WHERE formula_id = p_formula_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.farm_formula_items (formula_id, item_id, qty_per_mixer)
      VALUES (p_formula_id, (item->>'item_id')::uuid, COALESCE((item->>'qty_per_mixer')::numeric, 0));
    END LOOP;
  END IF;
END;
$function$;

-- 3. rpc_admin_delete_formula
CREATE OR REPLACE FUNCTION public.rpc_admin_delete_formula(p_formula_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_farm_id uuid;
BEGIN
  IF public.get_user_role() NOT IN ('admin', 'operator') THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT farm_id INTO v_farm_id FROM public.farm_feed_formulas WHERE id = p_formula_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'فرمول یافت نشد';
  END IF;

  IF NOT public.has_farm_access_v2(v_farm_id) THEN
    RAISE EXCEPTION 'دسترسی به این فارم غیرمجاز است';
  END IF;

  DELETE FROM public.farm_formula_items WHERE formula_id = p_formula_id;
  DELETE FROM public.farm_feed_formulas WHERE id = p_formula_id;
END;
$function$;

-- 4. rpc_admin_toggle_formula
CREATE OR REPLACE FUNCTION public.rpc_admin_toggle_formula(p_formula_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_active boolean;
  v_farm_id uuid;
BEGIN
  IF public.get_user_role() NOT IN ('admin', 'operator') THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT farm_id INTO v_farm_id FROM public.farm_feed_formulas WHERE id = p_formula_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'فرمول یافت نشد';
  END IF;

  IF NOT public.has_farm_access_v2(v_farm_id) THEN
    RAISE EXCEPTION 'دسترسی به این فارم غیرمجاز است';
  END IF;

  UPDATE public.farm_feed_formulas
    SET is_active = NOT is_active, updated_at = now()
    WHERE id = p_formula_id
    RETURNING is_active INTO new_active;
  RETURN new_active;
END;
$function$;

-- 5. rpc_admin_duplicate_formula
CREATE OR REPLACE FUNCTION public.rpc_admin_duplicate_formula(p_source_formula_id uuid, p_new_no integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  fid uuid;
  src_name text;
  src_weight numeric;
  src_active boolean;
  src_farm_id uuid;
  item record;
BEGIN
  IF public.get_user_role() NOT IN ('admin', 'operator') THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT farm_id, name, mixer_weight, is_active INTO src_farm_id, src_name, src_weight, src_active
    FROM public.farm_feed_formulas WHERE id = p_source_formula_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'فرمول مبدأ یافت نشد';
  END IF;

  IF NOT public.has_farm_access_v2(src_farm_id) THEN
    RAISE EXCEPTION 'دسترسی به این فارم غیرمجاز است';
  END IF;

  IF EXISTS (SELECT 1 FROM public.farm_feed_formulas f
              WHERE f.farm_id = src_farm_id AND f.formula_no = p_new_no) THEN
    RAISE EXCEPTION 'شماره فرمول % قبلاً وجود دارد', p_new_no;
  END IF;

  INSERT INTO public.farm_feed_formulas
    (farm_id, formula_no, name, mixer_weight, is_active)
  VALUES
    (src_farm_id, p_new_no, COALESCE(src_name,'') || ' (کپی)', src_weight, true)
  RETURNING id INTO fid;

  FOR item IN SELECT item_id, qty_per_mixer FROM public.farm_formula_items
               WHERE formula_id = p_source_formula_id
  LOOP
    INSERT INTO public.farm_formula_items (formula_id, item_id, qty_per_mixer)
    VALUES (fid, item.item_id, item.qty_per_mixer);
  END LOOP;

  RETURN fid;
END;
$function$;

-- Update RLS policies on farm_feed_formulas for operators
DROP POLICY IF EXISTS "farm_feed_formulas_admin_insert" ON public.farm_feed_formulas;
DROP POLICY IF EXISTS "farm_feed_formulas_admin_update" ON public.farm_feed_formulas;
DROP POLICY IF EXISTS "farm_feed_formulas_admin_delete" ON public.farm_feed_formulas;
DROP POLICY IF EXISTS "farm_feed_formulas_manage" ON public.farm_feed_formulas;

CREATE POLICY "farm_feed_formulas_manage" ON public.farm_feed_formulas
  FOR ALL
  USING (is_current_user_admin() OR (get_user_role() = 'operator' AND has_farm_access_v2(farm_id)))
  WITH CHECK (is_current_user_admin() OR (get_user_role() = 'operator' AND has_farm_access_v2(farm_id)));

-- Grants
GRANT EXECUTE ON FUNCTION public.rpc_admin_create_formula(uuid,integer,text,numeric,boolean,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_update_formula(uuid,text,numeric,boolean,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_formula(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_toggle_formula(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_duplicate_formula(uuid,integer) TO authenticated;
