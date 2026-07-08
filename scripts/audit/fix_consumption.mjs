import { sql } from './lib.mjs';

const ddl = `
CREATE OR REPLACE FUNCTION public.reporting_consumption_summary(p_date_from date, p_date_to date, p_farm_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text, p_group_by text DEFAULT 'day'::text)
 RETURNS TABLE(group_key text, group_label text, consumed_qty numeric, waste_qty numeric, total_qty numeric, voucher_count bigint, item_category text)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_gb text := lower(coalesce(p_group_by, 'day'));
BEGIN
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'p_date_from and p_date_to are required';
  END IF;
  IF v_gb NOT IN ('day','item','hall','formula') THEN
    RAISE EXCEPTION 'p_group_by must be one of day|item|hall|formula (got: %)', p_group_by;
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
$function$
`;

await sql(ddl);
console.log('applied CREATE OR REPLACE');

// Re-verify security/volatility preserved + grants intact
const meta = await sql(`
  select p.prosecdef as security_definer, p.provolatile as volatility,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.proname='reporting_consumption_summary' and n.nspname='public'`);
console.log('meta after:', JSON.stringify(meta[0]));
