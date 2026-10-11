-- 015_operator_inputs_and_formula_fix.sql
-- 1. Fix formula RPCs to use TEXT for formula_id and item_id (matching table schema from 011)
--    and allow operators to update, delete, toggle, duplicate formulas.

-- Drop old uuid-typed versions to avoid ambiguous function signatures
DROP FUNCTION IF EXISTS public.rpc_admin_update_formula(uuid, text, numeric, boolean, jsonb);
DROP FUNCTION IF EXISTS public.rpc_admin_delete_formula(uuid);
DROP FUNCTION IF EXISTS public.rpc_admin_toggle_formula(uuid);
DROP FUNCTION IF EXISTS public.rpc_admin_duplicate_formula(uuid, integer);
DROP FUNCTION IF EXISTS public.rpc_admin_create_formula(uuid, integer, text, numeric, boolean, jsonb);

-- 1.1 rpc_admin_update_formula (accepts text p_formula_id)
CREATE OR REPLACE FUNCTION public.rpc_admin_update_formula(
  p_formula_id text,
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
      VALUES (p_formula_id, (item->>'item_id')::text, COALESCE((item->>'qty_per_mixer')::numeric, 0));
    END LOOP;
  END IF;
END;
$function$;

-- 1.2 rpc_admin_delete_formula (accepts text p_formula_id)
CREATE OR REPLACE FUNCTION public.rpc_admin_delete_formula(p_formula_id text)
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

-- 1.3 rpc_admin_toggle_formula (accepts text p_formula_id)
CREATE OR REPLACE FUNCTION public.rpc_admin_toggle_formula(p_formula_id text)
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

-- 1.4 rpc_admin_duplicate_formula (accepts text p_source_formula_id)
CREATE OR REPLACE FUNCTION public.rpc_admin_duplicate_formula(p_source_formula_id text, p_new_no integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  fid text;
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

-- 1.5 rpc_admin_create_formula (returns text fid, accepts items as text)
CREATE OR REPLACE FUNCTION public.rpc_admin_create_formula(
  p_farm_id uuid,
  p_formula_no integer,
  p_name text,
  p_mixer_weight numeric,
  p_is_active boolean,
  p_items jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  fid text;
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
      VALUES (fid, (item->>'item_id')::text, COALESCE((item->>'qty_per_mixer')::numeric, 0));
    END LOOP;
  END IF;

  RETURN fid;
END;
$function$;

-- 2. Allow operators to create, update, delete, and toggle inputs
CREATE OR REPLACE FUNCTION public.rpc_admin_create_input(
  p_name text,
  p_category text,
  p_default_unit text,
  p_description text,
  p_is_active boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result uuid;
BEGIN
  IF public.get_user_role() NOT IN ('admin', 'operator') THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  INSERT INTO public.inputs (name, category, default_unit, description, is_active, created_by)
  VALUES (trim(p_name), p_category, COALESCE(NULLIF(trim(p_default_unit),''), 'کیلوگرم'),
          NULLIF(trim(p_description),''), p_is_active, auth.uid())
  RETURNING id INTO result;
  RETURN result;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'نام نهاده قبلاً ثبت شده است';
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_input(
  p_id uuid,
  p_name text,
  p_category text,
  p_default_unit text,
  p_description text,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.get_user_role() NOT IN ('admin', 'operator') THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  UPDATE public.inputs SET
    name = trim(p_name),
    category = p_category,
    default_unit = COALESCE(NULLIF(trim(p_default_unit),''), 'کیلوگرم'),
    description = NULLIF(trim(p_description),''),
    is_active = p_is_active,
    updated_at = now()
  WHERE id = p_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'نام نهاده قبلاً ثبت شده است';
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_input(p_id uuid, p_hard boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  in_use int;
BEGIN
  IF public.get_user_role() NOT IN ('admin', 'operator') THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  IF p_hard THEN
    SELECT COUNT(*) INTO in_use
      FROM public.farm_items fi
      JOIN public.inputs i ON i.name = fi.name
      WHERE i.id = p_id;
    IF in_use > 0 THEN
      RAISE EXCEPTION 'این نهاده توسط % فارم استفاده شده است؛ برای حذف، ابتدا آن را غیرفعال کنید', in_use;
    END IF;
    DELETE FROM public.inputs WHERE id = p_id;
  ELSE
    UPDATE public.inputs SET is_active = false, updated_at = now() WHERE id = p_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_toggle_input(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_active boolean;
BEGIN
  IF public.get_user_role() NOT IN ('admin', 'operator') THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  UPDATE public.inputs
    SET is_active = NOT is_active, updated_at = now()
    WHERE id = p_id
    RETURNING is_active INTO new_active;
  RETURN new_active;
END;
$function$;

-- Update RLS policies on inputs table for operators
DROP POLICY IF EXISTS "inputs_insert_admin" ON public.inputs;
DROP POLICY IF EXISTS "inputs_update_admin" ON public.inputs;
DROP POLICY IF EXISTS "inputs_delete_admin" ON public.inputs;

CREATE POLICY "inputs_insert_manage" ON public.inputs
  FOR INSERT WITH CHECK (is_current_user_admin() OR get_user_role() = 'operator');

CREATE POLICY "inputs_update_manage" ON public.inputs
  FOR UPDATE USING (is_current_user_admin() OR get_user_role() = 'operator')
  WITH CHECK (is_current_user_admin() OR get_user_role() = 'operator');

CREATE POLICY "inputs_delete_manage" ON public.inputs
  FOR DELETE USING (is_current_user_admin() OR get_user_role() = 'operator');

-- Grants
GRANT EXECUTE ON FUNCTION public.rpc_admin_create_formula(uuid,integer,text,numeric,boolean,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_update_formula(text,text,numeric,boolean,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_formula(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_toggle_formula(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_duplicate_formula(text,integer) TO authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_admin_create_input(text,text,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_update_input(uuid,text,text,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_input(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_toggle_input(uuid) TO authenticated;
