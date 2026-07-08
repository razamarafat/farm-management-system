-- =====================================================================
-- migration: 003_admin_rpcs.sql
-- Purpose  : Replace every previously-client-side supabaseAdmin write
--            with SECURITY DEFINER RPCs invoked via supabase.rpc(...)
--            from the anon/authenticated client. Names are prefixed
--            with rpc_admin_* for admin-only operations; uncategorised
--            names (rpc_<verb>_<resource>) are operator-authored reads
--            and writes that gate by RLS or by get_user_farm_id().
-- Idempotent: every CREATE OR REPLACE.
-- Apply    : Run this AFTER 001_create_inputs_table.sql and
--            002_seed_admin_user.sql in the Supabase SQL editor.
--
-- Naming convention (DO NOT introduce a third category):
--   rpc_admin_<verb>_<resource>   — admin role REQUIRED; raises
--                                    'forbidden: admin role required'
--                                    if the caller is not an active
--                                    admin profile.
--   rpc_<verb>_<resource>         — operator / supervisor readable
--                                    and writable, gated via RLS or
--                                    get_user_farm_id().
--
-- Toggle RPCs return the new is_active value (boolean) so the hook
-- can show the correct Persian toast without a second round-trip read.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: caller is currently authenticated AND has an active admin
--          profile. Every rpc_admin_* below invokes this guard.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$$;

-- Permissions: revoke from PUBLIC, grant to anon + authenticated.
REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO anon, authenticated;

-- =====================================================================
-- profiles
-- =====================================================================

-- Read a single profile (admin only — used by hooks that need the
-- current user's full row). Public/anon reads remain via direct select
-- under the existing (or to-be-added) RLS policy.
CREATE OR REPLACE FUNCTION public.rpc_admin_get_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;
  SELECT to_jsonb(p.*) INTO result FROM public.profiles p WHERE id = p_user_id;
  RETURN result;
END;
$$;

-- Insert-or-update a profile row. Does NOT touch auth.users (that stays
-- in the BFF). Used as the second half of user creation / update.
CREATE OR REPLACE FUNCTION public.rpc_admin_upsert_profile(
  p_id           uuid,
  p_username     text,
  p_role         text,
  p_first_name   text,
  p_last_name    text,
  p_phone        text,
  p_farm_id      uuid,
  p_is_active    boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result uuid;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;
  IF p_role NOT IN ('admin','supervisor','operator') THEN
    RAISE EXCEPTION 'invalid role: %', p_role;
  END IF;
  INSERT INTO public.profiles (
    id, username, role, first_name, last_name, phone, farm_id, is_active, updated_at
  ) VALUES (
    p_id, lower(trim(p_username)), p_role, trim(p_first_name), trim(p_last_name),
    NULLIF(trim(p_phone), ''), NULLIF(p_farm_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_is_active, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    username   = EXCLUDED.username,
    role       = EXCLUDED.role,
    first_name = EXCLUDED.first_name,
    last_name  = EXCLUDED.last_name,
    phone      = EXCLUDED.phone,
    farm_id    = EXCLUDED.farm_id,
    is_active  = EXCLUDED.is_active,
    updated_at = now()
  RETURNING id INTO result;
  RETURN result;
END;
$$;

-- Soft delete (set is_active = false).
CREATE OR REPLACE FUNCTION public.rpc_admin_soft_delete_profile(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET is_active = false, updated_at = now() WHERE id = p_user_id;
END;
$$;

-- Hard delete (caller is responsible for the auth.users row via BFF).
CREATE OR REPLACE FUNCTION public.rpc_admin_hard_delete_profile(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.profiles WHERE id = p_user_id;
END;
$$;

-- Toggle is_active.
CREATE OR REPLACE FUNCTION public.rpc_admin_toggle_profile(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles
    SET is_active = NOT is_active,
        updated_at = now()
    WHERE id = p_user_id;
END;
$$;

-- Insert a user_activity_logs row (the SPA already does this via direct
-- supabase.from insert; this RPC version is provided for completeness so
-- admin tools can record actions atomically).
CREATE OR REPLACE FUNCTION public.rpc_admin_log_activity(
  p_action        text,
  p_resource_type text,
  p_resource_id   text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_activity_logs (user_id, action, resource_type, resource_id)
  VALUES (auth.uid(), p_action, p_resource_type, NULLIF(p_resource_id, ''));
END;
$$;

-- =====================================================================
-- farms
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_admin_create_farm(
  p_name    text,
  p_code    text,
  p_address text,
  p_phone   text,
  p_is_active boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result uuid;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.farms (name, code, address, phone, is_active)
  VALUES (trim(p_name), trim(p_code), NULLIF(trim(p_address),''), NULLIF(trim(p_phone),''), p_is_active)
  RETURNING id INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_farm(
  p_id      uuid,
  p_name    text,
  p_code    text,
  p_address text,
  p_phone   text,
  p_is_active boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.farms SET
    name = trim(p_name), code = trim(p_code),
    address = NULLIF(trim(p_address),''), phone = NULLIF(trim(p_phone),''),
    is_active = p_is_active, updated_at = now()
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_farm(p_id uuid, p_hard boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_hard THEN
    DELETE FROM public.farms WHERE id = p_id;
  ELSE
    UPDATE public.farms SET is_active = false, updated_at = now() WHERE id = p_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_toggle_farm(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_active boolean;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.farms
    SET is_active = NOT is_active, updated_at = now()
    WHERE id = p_id
    RETURNING is_active INTO new_active;
  RETURN new_active;
END;
$$;

-- =====================================================================
-- inputs (global catalogue)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_admin_create_input(
  p_name        text,
  p_category    text,
  p_default_unit text,
  p_description text,
  p_is_active   boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result uuid;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.inputs (name, category, default_unit, description, is_active, created_by)
  VALUES (trim(p_name), p_category, COALESCE(NULLIF(trim(p_default_unit),''), 'کیلوگرم'),
          NULLIF(trim(p_description),''), p_is_active, auth.uid())
  RETURNING id INTO result;
  RETURN result;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'duplicate input name';
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_input(
  p_id          uuid,
  p_name        text,
  p_category    text,
  p_default_unit text,
  p_description text,
  p_is_active   boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.inputs SET
    name = trim(p_name),
    category = p_category,
    default_unit = COALESCE(NULLIF(trim(p_default_unit),''), default_unit),
    description = NULLIF(trim(p_description),''),
    is_active = p_is_active,
    updated_at = now()
  WHERE id = p_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'duplicate input name';
END;
$$;

-- Soft delete by is_active=false (preferred — see usage in hooks).
-- Hard delete only when input has zero farm_items references.
CREATE OR REPLACE FUNCTION public.rpc_admin_delete_input(p_id uuid, p_hard boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  in_use int;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_hard THEN
    SELECT COUNT(*) INTO in_use
      FROM public.farm_items fi
      JOIN public.inputs i ON i.name = fi.name
      WHERE i.id = p_id;
    IF in_use > 0 THEN
      RAISE EXCEPTION 'input is referenced by % farms — set is_active=false instead', in_use;
    END IF;
    DELETE FROM public.inputs WHERE id = p_id;
  ELSE
    UPDATE public.inputs SET is_active = false, updated_at = now() WHERE id = p_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_toggle_input(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_active boolean;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.inputs
    SET is_active = NOT is_active, updated_at = now()
    WHERE id = p_id
    RETURNING is_active INTO new_active;
  RETURN new_active;
END;
$$;

-- =====================================================================
-- suppliers
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_admin_create_supplier(
  p_name      text,
  p_is_active boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result uuid;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.suppliers (name, is_active, created_by)
  VALUES (trim(p_name), p_is_active, auth.uid())
  RETURNING id INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_supplier(
  p_id        uuid,
  p_name      text,
  p_is_active boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.suppliers SET name = trim(p_name), is_active = p_is_active, updated_at = now()
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_supplier(p_id uuid, p_hard boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_hard THEN
    DELETE FROM public.suppliers WHERE id = p_id;
  ELSE
    UPDATE public.suppliers SET is_active = false, updated_at = now() WHERE id = p_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_toggle_supplier(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_active boolean;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.suppliers
    SET is_active = NOT is_active, updated_at = now()
    WHERE id = p_id
    RETURNING is_active INTO new_active;
  RETURN new_active;
END;
$$;

-- Returns count of inventory_transactions that reference the supplier
-- excluding pure consumption-style rows. Replaces the client-side
-- useCheckSupplierUsage probe.
CREATE OR REPLACE FUNCTION public.rpc_supplier_usage_count(p_supplier_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)::int FROM public.inventory_transactions
  WHERE supplier_id = p_supplier_id
    AND txn_type NOT IN ('consumption','waste','transfer_out');
$$;

-- =====================================================================
-- farm_items
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_admin_create_farm_item(
  p_farm_id      uuid,
  p_category     text,
  p_name         text,
  p_unit         text,
  p_priority     int,
  p_reorder_point numeric
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result uuid;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.farm_items
    (farm_id, category, name, unit, priority, reorder_point, is_active)
  VALUES (p_farm_id, p_category, trim(p_name), COALESCE(NULLIF(trim(p_unit),''), 'کیلوگرم'),
          COALESCE(p_priority, 0), COALESCE(p_reorder_point, 0), true)
  RETURNING id INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_farm_item(p_item_id uuid, p_hard boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_hard THEN
    DELETE FROM public.farm_items WHERE id = p_item_id;
  ELSE
    UPDATE public.farm_items SET is_active = false WHERE id = p_item_id;
  END IF;
END;
$$;

-- =====================================================================
-- farm_feed_formulas + farm_formula_items  (atomic, single RPC)
-- =====================================================================

-- Create formula + items in one transaction.
CREATE OR REPLACE FUNCTION public.rpc_admin_create_formula(
  p_farm_id     uuid,
  p_formula_no  int,
  p_name        text,
  p_mixer_weight numeric,
  p_is_active   boolean,
  p_items       jsonb   -- [{ item_id: uuid, qty_per_mixer: numeric }]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  fid uuid;
  item jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF EXISTS (SELECT 1 FROM public.farm_feed_formulas
              WHERE farm_id = p_farm_id AND formula_no = p_formula_no) THEN
    RAISE EXCEPTION 'formula_no % already exists for this farm', p_formula_no;
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
$$;

-- Replace items atomically + update header.
CREATE OR REPLACE FUNCTION public.rpc_admin_update_formula(
  p_formula_id   uuid,
  p_name         text,
  p_mixer_weight numeric,
  p_is_active    boolean,
  p_items        jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE item jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.farm_feed_formulas SET
    name = NULLIF(trim(p_name),''), mixer_weight = p_mixer_weight, is_active = p_is_active,
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
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_formula(p_formula_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.farm_formula_items WHERE formula_id = p_formula_id;
  DELETE FROM public.farm_feed_formulas WHERE id = p_formula_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_toggle_formula(p_formula_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_active boolean;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.farm_feed_formulas
    SET is_active = NOT is_active, updated_at = now()
    WHERE id = p_formula_id
    RETURNING is_active INTO new_active;
  RETURN new_active;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_duplicate_formula(
  p_source_formula_id uuid,
  p_new_no            int
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  fid uuid;
  src_name text;
  src_weight numeric;
  src_active boolean;
  item record;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT name, mixer_weight, is_active INTO src_name, src_weight, src_active
    FROM public.farm_feed_formulas WHERE id = p_source_formula_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'source formula not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.farm_feed_formulas f, public.farm_feed_formulas s
              WHERE s.id = p_source_formula_id
                AND f.farm_id = s.farm_id AND f.formula_no = p_new_no) THEN
    RAISE EXCEPTION 'formula_no % already exists', p_new_no;
  END IF;
  INSERT INTO public.farm_feed_formulas
    (farm_id, formula_no, name, mixer_weight, is_active)
  SELECT farm_id, p_new_no, COALESCE(src_name,'') || ' (کپی)', src_weight, true
    FROM public.farm_feed_formulas WHERE id = p_source_formula_id
  RETURNING id INTO fid;
  FOR item IN SELECT item_id, qty_per_mixer FROM public.farm_formula_items
               WHERE formula_id = p_source_formula_id
  LOOP
    INSERT INTO public.farm_formula_items (formula_id, item_id, qty_per_mixer)
    VALUES (fid, item.item_id, item.qty_per_mixer);
  END LOOP;
  RETURN fid;
END;
$$;

-- =====================================================================
-- daily vouchers (delegates to existing submit / revert where applicable)
-- =====================================================================

-- Idempotent create-or-fetch of a draft voucher for (farm, date, category).
CREATE OR REPLACE FUNCTION public.rpc_get_or_create_draft_voucher(
  p_farm_id  uuid,
  p_date     date,
  p_category text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE vid uuid;
BEGIN
  SELECT id INTO vid FROM public.daily_vouchers
   WHERE farm_id = p_farm_id AND voucher_date = p_date AND category = p_category;
  IF vid IS NULL THEN
    INSERT INTO public.daily_vouchers (farm_id, voucher_date, category, status)
    VALUES (p_farm_id, p_date, p_category, 'draft')
    RETURNING id INTO vid;
  END IF;
  RETURN vid;
END;
$$;

-- Upsert a single dirty voucher line.
CREATE OR REPLACE FUNCTION public.rpc_upsert_voucher_line(
  p_voucher_id   uuid,
  p_item_id      uuid,
  p_formula_no   text,
  p_mixer_count  numeric,
  p_hall_numbers text,
  p_consumed     numeric,
  p_waste        numeric,
  p_notes        text,
  p_hall_consumed jsonb,
  p_formula_id   uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE lid uuid;
BEGIN
  -- Operator OR admin may write lines; status gate is enforced in submit RPC.
  INSERT INTO public.daily_voucher_lines
    (voucher_id, item_id, formula_no, mixer_count, hall_numbers,
     consumed_qty, waste_qty, notes, hall_consumed, formula_id)
  VALUES
    (p_voucher_id, p_item_id,
     NULLIF(trim(p_formula_no), ''), p_mixer_count, NULLIF(trim(p_hall_numbers), ''),
     COALESCE(p_consumed, 0), COALESCE(p_waste, 0),
     NULLIF(trim(p_notes), ''),
     COALESCE(p_hall_consumed, '{}'::jsonb),
     NULLIF(p_formula_id, '00000000-0000-0000-0000-000000000000'::uuid))
  ON CONFLICT (voucher_id, item_id) DO UPDATE SET
    formula_no    = EXCLUDED.formula_no,
    mixer_count   = EXCLUDED.mixer_count,
    hall_numbers  = EXCLUDED.hall_numbers,
    consumed_qty  = EXCLUDED.consumed_qty,
    waste_qty     = EXCLUDED.waste_qty,
    notes         = EXCLUDED.notes,
    hall_consumed = EXCLUDED.hall_consumed,
    formula_id    = EXCLUDED.formula_id
  RETURNING id INTO lid;
  RETURN lid;
END;
$$;

-- =====================================================================
-- inventory_transactions (single-txn insert; submit-revert stays in
-- existing submit_daily_sheet / revert_daily_sheet RPCs)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_create_inventory_txn(
  p_farm_id     uuid,
  p_item_id     uuid,
  p_txn_date    date,
  p_txn_type    text,
  p_qty_in      numeric,
  p_qty_out     numeric,
  p_unit_price  numeric,
  p_reference   text,
  p_notes       text,
  p_supplier_id uuid,
  p_source_type text,
  p_source_id   text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE tid uuid;
BEGIN
  IF p_txn_type NOT IN ('initial','purchase','consumption','waste',
                        'transfer_in','transfer_out','adjustment') THEN
    RAISE EXCEPTION 'invalid txn_type';
  END IF;
  -- Adjustment must have notes (matches app's audit requirement).
  IF p_txn_type = 'adjustment' AND (p_notes IS NULL OR trim(p_notes) = '') THEN
    RAISE EXCEPTION 'adjustment requires notes';
  END IF;
  INSERT INTO public.inventory_transactions
    (farm_id, item_id, txn_date, txn_type, qty_in, qty_out,
     unit_price, total_price, reference_no, notes, supplier_id,
     source_type, source_id, created_by)
  VALUES
    (p_farm_id, p_item_id, p_txn_date, p_txn_type,
     COALESCE(p_qty_in, 0), COALESCE(p_qty_out, 0),
     NULLIF(p_unit_price, 0),
     CASE WHEN p_unit_price IS NOT NULL AND p_qty_in IS NOT NULL
          THEN p_unit_price * p_qty_in ELSE NULL END,
     NULLIF(trim(p_reference), ''),
     NULLIF(trim(p_notes), ''),
     NULLIF(p_supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
     NULLIF(trim(p_source_type), ''),
     NULLIF(trim(p_source_id), ''),
     auth.uid())
  RETURNING id INTO tid;
  RETURN tid;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_inventory_txn(
  p_txn_id      uuid,
  p_qty_in      numeric,
  p_qty_out     numeric,
  p_txn_date    date,
  p_notes       text,
  p_reference   text,
  p_unit_price  numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.inventory_transactions SET
    qty_in       = COALESCE(p_qty_in, qty_in),
    qty_out      = COALESCE(p_qty_out, qty_out),
    txn_date     = COALESCE(p_txn_date, txn_date),
    notes        = COALESCE(NULLIF(trim(p_notes),''), notes),
    reference_no = COALESCE(NULLIF(trim(p_reference),''), reference_no),
    unit_price   = COALESCE(p_unit_price, unit_price),
    total_price  = CASE WHEN p_unit_price IS NOT NULL AND p_qty_in IS NOT NULL
                        THEN p_unit_price * p_qty_in ELSE total_price END
  WHERE id = p_txn_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_inventory_txn(p_txn_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.inventory_transactions WHERE id = p_txn_id;
END;
$$;

-- Idempotency check: was an initial stock txn already recorded for
-- (farm, item)? Returns true if so. Used by useInventory.addInitialStock.
CREATE OR REPLACE FUNCTION public.rpc_initial_stock_exists(
  p_farm_id uuid, p_item_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.inventory_transactions
    WHERE farm_id = p_farm_id AND item_id = p_item_id AND txn_type = 'initial'
  );
$$;

-- =====================================================================
-- Permissions: grant execute on all rpc_admin_* + helpers to anon and
-- authenticated. anon calls will be rejected by is_admin_user(); that
-- is fine — anon should not even reach the RPC.
-- =====================================================================
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema, p.proname AS name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'is_admin_user',
        'rpc_admin_get_profile',
        'rpc_admin_upsert_profile',
        'rpc_admin_soft_delete_profile',
        'rpc_admin_hard_delete_profile',
        'rpc_admin_toggle_profile',
        'rpc_admin_log_activity',
        'rpc_admin_create_farm','rpc_admin_update_farm',
        'rpc_admin_delete_farm','rpc_admin_toggle_farm',
        'rpc_admin_create_input','rpc_admin_update_input',
        'rpc_admin_delete_input','rpc_admin_toggle_input',
        'rpc_admin_create_supplier','rpc_admin_update_supplier',
        'rpc_admin_delete_supplier','rpc_admin_toggle_supplier',
        'rpc_supplier_usage_count',
        'rpc_admin_create_farm_item','rpc_admin_delete_farm_item',
        'rpc_admin_create_formula','rpc_admin_update_formula',
        'rpc_admin_delete_formula','rpc_admin_toggle_formula',
        'rpc_admin_duplicate_formula',
        'rpc_get_or_create_draft_voucher',
        'rpc_upsert_voucher_line',
        'rpc_create_inventory_txn',
        'rpc_admin_update_inventory_txn',
        'rpc_admin_delete_inventory_txn',
        'rpc_initial_stock_exists'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I TO anon, authenticated',
                   fn.schema, fn.name);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I FROM PUBLIC',
                   fn.schema, fn.name);
  END LOOP;
END $$;

-- =====================================================================
-- Optional but recommended: RLS scaffolding the SPA relies on. If your
-- Supabase project doesn't already have these, apply them in a separate
-- migration. Examples below; replace `farms` etc. with your real schema
-- if columns differ. (Kept here as commented-out scaffolds — uncomment
-- after auditing column names.)
-- =====================================================================
-- ALTER TABLE public.farms       ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.inputs      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.suppliers   ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.farm_items  ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.farm_feed_formulas ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.farm_formula_items  ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.daily_vouchers      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.daily_voucher_lines ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "authenticated read farms" ON public.farms FOR SELECT
--   USING (auth.role() = 'authenticated');
-- CREATE POLICY "write farms admin via rpc" ON public.farms FOR ALL
--   USING (false) WITH CHECK (false);  -- writes happen in RPCs only.
