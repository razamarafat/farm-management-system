-- Fix RPT_CONSUMPTION_REPORT hall grouping.
--
-- The prior reporting_consumption_report_v3() hall branch used
-- MAX(f.farm_id) on a uuid, which fails at runtime:
--   function max(uuid) does not exist
--
-- The fix keeps farm_id as a grouping key instead of aggregating it.

CREATE OR REPLACE FUNCTION public.reporting_consumption_report_v3(
  p_date_from     date          DEFAULT NULL,
  p_date_to       date          DEFAULT NULL,
  p_farm_id       uuid          DEFAULT NULL,
  p_category      text          DEFAULT NULL,
  p_group_by      text          DEFAULT 'item',
  p_hall_ids      uuid[]        DEFAULT ARRAY[]::uuid[],
  p_formula_ids   uuid[]        DEFAULT ARRAY[]::uuid[]
) RETURNS TABLE (
  group_key        text,
  group_label      text,
  item_category    text,
  hall_name        text,
  formula_name     text,
  consumed_qty     numeric,
  waste_qty        numeric,
  unit_price       numeric,
  rial_value       numeric,
  closing_balance  numeric,
  voucher_count    bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_gb text := lower(coalesce(p_group_by, 'item'));
BEGIN
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'p_date_from and p_date_to are required';
  END IF;

  IF v_gb NOT IN ('day','item','hall','formula') THEN
    RAISE EXCEPTION 'p_group_by must be one of day|item|hall|formula (got: %)', p_group_by;
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
$$;
