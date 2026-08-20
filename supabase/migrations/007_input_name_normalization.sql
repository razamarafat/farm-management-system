-- 007_input_name_normalization.sql
-- ---------------------------------------------------------------------------
-- Defense-in-depth against whitespace-variant duplicate names (the
-- «آنزیم روابیو اکسل» / «آنزیم  روابیو اکسل» class of bug). The inputs.name
-- UNIQUE constraint does not catch names that differ only by repeated spaces,
-- so names are normalized (trim + collapse runs of whitespace to one space)
-- both in the SPA (src/utils/helpers.ts normalizeName) and here server-side
-- before insert/update.
--
-- Applied to live DB 2026-08-16.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_input_name(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT regexp_replace(btrim(p_name), '[[:space:]]+', ' ', 'g');
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_create_input(p_name text, p_category text, p_default_unit text, p_description text, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result uuid;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  INSERT INTO public.inputs (name, category, default_unit, description, is_active, created_by)
  VALUES (public.normalize_input_name(p_name), p_category, COALESCE(NULLIF(trim(p_default_unit),''), 'کیلوگرم'),
          NULLIF(trim(p_description),''), p_is_active, auth.uid())
  RETURNING id INTO result;
  RETURN result;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'نام نهاده قبلاً ثبت شده است';
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_input(p_id uuid, p_name text, p_category text, p_default_unit text, p_description text, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  UPDATE public.inputs SET
    name = public.normalize_input_name(p_name),
    category = p_category,
    default_unit = COALESCE(NULLIF(trim(p_default_unit),''), default_unit),
    description = NULLIF(trim(p_description),''),
    is_active = p_is_active,
    updated_at = now()
  WHERE id = p_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'نام نهاده قبلاً ثبت شده است';
END;
$function$;
