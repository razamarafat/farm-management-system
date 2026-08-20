-- Morvarid-FARM consolidated migration suite (generated from live schema)
-- 003_triggers.sql - trigger functions + CREATE TRIGGER statements

-- ============ TRIGGER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.enforce_packaging_integer_txn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_category text;
BEGIN
  SELECT category::text INTO v_category FROM public.farm_items WHERE id = NEW.item_id;
  IF v_category = 'packaging' THEN
    IF NEW.qty_in <> floor(NEW.qty_in) OR NEW.qty_out <> floor(NEW.qty_out) THEN
      RAISE EXCEPTION 'مقدار اقلام بسته‌بندی باید عدد صحیح باشد';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_packaging_integer_voucher_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_category text;
BEGIN
  SELECT category::text INTO v_category FROM public.farm_items WHERE id = NEW.item_id;
  IF v_category = 'packaging' THEN
    IF NEW.consumed_qty <> floor(NEW.consumed_qty)
       OR NEW.waste_qty <> floor(NEW.waste_qty)
       OR (NEW.adjustment_qty IS NOT NULL AND NEW.adjustment_qty <> floor(NEW.adjustment_qty)) THEN
      RAISE EXCEPTION 'مقدار اقلام بسته‌بندی باید عدد صحیح باشد';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_unit_type_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_class text;
  v_new_class text;
  v_has_records boolean;
BEGIN
  IF OLD.unit IS NOT DISTINCT FROM NEW.unit THEN
    RETURN NEW;
  END IF;

  v_old_class := public.unit_class(OLD.unit);
  v_new_class := public.unit_class(NEW.unit);

  IF v_old_class <> v_new_class THEN
    SELECT EXISTS (SELECT 1 FROM public.inventory_transactions WHERE item_id = NEW.id)
        OR EXISTS (SELECT 1 FROM public.daily_voucher_lines WHERE item_id = NEW.id)
      INTO v_has_records;

    IF v_has_records THEN
      RAISE EXCEPTION 'امکان تغییر واحد آیتم «%» به دلیل وجود سوابق موجودی وجود ندارد', NEW.name;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_username TEXT;
BEGIN
  v_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    NULLIF(split_part(NEW.email, '@', 1), '')
  );

  INSERT INTO public.profiles (id, role, username)
  VALUES (NEW.id, 'operator', v_username);

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_inputs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- ============ TRIGGERS (public schema tables) ============
CREATE TRIGGER trg_voucher_line_packaging_integer BEFORE INSERT OR UPDATE ON public.daily_voucher_lines FOR EACH ROW EXECUTE FUNCTION enforce_packaging_integer_voucher_line();
CREATE TRIGGER trigger_daily_voucher_lines_updated BEFORE UPDATE ON public.daily_voucher_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_daily_vouchers_updated BEFORE UPDATE ON public.daily_vouchers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_farm_items_unit_type_consistency BEFORE UPDATE OF unit ON public.farm_items FOR EACH ROW EXECUTE FUNCTION enforce_unit_type_consistency();
CREATE TRIGGER trigger_farm_items_updated BEFORE UPDATE ON public.farm_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_farms_updated BEFORE UPDATE ON public.farms FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_inputs_updated_at BEFORE UPDATE ON public.inputs FOR EACH ROW EXECUTE FUNCTION update_inputs_updated_at();
CREATE TRIGGER trg_inventory_txn_packaging_integer BEFORE INSERT OR UPDATE ON public.inventory_transactions FOR EACH ROW EXECUTE FUNCTION enforce_packaging_integer_txn();
CREATE TRIGGER trigger_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============ TRIGGER ON auth.users (cross-schema) ============
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
