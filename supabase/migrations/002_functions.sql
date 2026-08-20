-- Morvarid-FARM consolidated migration suite (generated from live schema)
-- 002_functions.sql - helpers, RPCs, reporting functions (non-trigger)

CREATE OR REPLACE FUNCTION public.current_user_farm_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT farm_id FROM public.profiles WHERE id = auth.uid() AND is_active = true LIMIT 1; $function$;

CREATE OR REPLACE FUNCTION public.get_user_farm_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RETURN (SELECT farm_id FROM public.profiles WHERE id = auth.uid()); END; $function$;

CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid uuid)
 RETURNS user_role_enum
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RETURN (SELECT role FROM public.profiles WHERE id = user_uuid LIMIT 1); END; $function$;

CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role::text FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.has_farm_access(check_farm_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN IF is_admin() THEN RETURN TRUE; END IF; RETURN check_farm_id = get_user_farm_id(); END; $function$;

CREATE OR REPLACE FUNCTION public.has_farm_access_v2(check_farm_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true AND (role = 'admin' OR (farm_id IS NOT NULL AND farm_id = check_farm_id))); $function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin' AND is_active = true); $function$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'::public.user_role_enum AND is_active = true); $function$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin_or_supervisor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = ANY (ARRAY['admin'::public.user_role_enum, 'supervisor'::public.user_role_enum]) AND is_active = true); $function$;

CREATE OR REPLACE FUNCTION public.is_self_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT is_active FROM public.profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.is_user_admin(user_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RETURN EXISTS (SELECT 1 FROM public.profiles WHERE id = user_uuid AND role = 'admin'); END; $function$;

CREATE OR REPLACE FUNCTION public.reporting_consumption_report_v3(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_farm_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text, p_group_by text DEFAULT 'item'::text, p_hall_ids uuid[] DEFAULT ARRAY[]::uuid[], p_formula_ids uuid[] DEFAULT ARRAY[]::uuid[])
 RETURNS TABLE(group_key text, group_label text, item_category text, hall_name text, formula_name text, consumed_qty numeric, waste_qty numeric, unit_price numeric, rial_value numeric, closing_balance numeric, voucher_count bigint)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_gb text := lower(coalesce(p_group_by, 'item'));
BEGIN
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'تاریخ شروع و پایان الزامی است';
  END IF;

  IF v_gb NOT IN ('day','item','hall','formula') THEN
    RAISE EXCEPTION 'مقدار گروه‌بندی نامعتبر است (مقدار دریافتی: %)', p_group_by;
  END IF;

  IF v_gb = 'day' THEN
    RETURN QUERY
    WITH base AS (
      SELECT v.voucher_date                              AS group_key,
             fi.id                                        AS item_id,
             SUM(l.consumed_qty)                          AS consumed_qty,
             SUM(l.waste_qty)                             AS waste_qty,
             MAX(fi.category)                             AS item_category,
             COUNT(DISTINCT v.id)                         AS voucher_count
        FROM public.daily_vouchers v
        JOIN public.daily_voucher_lines l
          ON l.voucher_id = v.id AND v.status::text = 'submitted'
        JOIN public.farm_items fi
          ON fi.id = l.item_id AND fi.farm_id = v.farm_id
       WHERE (p_farm_id IS NULL OR v.farm_id = p_farm_id)
         AND (p_category IS NULL OR fi.category::text = p_category)
         AND v.voucher_date BETWEEN p_date_from AND p_date_to
       GROUP BY v.voucher_date, fi.id
    ),
    priced AS (
      SELECT b.group_key, b.item_id, b.consumed_qty, b.waste_qty,
             b.item_category, b.voucher_count, price.unit_price
        FROM base b
        LEFT JOIN LATERAL public.reporting_get_item_unit_price(
          b.item_id, p_farm_id, p_date_to
        ) price ON true
    ),
    closing AS (
      SELECT it.item_id, SUM(it.qty_in - it.qty_out) AS on_hand_close
        FROM public.inventory_transactions it
       WHERE (p_farm_id IS NULL OR it.farm_id = p_farm_id)
         AND it.txn_date <= p_date_to
       GROUP BY it.item_id
    )
    SELECT p.group_key::text,
           to_char(p.group_key::date, 'YYYY-MM-DD')::text,
           p.item_category::text,
           NULL::text,
           NULL::text,
           p.consumed_qty::numeric,
           p.waste_qty::numeric,
           p.unit_price::numeric,
           (p.consumed_qty * COALESCE(p.unit_price, 0))::numeric,
           COALESCE(c.on_hand_close, 0)::numeric,
           p.voucher_count::bigint
      FROM priced p
      LEFT JOIN closing c ON c.item_id = p.item_id
     ORDER BY p.group_key;

  ELSIF v_gb = 'item' THEN
    RETURN QUERY
    WITH base AS (
      SELECT fi.id::text                                  AS group_key,
             fi.name                                       AS group_label,
             fi.id                                         AS item_id,
             SUM(l.consumed_qty)                           AS consumed_qty,
             SUM(l.waste_qty)                              AS waste_qty,
             MAX(fi.category)                              AS item_category,
             COUNT(DISTINCT v.id)                          AS voucher_count
        FROM public.daily_vouchers v
        JOIN public.daily_voucher_lines l
          ON l.voucher_id = v.id AND v.status::text = 'submitted'
        JOIN public.farm_items fi
          ON fi.id = l.item_id AND fi.farm_id = v.farm_id
       WHERE (p_farm_id IS NULL OR v.farm_id = p_farm_id)
         AND (p_category IS NULL OR fi.category::text = p_category)
         AND v.voucher_date BETWEEN p_date_from AND p_date_to
       GROUP BY fi.id, fi.name
    ),
    priced AS (
      SELECT b.*, price.unit_price
        FROM base b
        LEFT JOIN LATERAL public.reporting_get_item_unit_price(
          b.item_id, p_farm_id, p_date_to
        ) price ON true
    ),
    closing AS (
      SELECT it.item_id, SUM(it.qty_in - it.qty_out) AS on_hand_close
        FROM public.inventory_transactions it
       WHERE (p_farm_id IS NULL OR it.farm_id = p_farm_id)
         AND it.txn_date <= p_date_to
       GROUP BY it.item_id
    )
    SELECT p.group_key::text,
           p.group_label::text,
           p.item_category::text,
           NULL::text,
           NULL::text,
           p.consumed_qty::numeric,
           p.waste_qty::numeric,
           p.unit_price::numeric,
           (p.consumed_qty * COALESCE(p.unit_price, 0))::numeric,
           COALESCE(c.on_hand_close, 0)::numeric,
           p.voucher_count::bigint
      FROM priced p
      LEFT JOIN closing c ON c.item_id = p.item_id
     ORDER BY p.consumed_qty DESC, p.group_label;

  ELSIF v_gb = 'hall' THEN
    RETURN QUERY
    WITH expanded AS (
      SELECT v.id AS voucher_id,
             v.farm_id,
             l.item_id,
             l.consumed_qty,
             l.waste_qty,
             fi.category,
             TRIM(hall_token) AS hall_token_raw
        FROM public.daily_vouchers v
        JOIN public.daily_voucher_lines l
          ON l.voucher_id = v.id AND v.status::text = 'submitted'
        JOIN public.farm_items fi
          ON fi.id = l.item_id AND fi.farm_id = v.farm_id
        CROSS JOIN LATERAL unnest(string_to_array(
          COALESCE(NULLIF(l.hall_numbers, ''), '__no_hall'), ','
        )) AS hall_token
       WHERE (p_farm_id IS NULL OR v.farm_id = p_farm_id)
         AND (p_category IS NULL OR fi.category::text = p_category)
         AND v.voucher_date BETWEEN p_date_from AND p_date_to
    ),
    filtered AS (
      SELECT e.*
        FROM expanded e
       WHERE e.hall_token_raw <> ''
         AND (cardinality(p_hall_ids) = 0
              OR EXISTS (
                SELECT 1
                  FROM public.farm_halls fh
                 WHERE fh.farm_id = e.farm_id
                   AND fh.hall_number::text = e.hall_token_raw
                   AND fh.id = ANY(p_hall_ids)
              ))
    ),
    aggregated AS (
      SELECT f.hall_token_raw AS group_key,
             f.farm_id AS any_farm_id,
             f.item_id,
             SUM(f.consumed_qty) AS consumed_qty,
             SUM(f.waste_qty) AS waste_qty,
             MAX(f.category) AS item_category,
             COUNT(DISTINCT f.voucher_id) AS voucher_count
        FROM filtered f
       GROUP BY f.farm_id, f.hall_token_raw, f.item_id
    ),
    priced AS (
      SELECT a.*, price.unit_price
        FROM aggregated a
        LEFT JOIN LATERAL public.reporting_get_item_unit_price(
          a.item_id, a.any_farm_id, p_date_to
        ) price ON true
    ),
    closing AS (
      SELECT it.item_id, SUM(it.qty_in - it.qty_out) AS on_hand_close
        FROM public.inventory_transactions it
       WHERE (p_farm_id IS NULL OR it.farm_id = p_farm_id)
         AND it.txn_date <= p_date_to
       GROUP BY it.item_id
    ),
    hall_names AS (
      SELECT fh.farm_id,
             fh.hall_number::text AS hall_token,
             MAX(fh.name) AS hall_name
        FROM public.farm_halls fh
       WHERE (p_farm_id IS NULL OR fh.farm_id = p_farm_id)
         AND (cardinality(p_hall_ids) = 0 OR fh.id = ANY(p_hall_ids))
       GROUP BY fh.farm_id, fh.hall_number
    )
    SELECT p.group_key::text,
           COALESCE(hn.hall_name, p.group_key)::text,
           p.item_category::text,
           hn.hall_name::text,
           NULL::text,
           p.consumed_qty::numeric,
           p.waste_qty::numeric,
           p.unit_price::numeric,
           (p.consumed_qty * COALESCE(p.unit_price, 0))::numeric,
           COALESCE(c.on_hand_close, 0)::numeric,
           p.voucher_count::bigint
      FROM priced p
      LEFT JOIN closing c ON c.item_id = p.item_id
      LEFT JOIN hall_names hn
        ON hn.farm_id = p.any_farm_id AND hn.hall_token = p.group_key
     ORDER BY p.consumed_qty DESC, p.group_key::int NULLS LAST;

  ELSIF v_gb = 'formula' THEN
    RETURN QUERY
    WITH base AS (
      SELECT COALESCE(f.id::text, '__no_formula') AS group_key,
             COALESCE(f.name, 'بدون فرمول') AS group_label,
             fi.id AS item_id,
             fi.unit AS item_unit,
             l.formula_id,
             SUM(l.consumed_qty) AS consumed_qty,
             SUM(l.waste_qty) AS waste_qty,
             MAX(fi.category) AS item_category,
             COUNT(DISTINCT v.id) AS voucher_count
        FROM public.daily_vouchers v
        JOIN public.daily_voucher_lines l
          ON l.voucher_id = v.id AND v.status::text = 'submitted'
        JOIN public.farm_items fi
          ON fi.id = l.item_id AND fi.farm_id = v.farm_id
        LEFT JOIN public.farm_feed_formulas f
          ON f.id = l.formula_id
       WHERE (p_farm_id IS NULL OR v.farm_id = p_farm_id)
         AND (p_category IS NULL OR fi.category::text = p_category)
         AND (cardinality(p_formula_ids) = 0 OR l.formula_id = ANY(p_formula_ids))
         AND v.voucher_date BETWEEN p_date_from AND p_date_to
       GROUP BY f.id, f.name, fi.id, fi.unit, l.formula_id
    ),
    priced AS (
      SELECT b.*, price.unit_price
        FROM base b
        LEFT JOIN LATERAL public.reporting_get_item_unit_price(
          b.item_id, p_farm_id, p_date_to
        ) price ON true
    ),
    closing AS (
      SELECT it.item_id, SUM(it.qty_in - it.qty_out) AS on_hand_close
        FROM public.inventory_transactions it
       WHERE (p_farm_id IS NULL OR it.farm_id = p_farm_id)
         AND it.txn_date <= p_date_to
       GROUP BY it.item_id
    )
    SELECT p.group_key::text,
           p.group_label::text,
           p.item_category::text,
           NULL::text,
           p.group_label::text,
           p.consumed_qty::numeric,
           p.waste_qty::numeric,
           p.unit_price::numeric,
           (p.consumed_qty * COALESCE(p.unit_price, 0))::numeric,
           COALESCE(c.on_hand_close, 0)::numeric,
           p.voucher_count::bigint
      FROM priced p
      LEFT JOIN closing c ON c.item_id = p.item_id
     ORDER BY p.group_label NULLS LAST;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reporting_consumption_summary(p_date_from date, p_date_to date, p_farm_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text, p_group_by text DEFAULT 'day'::text)
 RETURNS TABLE(group_key text, group_label text, consumed_qty numeric, waste_qty numeric, total_qty numeric, voucher_count bigint, item_category text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gb text := lower(coalesce(p_group_by, 'day'));
BEGIN
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'تاریخ شروع و پایان الزامی است';
  END IF;
  IF v_gb NOT IN ('day','item','hall','formula') THEN
    RAISE EXCEPTION 'مقدار گروه‌بندی نامعتبر است (مقدار دریافتی: %)', p_group_by;
  END IF;

  IF v_gb = 'day' THEN
    RETURN QUERY
    SELECT v.voucher_date::text                                AS group_key,
           to_char(v.voucher_date, 'YYYY-MM-DD')               AS group_label,
           COALESCE(SUM(l.consumed_qty), 0)::numeric           AS consumed_qty,
           COALESCE(SUM(l.waste_qty),    0)::numeric           AS waste_qty,
           COALESCE(SUM(l.consumed_qty) + SUM(l.waste_qty), 0)::numeric AS total_qty,
           COUNT(DISTINCT v.id)::bigint                        AS voucher_count,
           max(fi.category)::text                              AS item_category
      FROM public.daily_vouchers v
      JOIN public.daily_voucher_lines l ON l.voucher_id = v.id AND v.status::text = 'submitted'
      JOIN public.farm_items fi ON fi.id = l.item_id AND fi.farm_id = v.farm_id
     WHERE (p_farm_id  IS NULL OR v.farm_id  = p_farm_id)
       AND (p_category IS NULL OR fi.category::text = p_category)
       AND v.voucher_date BETWEEN p_date_from AND p_date_to
     GROUP BY v.voucher_date
     ORDER BY v.voucher_date;

  ELSIF v_gb = 'item' THEN
    RETURN QUERY
    -- fi.name is varchar(255); RETURNS TABLE column group_label is text.
    -- PL/pgSQL's return-type check is strict, so cast explicitly (matches
    -- the 'formula' branch). Without ::text this branch raises 42804 at
    -- runtime as soon as any row is returned.
    SELECT fi.id::text                                          AS group_key,
           fi.name::text                                        AS group_label,
           COALESCE(SUM(l.consumed_qty), 0)::numeric,
           COALESCE(SUM(l.waste_qty),    0)::numeric,
           COALESCE(SUM(l.consumed_qty) + SUM(l.waste_qty), 0)::numeric,
           COUNT(DISTINCT v.id)::bigint,
           max(fi.category)::text
      FROM public.daily_vouchers v
      JOIN public.daily_voucher_lines l ON l.voucher_id = v.id AND v.status::text = 'submitted'
      JOIN public.farm_items fi ON fi.id = l.item_id AND fi.farm_id = v.farm_id
     WHERE (p_farm_id  IS NULL OR v.farm_id  = p_farm_id)
       AND (p_category IS NULL OR fi.category::text = p_category)
       AND v.voucher_date BETWEEN p_date_from AND p_date_to
     GROUP BY fi.id, fi.name
     ORDER BY SUM(l.consumed_qty) DESC, fi.name;

  ELSIF v_gb = 'hall' THEN
    RETURN QUERY
    WITH expanded AS (
      SELECT v.id AS voucher_id,
             l.consumed_qty,
             l.waste_qty,
             fi.id AS item_id,
             fi.category,
             TRIM(hall_token) AS hall_token
        FROM public.daily_vouchers v
        JOIN public.daily_voucher_lines l
          ON l.voucher_id = v.id AND v.status::text = 'submitted'
        JOIN public.farm_items fi
          ON fi.id = l.item_id AND fi.farm_id = v.farm_id
        CROSS JOIN LATERAL unnest(string_to_array(
          COALESCE(NULLIF(l.hall_numbers, ''), '__no_hall'), ','
        )) AS hall_token
       WHERE (p_farm_id  IS NULL OR v.farm_id  = p_farm_id)
         AND (p_category IS NULL OR fi.category::text = p_category)
         AND v.voucher_date BETWEEN p_date_from AND p_date_to
    )
    SELECT e.hall_token                                          AS group_key,
           e.hall_token                                          AS group_label,
           COALESCE(SUM(e.consumed_qty), 0)::numeric             AS consumed_qty,
           COALESCE(SUM(e.waste_qty),    0)::numeric             AS waste_qty,
           COALESCE(SUM(e.consumed_qty) + SUM(e.waste_qty), 0)::numeric AS total_qty,
           COUNT(DISTINCT e.voucher_id)::bigint                  AS voucher_count,
           max(e.category)::text
      FROM expanded e
     WHERE e.hall_token <> ''
     GROUP BY e.hall_token
     ORDER BY SUM(e.consumed_qty) DESC, e.hall_token;

  ELSIF v_gb = 'formula' THEN
    RETURN QUERY
    SELECT COALESCE(f.id::text, '__no_formula')                  AS group_key,
           COALESCE(f.name,    'بدون فرمول')::text               AS group_label,
           COALESCE(SUM(l.consumed_qty), 0)::numeric,
           COALESCE(SUM(l.waste_qty),    0)::numeric,
           COALESCE(SUM(l.consumed_qty) + SUM(l.waste_qty), 0)::numeric,
           COUNT(DISTINCT v.id)::bigint,
           max(fi.category)::text
      FROM public.daily_vouchers v
      JOIN public.daily_voucher_lines l ON l.voucher_id = v.id AND v.status::text = 'submitted'
      JOIN public.farm_items fi ON fi.id = l.item_id AND fi.farm_id = v.farm_id
      LEFT JOIN public.farm_feed_formulas f ON f.id = l.formula_id
     WHERE (p_farm_id  IS NULL OR v.farm_id  = p_farm_id)
       AND (p_category IS NULL OR fi.category::text = p_category)
       AND v.voucher_date BETWEEN p_date_from AND p_date_to
     GROUP BY f.id, f.name
     ORDER BY f.name NULLS LAST;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reporting_get_item_unit_price(p_item_id uuid, p_farm_id uuid, p_as_of date)
 RETURNS TABLE(unit_price numeric, price_source text, priced_on date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH latest AS (
    SELECT t.unit_price, t.txn_date
      FROM public.inventory_transactions t
     WHERE t.item_id    = p_item_id
       AND t.farm_id    = p_farm_id
       AND t.txn_type::text IN ('purchase','transfer_in')
       AND t.unit_price IS NOT NULL
       AND t.unit_price > 0
       AND t.txn_date <= p_as_of
     ORDER BY t.txn_date DESC, t.txn_ts DESC
     LIMIT 1
  )
  SELECT latest.unit_price,
         'latest_purchase'::text AS price_source,
         latest.txn_date         AS priced_on
    FROM latest
  UNION ALL
  SELECT NULL::numeric, 'none'::text, NULL::date
    WHERE NOT EXISTS (SELECT 1 FROM latest);
$function$;

CREATE OR REPLACE FUNCTION public.reporting_inventory_balance_as_of(p_as_of date, p_farm_id uuid DEFAULT NULL::uuid, p_item_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text)
 RETURNS TABLE(farm_id uuid, item_id uuid, item_name text, item_unit text, item_category text, on_hand_qty numeric, unit_cost numeric, cost_basis text, priced_on date, value_rial numeric, as_of_date date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH movements AS (
    SELECT t.farm_id,
           t.item_id,
           SUM(t.qty_in)  FILTER (WHERE t.txn_date <= p_as_of) AS sum_in,
           SUM(t.qty_out) FILTER (WHERE t.txn_date <= p_as_of) AS sum_out
      FROM public.inventory_transactions t
     WHERE (p_farm_id IS NULL OR t.farm_id = p_farm_id)
       AND (p_item_id IS NULL OR t.item_id = p_item_id)
       AND EXISTS (
         SELECT 1 FROM public.farm_items fi
           WHERE fi.id = t.item_id AND fi.farm_id = t.farm_id
             AND (p_category IS NULL OR fi.category::text = p_category)
             AND fi.is_active = true
       )
     GROUP BY t.farm_id, t.item_id
  ),
  priced AS (
    -- NOTE: helper returns (unit_price, price_source, priced_on). We alias
    --       them here to (unit_cost, cost_basis, priced_on) so the
    --       balance-as-of return shape stays stable per db-contract §2.2.
    SELECT m.farm_id, m.item_id, m.sum_in, m.sum_out,
           (COALESCE(m.sum_in,0) - COALESCE(m.sum_out,0))::numeric AS on_hand_qty,
           price.unit_price  AS unit_cost,
           price.price_source AS cost_basis,
           price.priced_on
      FROM movements m
      JOIN public.farm_items fi ON fi.id = m.item_id AND fi.farm_id = m.farm_id
      LEFT JOIN LATERAL public.reporting_get_item_unit_price(
             m.item_id, m.farm_id, p_as_of
           ) price ON true
     WHERE (COALESCE(m.sum_in,0) - COALESCE(m.sum_out,0)) <> 0
       AND fi.is_active = true
  )
  SELECT p.farm_id,
         p.item_id,
         fi.name,
         fi.unit,
         fi.category,
         p.on_hand_qty,
         p.unit_cost,
         p.cost_basis,
         p.priced_on,
         CASE WHEN p.unit_cost IS NULL THEN NULL
              ELSE p.on_hand_qty * p.unit_cost
         END AS value_rial,
         p_as_of AS as_of_date
    FROM priced p
    JOIN public.farm_items fi ON fi.id = p.item_id AND fi.farm_id = p.farm_id
   ORDER BY fi.category, fi.name;
$function$;

CREATE OR REPLACE FUNCTION public.reporting_inventory_ledger(p_farm_id uuid DEFAULT NULL::uuid, p_item_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_txn_type text DEFAULT NULL::text, p_cursor_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_prior_balance numeric DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, txn_ts timestamp with time zone, txn_date date, txn_type text, farm_id uuid, farm_name text, item_id uuid, item_name text, item_unit text, item_category text, source_type text, source_id text, qty_in numeric, qty_out numeric, unit_price numeric, total_price numeric, reference_no text, notes text, supplier_id uuid, supplier_name text, prior_balance numeric, running_balance numeric, has_more boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH safe_limit AS (
    SELECT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500)) AS n
  ),
  page AS (
    SELECT t.id, t.txn_ts, t.txn_date, t.txn_type,
           t.farm_id, t.item_id,
           t.source_type, t.source_id,
           t.qty_in, t.qty_out, t.unit_price, t.total_price,
           t.reference_no, t.notes, t.supplier_id,
           f.name  AS farm_name,
           fi.name AS item_name, fi.unit AS item_unit, fi.category AS item_category,
           s.name  AS supplier_name
      FROM public.inventory_transactions t
      JOIN public.farm_items fi
        ON fi.id = t.item_id AND fi.farm_id = t.farm_id
      JOIN public.farms f
        ON f.id = t.farm_id
      LEFT JOIN public.suppliers s
        ON s.id = t.supplier_id
     WHERE (p_farm_id   IS NULL OR t.farm_id  = p_farm_id)
       AND (p_item_id   IS NULL OR t.item_id  = p_item_id)
       AND (p_category  IS NULL OR fi.category::text = p_category)
       AND (p_date_from IS NULL OR t.txn_date >= p_date_from)
       AND (p_date_to   IS NULL OR t.txn_date <= p_date_to)
       AND (p_txn_type  IS NULL OR t.txn_type::text = p_txn_type)
       AND (p_cursor_ts IS NULL
            OR (t.txn_ts, t.id) < (p_cursor_ts, p_cursor_id))
     ORDER BY t.txn_ts DESC, t.id DESC
     LIMIT (SELECT n FROM safe_limit) + 1
  )
  SELECT page.id, page.txn_ts, page.txn_date, page.txn_type,
         page.farm_id, page.farm_name,
         page.item_id, page.item_name, page.item_unit, page.item_category,
         page.source_type, page.source_id,
         page.qty_in, page.qty_out, page.unit_price, page.total_price,
         page.reference_no, page.notes,
         page.supplier_id, page.supplier_name,
         p_prior_balance                                                    AS prior_balance,
         (p_prior_balance
          + COALESCE(SUM(page.qty_in - page.qty_out) OVER (
              PARTITION BY page.farm_id, page.item_id
              ORDER BY page.txn_ts ASC, page.id ASC
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 0))::numeric AS running_balance,
         (COUNT(*) OVER () > (SELECT n FROM safe_limit))::boolean           AS has_more
    FROM page
   ORDER BY page.txn_ts DESC, page.id DESC
   LIMIT (SELECT n FROM safe_limit);
$function$;

CREATE OR REPLACE FUNCTION public.reporting_inventory_stock(p_as_of date DEFAULT CURRENT_DATE, p_farm_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text, p_dead_stock_only boolean DEFAULT false)
 RETURNS TABLE(farm_id uuid, farm_name text, item_id uuid, item_name text, item_category text, item_unit text, on_hand_qty numeric, unit_cost numeric, value_rial numeric, last_movement_date date, days_since_last_movement integer, age_bucket text, is_dead_stock boolean, as_of_date date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH last_movement AS (
    -- For each (farm, item) touched in the as-of window, find the most
    -- recent txn_ts and last txn_date. We use txn_ts because txn_date is
    -- the user-reported date — sometimes the same item gets multiple
    -- ledger writes on the same day, and the timestamp is the tiebreaker.
    SELECT t.farm_id,
           t.item_id,
           MAX(t.txn_date) AS latest_txn_date
      FROM public.inventory_transactions t
     WHERE (p_farm_id IS NULL OR t.farm_id = p_farm_id)
       AND t.txn_date <= p_as_of
     GROUP BY t.farm_id, t.item_id
  )
  SELECT b.farm_id,
         f.name                                   AS farm_name,
         b.item_id,
         fi.name                                  AS item_name,
         fi.category                              AS item_category,
         fi.unit                                  AS item_unit,
         b.on_hand_qty,
         b.unit_cost,
         b.value_rial,
         lm.latest_txn_date                        AS last_movement_date,
         -- days_since_last_movement: NULL when the item has never moved
         -- (e.g. initial-only vouches). Treat as "∞ days" downstream.
         CASE WHEN lm.latest_txn_date IS NULL THEN NULL
              ELSE (p_as_of - lm.latest_txn_date)::integer
         END                                      AS days_since_last_movement,
         CASE WHEN lm.latest_txn_date IS NULL THEN '__no_movement'
              WHEN (p_as_of - lm.latest_txn_date) > 90 THEN '91+'
              WHEN (p_as_of - lm.latest_txn_date) > 60 THEN '61-90'
              WHEN (p_as_of - lm.latest_txn_date) > 30 THEN '31-60'
              ELSE '0-30'
         END                                      AS age_bucket,
         CASE WHEN lm.latest_txn_date IS NULL THEN FALSE
              ELSE (p_as_of - lm.latest_txn_date) > 90
         END                                      AS is_dead_stock,
         p_as_of                                  AS as_of_date
    -- is_dead_stock is computed inline above (latest_txn_date is the
    -- LAST txn_date ≤ p_as_of per (farm, item); when NULL the item
    -- has never been touched in-window and we treat it as "not dead").
  FROM public.reporting_inventory_balance_as_of(p_as_of, p_farm_id, NULL, p_category) b
  JOIN public.farm_items fi
    ON fi.id = b.item_id AND fi.farm_id = b.farm_id
  JOIN public.farms f
    ON f.id = b.farm_id
  LEFT JOIN last_movement lm
    ON lm.farm_id = b.farm_id AND lm.item_id = b.item_id
  WHERE (NOT p_dead_stock_only
         OR (lm.latest_txn_date IS NOT NULL
             AND (p_as_of - lm.latest_txn_date) > 90)
         OR (lm.latest_txn_date IS NULL AND b.on_hand_qty > 0));
$function$;

CREATE OR REPLACE FUNCTION public.reporting_packaging_v3(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_farm_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(item_id uuid, item_name text, item_unit text, consumed_qty numeric, waste_qty numeric, rial_value numeric, closing_balance numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT fi.id                                       AS item_id,
           fi.name                                     AS item_name,
           fi.unit                                     AS item_unit,
           COALESCE(SUM(l.consumed_qty), 0)::numeric   AS consumed_qty,
           COALESCE(SUM(l.waste_qty),    0)::numeric   AS waste_qty
      FROM public.farm_items fi
      LEFT JOIN public.daily_voucher_lines l
        ON l.item_id = fi.id
      LEFT JOIN public.daily_vouchers v
        ON v.id = l.voucher_id
       AND v.status::text = 'submitted'
       AND v.voucher_date BETWEEN p_date_from AND p_date_to
     WHERE fi.category::text = 'packaging'
       AND (p_farm_id IS NULL OR fi.farm_id = p_farm_id)
     GROUP BY fi.id, fi.name, fi.unit
  ),
  priced AS (
    SELECT b.item_id, b.item_name, b.item_unit, b.consumed_qty, b.waste_qty,
           price.unit_price
      FROM base b
      LEFT JOIN LATERAL public.reporting_get_item_unit_price(
             b.item_id, p_farm_id, COALESCE(p_date_to, CURRENT_DATE)
           ) price ON true
  ),
  closing AS (
    SELECT it.item_id,
           SUM(it.qty_in - it.qty_out) AS on_hand_close
      FROM public.inventory_transactions it
      JOIN public.farm_items fi
        ON fi.id = it.item_id AND fi.farm_id = it.farm_id
     WHERE fi.category::text = 'packaging'
       AND (p_farm_id IS NULL OR it.farm_id = p_farm_id)
       AND it.txn_date <= COALESCE(p_date_to, CURRENT_DATE)
     GROUP BY it.item_id
  )
  SELECT pr.item_id,
         pr.item_name,
         pr.item_unit,
         pr.consumed_qty,
         pr.waste_qty,
         (pr.consumed_qty * COALESCE(pr.unit_price, 0))::numeric AS rial_value,
         COALESCE(c.on_hand_close, 0)::numeric                    AS closing_balance
    FROM priced pr
    LEFT JOIN closing c ON c.item_id = pr.item_id
   ORDER BY pr.item_name;
$function$;

CREATE OR REPLACE FUNCTION public.reporting_pareto_classification(p_date_from date, p_date_to date, p_farm_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text, p_basis text DEFAULT 'value'::text, p_a_threshold numeric DEFAULT 70, p_b_threshold numeric DEFAULT 90)
 RETURNS TABLE(item_id uuid, farm_id uuid, item_name text, item_unit text, item_category text, farm_name text, period_qty numeric, unit_cost numeric, basis_metric numeric, share_pct numeric, cumulative_share_pct numeric, abc_class text, on_hand_qty numeric, reorder_point numeric, avg_daily_consumption numeric, reorder_recommended boolean, reorder_basis text, date_from date, date_to date, basis text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_basis text := lower(coalesce(p_basis, 'value'));
  v_a     numeric := GREATEST(LEAST(coalesce(p_a_threshold, 70), 100), 0);
  v_b     numeric := GREATEST(LEAST(coalesce(p_b_threshold, 90), 100), v_a + 0.01);
  v_period_days integer := GREATEST((p_date_to - p_date_from) + 1, 1);
BEGIN
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'تاریخ شروع و پایان الزامی است';
  END IF;
  IF p_date_to < p_date_from THEN
    -- Inverted range would silently inflate avg_daily_consumption
    -- (v_period_days would clamp to 1). Surface the bad input.
    RAISE EXCEPTION 'تاریخ پایان باید بعد از تاریخ شروع باشد';
  END IF;
  IF v_basis NOT IN ('value','quantity') THEN
    RAISE EXCEPTION 'مبنای محاسبه نامعتبر است (مقدار دریافتی: %)', p_basis;
  END IF;

  RETURN QUERY
  WITH consumption AS (
    -- Period consumption per (farm, item) from daily_voucher_lines.
    -- Joins on daily_vouchers.status = 'submitted' so drafts / locked-then-
    -- reverted rows don't leak into the Pareto.
    SELECT v.farm_id,
           l.item_id,
           COALESCE(SUM(l.consumed_qty), 0)::numeric AS consumed,
           COALESCE(SUM(l.waste_qty),    0)::numeric AS wasted,
           (COALESCE(SUM(l.consumed_qty), 0)
            + COALESCE(SUM(l.waste_qty),    0))::numeric AS total
      FROM public.daily_vouchers v
      JOIN public.daily_voucher_lines l ON l.voucher_id = v.id
                                       AND v.status::text = 'submitted'
      JOIN public.farm_items fi ON fi.id = l.item_id
                                AND fi.farm_id = v.farm_id
                                AND fi.is_active = true
     WHERE (p_farm_id  IS NULL OR v.farm_id  = p_farm_id)
       AND (p_category IS NULL OR fi.category::text = p_category)
       AND v.voucher_date BETWEEN p_date_from AND p_date_to
     GROUP BY v.farm_id, l.item_id
  ),
  priced AS (
    -- Join unit_cost via the 008 helper.
    SELECT c.farm_id,
           c.item_id,
           c.consumed,
           c.total AS period_qty,
           price.unit_price AS unit_cost
      FROM consumption c
      LEFT JOIN LATERAL public.reporting_get_item_unit_price(
        c.item_id, c.farm_id, p_date_to
      ) price ON true
  ),
  metrics AS (
    SELECT p.farm_id,
           p.item_id,
           p.period_qty,
           p.unit_cost,
           CASE WHEN v_basis = 'value'
                THEN COALESCE(p.period_qty * p.unit_cost, 0)::numeric
                ELSE p.period_qty
           END AS basis_metric
      FROM priced p
  ),
  ranked AS (
    SELECT m.farm_id,
           m.item_id,
           m.period_qty,
           m.unit_cost,
           m.basis_metric,
           SUM(m.basis_metric)                          OVER () AS grand_total,
           SUM(m.basis_metric)                          OVER (
             PARTITION BY m.farm_id
             ORDER BY m.basis_metric DESC, m.item_id ASC
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS running_total
      FROM metrics m
  ),
  classed AS (
    SELECT r.farm_id,
           r.item_id,
           r.period_qty,
           r.unit_cost,
           r.basis_metric,
           CASE WHEN NULLIF(r.grand_total, 0) IS NULL
                THEN 0::numeric
                ELSE (r.basis_metric / r.grand_total * 100)::numeric
           END AS share_pct,
           CASE WHEN NULLIF(r.grand_total, 0) IS NULL
                THEN 0::numeric
                ELSE (r.running_total / r.grand_total * 100)::numeric
           END AS cumulative_share_pct,
           CASE WHEN NULLIF(r.grand_total, 0) IS NULL
                THEN 'C'
                WHEN (r.running_total / r.grand_total * 100) <= v_a THEN 'A'
                WHEN (r.running_total / r.grand_total * 100) <= v_b THEN 'B'
                ELSE 'C'
           END AS abc_class
      FROM ranked r
  ),
  snapshot AS (
    -- on_hand as-of p_date_to via the same movement sum the aging RPC does.
    SELECT t.farm_id, t.item_id,
           (COALESCE(SUM(t.qty_in)  FILTER (WHERE t.txn_date <= p_date_to), 0)
            - COALESCE(SUM(t.qty_out) FILTER (WHERE t.txn_date <= p_date_to), 0))::numeric AS on_hand_qty
      FROM public.inventory_transactions t
     GROUP BY t.farm_id, t.item_id
  )
  SELECT fi.id                                                  AS item_id,
         fi.farm_id                                              AS farm_id,
         fi.name::text                                           AS item_name,
         fi.unit::text                                           AS item_unit,
         fi.category::text                                       AS item_category,
         f.name::text                                            AS farm_name,
         c.period_qty,
         c.unit_cost,
         c.basis_metric,
         c.share_pct,
         c.cumulative_share_pct,
         c.abc_class,
         COALESCE(s.on_hand_qty, 0)::numeric                     AS on_hand_qty,
         COALESCE(fi.reorder_point, 0)::numeric                  AS reorder_point,
         (c.period_qty / v_period_days)::numeric                 AS avg_daily_consumption,
         (c.abc_class = 'A'
          AND COALESCE(s.on_hand_qty, 0) < COALESCE(fi.reorder_point, 0)
          AND c.period_qty > 0)::boolean                         AS reorder_recommended,
         'heuristic:on_hand_below_reorder_point'::text           AS reorder_basis,
         p_date_from                                             AS date_from,
         p_date_to                                               AS date_to,
         v_basis                                                 AS basis
    FROM classed c
    JOIN public.farm_items fi ON fi.id = c.item_id AND fi.farm_id = c.farm_id
    JOIN public.farms       f  ON f.id  = fi.farm_id
    LEFT JOIN snapshot s ON s.farm_id = c.farm_id AND s.item_id = c.item_id
   WHERE c.period_qty > 0     -- only items with positive period consumption belong in ABC
     AND fi.is_active   = true
   -- basis_metric may legitimately be 0 (no unit_cost known in 'value' basis)
   -- — those rows still get a basis_rank so the JS renderer can show '—'.
   ORDER BY c.basis_metric DESC NULLS LAST, fi.id ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reporting_purchases_v3(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_farm_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_item_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(txn_id uuid, txn_date date, supplier_id uuid, supplier_name text, item_id uuid, item_name text, item_unit text, qty numeric, unit_price numeric, total_amount numeric, reference_no text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT t.id                                   AS txn_id,
         t.txn_date,
         t.supplier_id,
         s.name                                 AS supplier_name,
         fi.id,
         fi.name,
         fi.unit,
         t.qty_in                               AS qty,
         t.unit_price,
         COALESCE(t.total_price, t.qty_in * COALESCE(t.unit_price, 0))::numeric
                                                    AS total_amount,
         t.reference_no
    FROM public.inventory_transactions t
    JOIN public.farm_items fi
      ON fi.id = t.item_id AND fi.farm_id = t.farm_id
    LEFT JOIN public.suppliers s
      ON s.id = t.supplier_id
   WHERE t.txn_type::text = 'purchase'
     AND (p_date_from   IS NULL OR t.txn_date >= p_date_from)
     AND (p_date_to     IS NULL OR t.txn_date <= p_date_to)
     AND (p_farm_id     IS NULL OR t.farm_id   = p_farm_id)
     AND (p_supplier_id IS NULL OR t.supplier_id = p_supplier_id)
     AND (p_item_id     IS NULL OR t.item_id   = p_item_id)
   ORDER BY t.txn_date DESC, t.txn_ts DESC, t.id DESC;
$function$;

CREATE OR REPLACE FUNCTION public.reporting_reorder_point_v3(p_farm_id uuid DEFAULT NULL::uuid, p_basis text DEFAULT 'value'::text, p_abc_class text DEFAULT NULL::text, p_reorder_needed_only boolean DEFAULT false)
 RETURNS TABLE(item_id uuid, item_name text, farm_id uuid, farm_name text, item_unit text, item_category text, on_hand_qty numeric, reorder_point numeric, avg_daily_consumption numeric, abc_class text, reorder_recommended boolean, basis text, period_from date, period_to date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH window_bounds AS (
    SELECT (CURRENT_DATE - INTERVAL '90 days')::date AS d_from,
           CURRENT_DATE::date                       AS d_to
  ),
  -- 90-day aggregate movement per (farm, item). Includes gross inbound
  -- purchases, gross outbound (consumption + waste + transfer_out),
  -- and the value totals used as the 'value' ABC basis metric.
  movement AS (
    SELECT t.farm_id,
           t.item_id,
           COALESCE(SUM(t.qty_out) FILTER (
             WHERE t.txn_type::text IN ('consumption','waste','transfer_out')
           ), 0) AS qty_out_total,
           COALESCE(SUM(t.qty_out) FILTER (
             WHERE t.txn_type::text = 'consumption'
           ), 0) AS consumed_qty,
           COALESCE(SUM(t.qty_in  * COALESCE(t.unit_price, 0)) FILTER (
             WHERE t.txn_type::text = 'purchase'
           ), 0)
         + COALESCE(SUM(t.qty_out * COALESCE(t.unit_price, 0)) FILTER (
             WHERE t.txn_type::text IN ('consumption','waste')
           ), 0) AS value_total
      FROM public.inventory_transactions t
      CROSS JOIN window_bounds wb
     WHERE (p_farm_id IS NULL OR t.farm_id = p_farm_id)
       AND t.txn_date BETWEEN wb.d_from AND wb.d_to
     GROUP BY t.farm_id, t.item_id
  ),
  -- On-hand lookup. reporting_inventory_balance_as_of is SECURITY
  -- INVOKER; RLS naturally scopes per JWT. No farm_id filter on the
  -- inner call when p_farm_id is NULL — we filter the final result
  -- downstream via active_items.
  on_hand AS (
    SELECT b.farm_id, b.item_id, b.on_hand_qty
      FROM public.reporting_inventory_balance_as_of(
        CURRENT_DATE, p_farm_id, NULL, NULL
      ) b
  ),
  -- Anchor the result set on farm_items (active rows only). LEFT JOIN
  -- movement + on_hand so we capture both moving and idle items.
  active_items AS (
    SELECT fi.farm_id,
           fi.id   AS item_id,
           fi.name AS item_name,
           fi.unit AS item_unit,
           fi.category AS item_category,
           fi.reorder_point,
           COALESCE(oh.on_hand_qty, 0) AS on_hand_qty,
           (COALESCE(m.consumed_qty, 0) / 90.0) AS avg_daily_consumption,
           CASE WHEN p_basis = 'quantity'
                THEN COALESCE(m.qty_out_total, 0)
                ELSE COALESCE(m.value_total, 0)
           END AS basis_metric
      FROM public.farm_items fi
      LEFT JOIN movement m
        ON m.item_id = fi.id AND m.farm_id = fi.farm_id
      LEFT JOIN on_hand oh
        ON oh.item_id = fi.id AND oh.farm_id = fi.farm_id
     WHERE fi.is_active = true
       AND (p_farm_id IS NULL OR fi.farm_id = p_farm_id)
  ),
  -- Window function: cumulative basis metric per farm partition.
  -- total_basis is the same partition's SUM (no ORDER) so the share
  -- ratio is well-defined per row.
  ranked AS (
    SELECT a.*,
           SUM(a.basis_metric) OVER (PARTITION BY a.farm_id) AS total_basis,
           SUM(a.basis_metric) OVER (
             PARTITION BY a.farm_id
             ORDER BY a.basis_metric DESC NULLS LAST, a.item_id
           ) AS cumulative_basis
      FROM active_items a
  ),
  -- A/B/C bucket:
  --   total_basis = 0  → force 'C' (no movement = no earlier tiers).
  --   cumulative/total ≤ 0.80 → 'A' (top 80% of value/quantity).
  --   cumulative/total ≤ 0.95 → 'B' (next 15%).
  --   otherwise 'C'.
  classified AS (
    SELECT r.*,
           CASE
             WHEN r.total_basis = 0 THEN 'C'
             WHEN (r.cumulative_basis / NULLIF(r.total_basis, 0)) <= 0.80 THEN 'A'
             WHEN (r.cumulative_basis / NULLIF(r.total_basis, 0)) <= 0.95 THEN 'B'
             ELSE 'C'
           END AS abc_class
      FROM ranked r
  )
  -- Final select: LEFT JOIN to enrich with farm_name + projection
  -- of the boolean reorder_recommended flag with the 7-day lead-time
  -- heuristic documented in design doc §5.6.
  SELECT c.item_id,
         c.item_name,
         c.farm_id,
         f.name                                  AS farm_name,
         c.item_unit,
         c.item_category,
         c.on_hand_qty::numeric,
         COALESCE(c.reorder_point, 0)::numeric   AS reorder_point,
         c.avg_daily_consumption::numeric,
         c.abc_class,
         (c.on_hand_qty <= COALESCE(c.reorder_point, 0)
          OR (c.on_hand_qty - (c.avg_daily_consumption * 7))
              <= COALESCE(c.reorder_point, 0)) AS reorder_recommended,
         p_basis::text                           AS basis,
         wb.d_from::date                         AS period_from,
         wb.d_to::date                           AS period_to
    FROM classified c
    JOIN public.farms f
      ON f.id = c.farm_id
    CROSS JOIN window_bounds wb
   WHERE (
     -- ABC filter: NULL = show all classes (NULL-tolerant so items
     -- with no movement still surface).
           p_abc_class IS NULL
        OR c.abc_class IS NOT DISTINCT FROM p_abc_class
       )
     AND (
     -- Reorder-needed-only toggle: NULL/FALSE = all items, TRUE = only
     -- items whose on_hand has fallen below the configured reorder_point.
           COALESCE(p_reorder_needed_only, FALSE) = FALSE
        OR c.on_hand_qty <= COALESCE(c.reorder_point, 0)
       )
   ORDER BY (c.on_hand_qty <= COALESCE(c.reorder_point, 0)) DESC,
            c.abc_class NULLS LAST,
            c.item_name;
$function$;

CREATE OR REPLACE FUNCTION public.reporting_sales_transfers_v3(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_farm_id uuid DEFAULT NULL::uuid, p_item_id uuid DEFAULT NULL::uuid, p_txn_type text DEFAULT NULL::text)
 RETURNS TABLE(txn_id uuid, txn_date date, txn_type text, source_farm text, dest_farm text, customer_name text, item_id uuid, item_name text, item_unit text, qty numeric, unit_price numeric, amount numeric, reference_no text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT t.id                                   AS txn_id,
         t.txn_date,
         t.txn_type::text                       AS txn_type,
         f.name                                 AS source_farm,
         CASE WHEN t.txn_type::text = 'transfer_out'
              AND t.source_type = 'farm'
              THEN dest_f.name
              ELSE NULL
         END                                    AS dest_farm,
         NULL::text                             AS customer_name,
         fi.id                                  AS item_id,
         fi.name                                AS item_name,
         fi.unit                                AS item_unit,
         CASE WHEN t.txn_type::text IN ('transfer_out', 'consumption', 'waste', 'sale')
              THEN t.qty_out
              ELSE t.qty_in
         END                                    AS qty,
         t.unit_price,
         CASE WHEN t.unit_price IS NOT NULL
              THEN (CASE WHEN t.txn_type::text IN ('transfer_out','consumption','waste','sale')
                         THEN t.qty_out
                         ELSE t.qty_in
                    END) * t.unit_price
              ELSE NULL
         END                                    AS amount,
         t.reference_no
    FROM public.inventory_transactions t
    JOIN public.farm_items fi
      ON fi.id = t.item_id AND fi.farm_id = t.farm_id
    JOIN public.farms f
      ON f.id = t.farm_id
    LEFT JOIN public.farms dest_f
      ON t.source_type = 'farm'
     AND dest_f.id = t.source_id
   WHERE t.txn_type::text IN ('transfer_in','transfer_out','sale')
     AND (p_date_from IS NULL OR t.txn_date >= p_date_from)
     AND (p_date_to   IS NULL OR t.txn_date <= p_date_to)
     AND (p_farm_id   IS NULL OR t.farm_id  = p_farm_id)
     AND (p_item_id   IS NULL OR t.item_id  = p_item_id)
     AND (p_txn_type  IS NULL OR t.txn_type::text = p_txn_type)
   ORDER BY t.txn_date DESC, t.txn_ts DESC, t.id DESC;
$function$;

CREATE OR REPLACE FUNCTION public.reporting_suppliers_list(p_farm_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text, p_is_active boolean DEFAULT NULL::boolean, p_search text DEFAULT NULL::text)
 RETURNS TABLE(supplier_id uuid, name text, status text, usage_count bigint, total_purchases_rial numeric, first_purchase_date date, last_purchase_date date, farm_count bigint, created_by_username text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH stats AS (
    -- Per-supplier purchase-side aggregates. SEC INVOKER + RLS on
    -- inventory_transactions means non-admin callers only see their
    -- assigned farm's purchases, which is the correct audit shape:
    -- an operator's export of "all suppliers" should reveal how much
    -- THEY have bought from each, not other farms' numbers.
    SELECT t.supplier_id,
           COUNT(t.id)                              AS usage_count,
           SUM(t.total_price)                       AS total_purchases_rial,
           MIN(t.txn_date)                          AS first_purchase_date,
           MAX(t.txn_date)                          AS last_purchase_date,
           COUNT(DISTINCT t.farm_id)                AS farm_count
      FROM public.inventory_transactions t
     WHERE t.txn_type::text = 'purchase'
       AND t.supplier_id IS NOT NULL
       AND (p_farm_id IS NULL OR t.farm_id = p_farm_id)
     GROUP BY t.supplier_id
  ),
  category_filter AS (
    -- EXISTS helper for the (p_farm_id, p_category) scope: which
    -- suppliers have shipped items into this farm/category at least
    -- once. When BOTH filters are NULL the EXISTS short-circuits to
    -- TRUE so every supplier qualifies.
    SELECT s.id AS supplier_id
      FROM public.suppliers s
     WHERE (
       (p_farm_id IS NULL AND p_category IS NULL) OR
       EXISTS (
         SELECT 1
           FROM public.inventory_transactions it
           LEFT JOIN public.farm_items fi ON fi.id = it.item_id
          WHERE it.supplier_id = s.id
            AND it.txn_type::text = 'purchase'
            AND (p_farm_id IS NULL OR it.farm_id = p_farm_id)
            AND (p_category IS NULL OR fi.category::text = p_category)
       )
     )
  )
  SELECT s.id                                              AS supplier_id,
         s.name                                            AS name,
         CASE WHEN s.is_active THEN 'فعال' ELSE 'غیرفعال' END AS status,
         COALESCE(st.usage_count, 0)::bigint               AS usage_count,
         COALESCE(st.total_purchases_rial, 0)::numeric     AS total_purchases_rial,
         st.first_purchase_date                            AS first_purchase_date,
         st.last_purchase_date                             AS last_purchase_date,
         COALESCE(st.farm_count, 0)::bigint                AS farm_count,
         p.username                                        AS created_by_username,
         s.created_at                                      AS created_at
    FROM public.suppliers s
    JOIN category_filter cf ON cf.supplier_id = s.id
    LEFT JOIN stats       st ON st.supplier_id = s.id
    LEFT JOIN public.profiles p ON p.id = s.created_by
   WHERE (p_is_active IS NULL OR s.is_active = p_is_active)
     AND (p_search IS NULL OR s.name ILIKE '%' || p_search || '%')
   ORDER BY s.name ASC;
$function$;

CREATE OR REPLACE FUNCTION public.revert_daily_sheet(p_voucher_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_voucher RECORD;
BEGIN
    -- Get voucher
    SELECT * INTO v_voucher FROM daily_vouchers WHERE id = p_voucher_id;
    
    IF v_voucher IS NULL THEN
        RAISE EXCEPTION 'VOUCHER_NOT_FOUND: حواله یافت نشد';
    END IF;

    IF NOT has_farm_access(v_voucher.farm_id) THEN
        RAISE EXCEPTION 'ACCESS_DENIED: شما به این فارم دسترسی ندارید';
    END IF;

    IF v_voucher.status NOT IN ('submitted') THEN
        RAISE EXCEPTION 'INVALID_STATUS: فقط حواله‌های ثبت شده قابل برگشت هستند';
    END IF;

    IF v_voucher.status = 'locked' THEN
        RAISE EXCEPTION 'VOUCHER_LOCKED: این حواله قفل شده و قابل برگشت نیست';
    END IF;

    -- Check 24h window
    IF v_voucher.submitted_at IS NOT NULL 
       AND NOW() - v_voucher.submitted_at >= INTERVAL '24 hours' THEN
        UPDATE daily_vouchers 
        SET status = 'locked', locked_at = NOW()
        WHERE id = p_voucher_id;
        RAISE EXCEPTION 'VOUCHER_LOCKED: زمان برگشت این حواله به پایان رسیده است';
    END IF;

    IF get_user_role() NOT IN ('admin', 'operator') THEN
        RAISE EXCEPTION 'ACCESS_DENIED: شما اجازه برگشت ندارید';
    END IF;

    -- Remove inventory transactions
    DELETE FROM inventory_transactions
    WHERE source_type = 'daily_voucher' AND source_id = p_voucher_id;

    -- Update voucher status
    UPDATE daily_vouchers SET 
        status = 'draft',
        reverted_by = auth.uid(),
        reverted_at = NOW(),
        submitted_at = NULL,
        submitted_by = NULL,
        updated_at = NOW()
    WHERE id = p_voucher_id;

    RETURN json_build_object(
        'success', TRUE,
        'message', 'حواله به حالت پیش‌نویس برگشت داده شد'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_create_farm(p_name text, p_code text, p_address text, p_phone text, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result uuid;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  INSERT INTO public.farms (name, code, address, phone, is_active)
  VALUES (trim(p_name), trim(p_code), NULLIF(trim(p_address),''), NULLIF(trim(p_phone),''), p_is_active)
  RETURNING id INTO result;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_create_farm_item(p_farm_id uuid, p_category text, p_name text, p_unit text, p_priority integer, p_reorder_point numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result uuid;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  INSERT INTO public.farm_items
    (farm_id, category, name, unit, priority, reorder_point, is_active)
  VALUES (p_farm_id, p_category, trim(p_name), COALESCE(NULLIF(trim(p_unit),''), 'کیلوگرم'),
          COALESCE(p_priority, 0), COALESCE(p_reorder_point, 0), true)
  RETURNING id INTO result;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_create_formula(p_farm_id uuid, p_formula_no integer, p_name text, p_mixer_weight numeric, p_is_active boolean, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  fid uuid;
  item jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
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
  VALUES (trim(p_name), p_category, COALESCE(NULLIF(trim(p_default_unit),''), 'کیلوگرم'),
          NULLIF(trim(p_description),''), p_is_active, auth.uid())
  RETURNING id INTO result;
  RETURN result;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'نام نهاده قبلاً ثبت شده است';
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_create_supplier(p_name text, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result uuid;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  INSERT INTO public.suppliers (name, is_active, created_by)
  VALUES (trim(p_name), p_is_active, auth.uid())
  RETURNING id INTO result;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_farm(p_id uuid, p_hard boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  IF p_hard THEN
    DELETE FROM public.farms WHERE id = p_id;
  ELSE
    UPDATE public.farms SET is_active = false, updated_at = now() WHERE id = p_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_farm_item(p_item_id uuid, p_hard boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  IF p_hard THEN
    DELETE FROM public.farm_items WHERE id = p_item_id;
  ELSE
    UPDATE public.farm_items SET is_active = false WHERE id = p_item_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_formula(p_formula_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  DELETE FROM public.farm_formula_items WHERE formula_id = p_formula_id;
  DELETE FROM public.farm_feed_formulas WHERE id = p_formula_id;
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
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
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

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_inventory_txn(p_txn_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  DELETE FROM public.inventory_transactions WHERE id = p_txn_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_supplier(p_id uuid, p_hard boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  IF p_hard THEN
    DELETE FROM public.suppliers WHERE id = p_id;
  ELSE
    UPDATE public.suppliers SET is_active = false, updated_at = now() WHERE id = p_id;
  END IF;
END;
$function$;

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
  item record;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  SELECT name, mixer_weight, is_active INTO src_name, src_weight, src_active
    FROM public.farm_feed_formulas WHERE id = p_source_formula_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'فرمول مبدأ یافت نشد'; END IF;
  IF EXISTS (SELECT 1 FROM public.farm_feed_formulas f, public.farm_feed_formulas s
              WHERE s.id = p_source_formula_id
                AND f.farm_id = s.farm_id AND f.formula_no = p_new_no) THEN
    RAISE EXCEPTION 'شماره فرمول % قبلاً وجود دارد', p_new_no;
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
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_get_profile(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;
  SELECT to_jsonb(p.*) INTO result FROM public.profiles p WHERE id = p_user_id;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_hard_delete_profile(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  DELETE FROM public.profiles WHERE id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_log_activity(p_action text, p_resource_type text, p_resource_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_activity_logs (user_id, action, resource_type, resource_id)
  VALUES (auth.uid(), p_action, p_resource_type, NULLIF(p_resource_id, ''));
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_soft_delete_profile(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  UPDATE public.profiles SET is_active = false, updated_at = now() WHERE id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_toggle_farm(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_active boolean;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  UPDATE public.farms
    SET is_active = NOT is_active, updated_at = now()
    WHERE id = p_id
    RETURNING is_active INTO new_active;
  RETURN new_active;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_toggle_formula(p_formula_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_active boolean;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  UPDATE public.farm_feed_formulas
    SET is_active = NOT is_active, updated_at = now()
    WHERE id = p_formula_id
    RETURNING is_active INTO new_active;
  RETURN new_active;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_toggle_input(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_active boolean;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  UPDATE public.inputs
    SET is_active = NOT is_active, updated_at = now()
    WHERE id = p_id
    RETURNING is_active INTO new_active;
  RETURN new_active;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_toggle_profile(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  UPDATE public.profiles
    SET is_active = NOT is_active,
        updated_at = now()
    WHERE id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_toggle_supplier(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_active boolean;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  UPDATE public.suppliers
    SET is_active = NOT is_active, updated_at = now()
    WHERE id = p_id
    RETURNING is_active INTO new_active;
  RETURN new_active;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_farm(p_id uuid, p_name text, p_code text, p_address text, p_phone text, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  UPDATE public.farms SET
    name = trim(p_name), code = trim(p_code),
    address = NULLIF(trim(p_address),''), phone = NULLIF(trim(p_phone),''),
    is_active = p_is_active, updated_at = now()
  WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_formula(p_formula_id uuid, p_name text, p_mixer_weight numeric, p_is_active boolean, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE item jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
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
    name = trim(p_name),
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

CREATE OR REPLACE FUNCTION public.rpc_admin_update_inventory_txn(p_txn_id uuid, p_qty_in numeric, p_qty_out numeric, p_txn_date date, p_notes text, p_reference text, p_unit_price numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_supplier(p_id uuid, p_name text, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  UPDATE public.suppliers SET name = trim(p_name), is_active = p_is_active, updated_at = now()
  WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_upsert_profile(p_id uuid, p_username text, p_role text, p_first_name text, p_last_name text, p_phone text, p_farm_id uuid, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result uuid;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;
  IF p_role NOT IN ('admin','supervisor','operator') THEN
    RAISE EXCEPTION 'نقش نامعتبر: %', p_role;
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
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_inventory_txn(p_farm_id uuid, p_item_id uuid, p_txn_date date, p_txn_type text, p_qty_in numeric, p_qty_out numeric, p_unit_price numeric, p_reference text, p_notes text, p_supplier_id uuid, p_source_type text, p_source_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE tid uuid;
BEGIN
  IF NOT has_farm_access_v2(p_farm_id) THEN
    RAISE EXCEPTION 'ACCESS_DENIED: دسترسی غیرمجاز';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.farm_items WHERE id = p_item_id AND farm_id = p_farm_id) THEN
    RAISE EXCEPTION 'ITEM_FARM_MISMATCH: آیتم متعلق به این فارم نیست';
  END IF;
  IF p_txn_type NOT IN ('initial','purchase','consumption','waste',
                        'transfer_in','transfer_out','adjustment') THEN
    RAISE EXCEPTION 'نوع تراکنش نامعتبر است';
  END IF;
  IF p_txn_type = 'adjustment' AND (p_notes IS NULL OR trim(p_notes) = '') THEN
    RAISE EXCEPTION 'توضیحات تعدیل الزامی است';
  END IF;
  INSERT INTO public.inventory_transactions
    (farm_id, item_id, txn_date, txn_type, qty_in, qty_out,
     unit_price, total_price, reference_no, notes, supplier_id,
     source_type, source_id, created_by)
  VALUES
    (p_farm_id, p_item_id, p_txn_date, p_txn_type::txn_type_enum,
     COALESCE(p_qty_in, 0), COALESCE(p_qty_out, 0),
     NULLIF(p_unit_price, 0),
     CASE WHEN p_unit_price IS NOT NULL AND p_qty_in IS NOT NULL
          THEN p_unit_price * p_qty_in ELSE NULL END,
     NULLIF(trim(p_reference), ''),
     NULLIF(trim(p_notes), ''),
     NULLIF(p_supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
     NULLIF(trim(p_source_type), ''),
     NULLIF(trim(p_source_id), '')::uuid,
     auth.uid())
  RETURNING id INTO tid;
  RETURN tid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_or_create_draft_voucher(p_farm_id uuid, p_date date, p_category text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE vid uuid;
BEGIN
  IF NOT has_farm_access_v2(p_farm_id) THEN
    RAISE EXCEPTION 'ACCESS_DENIED: دسترسی غیرمجاز';
  END IF;
  IF p_category NOT IN ('feed','packaging') THEN
    RAISE EXCEPTION 'INVALID_CATEGORY: دسته‌بندی نامعتبر است';
  END IF;
  SELECT id INTO vid FROM public.daily_vouchers
   WHERE farm_id = p_farm_id AND voucher_date = p_date AND category = p_category;
  IF vid IS NULL THEN
    INSERT INTO public.daily_vouchers (farm_id, voucher_date, category, status)
    VALUES (p_farm_id, p_date, p_category, 'draft')
    RETURNING id INTO vid;
  END IF;
  RETURN vid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_initial_stock_exists(p_farm_id uuid, p_item_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.inventory_transactions
    WHERE farm_id = p_farm_id AND item_id = p_item_id AND txn_type = 'initial'
  );
$function$;

CREATE OR REPLACE FUNCTION public.rpc_supplier_usage_count(p_supplier_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::int FROM public.inventory_transactions
  WHERE supplier_id = p_supplier_id
    AND txn_type NOT IN ('consumption','waste','transfer_out');
$function$;

CREATE OR REPLACE FUNCTION public.rpc_upsert_voucher_line(p_voucher_id uuid, p_item_id uuid, p_formula_no text, p_mixer_count numeric, p_hall_numbers text, p_consumed numeric, p_waste numeric, p_notes text, p_hall_consumed jsonb, p_formula_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE lid uuid; v_farm uuid; v_status voucher_status_enum; v_item_farm uuid;
BEGIN
  SELECT farm_id, status INTO v_farm, v_status
    FROM public.daily_vouchers WHERE id = p_voucher_id;
  IF v_farm IS NULL THEN
    RAISE EXCEPTION 'VOUCHER_NOT_FOUND: حواله یافت نشد';
  END IF;
  IF NOT has_farm_access_v2(v_farm) THEN
    RAISE EXCEPTION 'ACCESS_DENIED: دسترسی غیرمجاز';
  END IF;
  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'VOUCHER_LOCKED: این حواله قفل شده است';
  END IF;
  SELECT farm_id INTO v_item_farm FROM public.farm_items WHERE id = p_item_id;
  IF v_item_farm IS DISTINCT FROM v_farm THEN
    RAISE EXCEPTION 'ITEM_FARM_MISMATCH: آیتم متعلق به این فارم نیست';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.save_daily_sheet(p_voucher_id uuid, p_lines jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_voucher RECORD;
    v_line JSONB;
    v_item_id UUID;
BEGIN
    -- Get voucher and check access
    SELECT * INTO v_voucher FROM daily_vouchers WHERE id = p_voucher_id;
    
    IF v_voucher IS NULL THEN
        RAISE EXCEPTION 'VOUCHER_NOT_FOUND: حواله یافت نشد';
    END IF;

    IF NOT has_farm_access(v_voucher.farm_id) THEN
        RAISE EXCEPTION 'ACCESS_DENIED: شما به این فارم دسترسی ندارید';
    END IF;

    IF v_voucher.status = 'locked' THEN
        RAISE EXCEPTION 'VOUCHER_LOCKED: این حواله قفل شده و قابل ویرایش نیست';
    END IF;

    IF get_user_role() NOT IN ('admin', 'operator') THEN
        RAISE EXCEPTION 'ACCESS_DENIED: شما اجازه ویرایش ندارید';
    END IF;

    -- Upsert each line
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        
        INSERT INTO daily_voucher_lines (
            voucher_id, item_id, formula_no, mixer_count, hall_numbers,
            consumed_qty, waste_qty, notes, updated_at
        ) VALUES (
            p_voucher_id,
            v_item_id,
            NULLIF(v_line->>'formula_no', ''),
            NULLIF((v_line->>'mixer_count')::NUMERIC, 0),
            NULLIF(v_line->>'hall_numbers', ''),
            COALESCE((v_line->>'consumed_qty')::NUMERIC, 0),
            COALESCE((v_line->>'waste_qty')::NUMERIC, 0),
            NULLIF(v_line->>'notes', ''),
            NOW()
        )
        ON CONFLICT (voucher_id, item_id) DO UPDATE SET
            formula_no = EXCLUDED.formula_no,
            mixer_count = EXCLUDED.mixer_count,
            hall_numbers = EXCLUDED.hall_numbers,
            consumed_qty = EXCLUDED.consumed_qty,
            waste_qty = EXCLUDED.waste_qty,
            notes = EXCLUDED.notes,
            updated_at = NOW();
    END LOOP;

    -- Update voucher timestamp
    UPDATE daily_vouchers SET updated_at = NOW() WHERE id = p_voucher_id;

    RETURN json_build_object('success', TRUE, 'message', 'ذخیره شد');
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_daily_voucher(p_voucher_id uuid, p_farm_id uuid, p_voucher_date date, p_items jsonb, p_ignore_window boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item JSONB;
  v_voucher_status TEXT;
  v_voucher_farm uuid;
  v_submitted_at timestamptz;
  v_balance NUMERIC;
  v_consumed NUMERIC;
  v_waste NUMERIC;
  v_adjust NUMERIC;
  v_projected NUMERIC;
  v_needed NUMERIC;
  v_item_name TEXT;
  v_item_unit TEXT;
  v_negative_items JSONB := '[]'::JSONB;
  v_has_negative BOOLEAN := FALSE;
BEGIN
  SELECT status, farm_id, submitted_at INTO v_voucher_status, v_voucher_farm, v_submitted_at
    FROM daily_vouchers WHERE id = p_voucher_id;

  IF v_voucher_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'VOUCHER_NOT_FOUND', 'message', 'حواله یافت نشد');
  END IF;

  IF v_voucher_farm IS DISTINCT FROM p_farm_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'FARM_MISMATCH', 'message', 'عدم تطابق فارم حواله');
  END IF;

  IF NOT has_farm_access_v2(p_farm_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'ACCESS_DENIED', 'message', 'شما به این فارم دسترسی ندارید');
  END IF;

  IF get_user_role() NOT IN ('admin', 'operator') THEN
    RETURN jsonb_build_object('success', false, 'code', 'ACCESS_DENIED', 'message', 'شما اجازه ثبت نهایی ندارید');
  END IF;

  -- 24h edit window: auto-lock a submitted voucher once the window has
  -- elapsed, unless an admin is explicitly overriding it.
  IF v_voucher_status = 'submitted'
     AND v_submitted_at IS NOT NULL
     AND (NOW() - v_submitted_at) >= INTERVAL '24 hours'
     AND NOT (p_ignore_window AND is_current_user_admin()) THEN
    UPDATE daily_vouchers
       SET status = 'locked', locked_at = NOW()
     WHERE id = p_voucher_id;
    RETURN jsonb_build_object('success', false, 'code', 'VOUCHER_LOCKED', 'message', 'زمان ویرایش این حواله به پایان رسیده است');
  END IF;

  IF v_voucher_status = 'locked' AND NOT (p_ignore_window AND is_current_user_admin()) THEN
    RETURN jsonb_build_object('success', false, 'code', 'VOUCHER_LOCKED', 'message', 'این حواله قفل شده و قابل ثبت نیست');
  END IF;

  -- Serialize concurrent submits on the same items: lock existing stock
  -- rows for this farm + the items in this voucher so two simultaneous
  -- submits cannot both pass the stock check and drive stock negative.
  PERFORM 1
    FROM inventory_transactions
   WHERE farm_id = p_farm_id
     AND item_id IN (SELECT (v->>'item_id')::uuid FROM jsonb_array_elements(p_items) v)
   FOR UPDATE;

  -- Validate no negative stock (excluding this voucher's own existing
  -- rows, which are about to be deleted and re-created).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.farm_items
       WHERE id = (v_item->>'item_id')::uuid AND farm_id = p_farm_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'code', 'ITEM_FARM_MISMATCH', 'message', 'آیتم متعلق به این فارم نیست');
    END IF;

    SELECT COALESCE(SUM(qty_in - qty_out), 0)
      INTO v_balance
      FROM inventory_transactions
     WHERE farm_id = p_farm_id
       AND item_id = (v_item->>'item_id')::uuid
       AND (source_type IS DISTINCT FROM 'daily_voucher' OR source_id IS DISTINCT FROM p_voucher_id);

    v_consumed := COALESCE((v_item->>'consumed_qty')::NUMERIC, 0);
    v_waste    := COALESCE((v_item->>'waste_qty')::NUMERIC, 0);
    v_adjust   := COALESCE((v_item->>'adjustment_qty')::NUMERIC, 0);

    v_projected := v_balance + v_adjust - v_consumed - v_waste;

    IF v_projected < 0 THEN
      v_has_negative := TRUE;
      SELECT name, unit INTO v_item_name, v_item_unit
        FROM public.farm_items WHERE id = (v_item->>'item_id')::uuid;
      v_needed := v_consumed + v_waste;
      v_negative_items := v_negative_items || jsonb_build_object(
        'item_id', (v_item->>'item_id')::uuid,
        'item_name', v_item_name,
        'unit', v_item_unit,
        'current_balance', v_balance,
        'needed', v_needed,
        'shortage', -v_projected
      );
    END IF;
  END LOOP;

  IF v_has_negative THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'NEGATIVE_STOCK',
      'message', 'موجودی برخی اقلام کافی نیست',
      'items', v_negative_items
    );
  END IF;

  -- مرحله ۱: حذف تراکنش‌های قبلی این حواله
  DELETE FROM inventory_transactions
  WHERE source_type = 'daily_voucher'
    AND source_id = p_voucher_id;

  -- مرحله ۲: ثبت تراکنش‌های جدید
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'consumed_qty')::NUMERIC > 0 THEN
      INSERT INTO inventory_transactions (
        farm_id, item_id, txn_date, txn_type,
        qty_out, qty_in, source_type, source_id, created_by
      ) VALUES (
        p_farm_id,
        (v_item->>'item_id')::UUID,
        p_voucher_date,
        'consumption',
        (v_item->>'consumed_qty')::NUMERIC,
        0,
        'daily_voucher',
        p_voucher_id,
        auth.uid()
      );
    END IF;

    IF (v_item->>'waste_qty')::NUMERIC > 0 THEN
      INSERT INTO inventory_transactions (
        farm_id, item_id, txn_date, txn_type,
        qty_out, qty_in, source_type, source_id, created_by
      ) VALUES (
        p_farm_id,
        (v_item->>'item_id')::UUID,
        p_voucher_date,
        'waste',
        (v_item->>'waste_qty')::NUMERIC,
        0,
        'daily_voucher',
        p_voucher_id,
        auth.uid()
      );
    END IF;

    IF (v_item->>'adjustment_qty')::NUMERIC <> 0 THEN
      INSERT INTO inventory_transactions (
        farm_id, item_id, txn_date, txn_type,
        qty_out, qty_in, source_type, source_id, created_by
      ) VALUES (
        p_farm_id,
        (v_item->>'item_id')::UUID,
        p_voucher_date,
        'adjustment',
        CASE WHEN (v_item->>'adjustment_qty')::NUMERIC < 0
             THEN ABS((v_item->>'adjustment_qty')::NUMERIC) ELSE 0 END,
        CASE WHEN (v_item->>'adjustment_qty')::NUMERIC > 0
             THEN (v_item->>'adjustment_qty')::NUMERIC ELSE 0 END,
        'daily_voucher',
        p_voucher_id,
        auth.uid()
      );
    END IF;
  END LOOP;

  -- مرحله ۳: بروزرسانی وضعیت حواله
  UPDATE daily_vouchers
  SET
    status = 'submitted',
    submitted_at = NOW(),
    submitted_by = auth.uid()
  WHERE id = p_voucher_id;

  RETURN jsonb_build_object('success', true, 'code', 'OK', 'message', 'حواله با موفقیت ثبت شد');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'code', 'ERROR',
    'message', CASE WHEN SQLERRM ~ '[^\x00-\x7F]' AND SQLERRM !~ '[a-zA-Z]'
                    THEN SQLERRM ELSE 'خطای غیرمنتظره‌ای رخ داد' END,
    'detail', SQLERRM
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.unit_class(p_unit text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE p_unit
    WHEN 'کیلوگرم' THEN 'mass'
    WHEN 'گرم'     THEN 'mass'
    WHEN 'تن'      THEN 'mass'
    WHEN 'لیتر'    THEN 'volume'
    WHEN 'متر مکعب' THEN 'volume'
    WHEN 'عدد'     THEN 'count'
    WHEN 'کیسه'    THEN 'count'
    WHEN 'بسته'    THEN 'count'
    WHEN 'کارتن'   THEN 'count'
    WHEN 'شانه'    THEN 'count'
    WHEN 'رول'     THEN 'count'
    WHEN 'متر'     THEN 'length'
    ELSE 'other:' || p_unit
  END;
$function$;

