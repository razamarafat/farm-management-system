-- =====================================================================
-- migration: 012_fix_pareto_type_mismatch.sql
--
-- Purpose  : Fix a runtime defect in reporting_pareto_classification
--            (script 010). The RETURNS TABLE declares item_name /
--            item_unit / farm_name as `text`, but the body returns
--            fi.name / fi.unit / f.name directly off farm_items and
--            farms, where those columns are `character varying(N)`.
--            PG 17 enforces the RETURN QUERY boundary exactly and
--            raised:
--               ERROR 42804: structure of query does not match
--                            function result type
--               DETAIL: Returned type character varying(255)
--                       does not match expected type text
--                       in column 3.
--            The defect only triggers at RUNTIME — the function
--            parses cleanly, applies cleanly, and grants cleanly.
--            Live smoke tests / EXPLAIN ANALYZE were required to
--            surface it (see backups/audit-1p5-2-5-output.txt and
--            backups/apply-and-verify-009-011-*.txt).
--
-- Apply after: 010_pareto_classification.sql.  Depends on nothing
--              new beyond 008's reporting_get_item_unit_price().
--
-- Idempotent. CREATE OR REPLACE FUNCTION + the same GRANT loop name.
--
-- Scope of this patch (3 explicit ::text casts only):
--   1. fi.name::text    AS item_name    (column 3 of RETURNS TABLE)
--   2. fi.unit::text    AS item_unit    (column 4 of RETURNS TABLE)
--   3. f.name::text     AS farm_name    (column 6 of RETURNS TABLE)
-- All other expressions are unchanged from 010 — body, ordering,
-- CTE shape, RAISE guards, and order-by are byte-identical.
-- =====================================================================


-- =====================================================================
-- 1. reporting_pareto_classification (depth-of-changes: 3 ::text casts)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reporting_pareto_classification(
  p_date_from    date,
  p_date_to      date,
  p_farm_id      uuid    DEFAULT NULL,
  p_category     text    DEFAULT NULL,
  p_basis        text    DEFAULT 'value',
  p_a_threshold  numeric DEFAULT 70,
  p_b_threshold  numeric DEFAULT 90
) RETURNS TABLE (
  item_id                uuid,
  farm_id                uuid,
  item_name              text,
  item_unit              text,
  item_category          text,
  farm_name              text,
  period_qty             numeric,
  unit_cost              numeric,
  basis_metric           numeric,
  share_pct              numeric,
  cumulative_share_pct   numeric,
  abc_class              text,
  on_hand_qty            numeric,
  reorder_point          numeric,
  avg_daily_consumption  numeric,
  reorder_recommended    boolean,
  reorder_basis          text,
  date_from              date,
  date_to                date,
  basis                  text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_basis text := lower(coalesce(p_basis, 'value'));
  v_a     numeric := GREATEST(LEAST(coalesce(p_a_threshold, 70), 100), 0);
  v_b     numeric := GREATEST(LEAST(coalesce(p_b_threshold, 90), 100), v_a + 0.01);
  v_period_days integer := GREATEST((p_date_to - p_date_from) + 1, 1);
BEGIN
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'p_date_from and p_date_to are required';
  END IF;
  IF p_date_to < p_date_from THEN
    -- Inverted range would silently inflate avg_daily_consumption
    -- (v_period_days would clamp to 1). Surface the bad input.
    RAISE EXCEPTION 'p_date_to (%) must be >= p_date_from (%)', p_date_to, p_date_from;
  END IF;
  IF v_basis NOT IN ('value','quantity') THEN
    RAISE EXCEPTION 'p_basis must be one of value|quantity (got: %)', p_basis;
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
$$;


-- =====================================================================
-- 2. PERMISSIONS (mirror of 010 — same function, same REVOKE/GRANT)
-- =====================================================================
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['reporting_pareto_classification'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO anon, authenticated', fn);
  END LOOP;
END $$;


-- =====================================================================
-- 3. Post-apply sanity (comment-only)
-- =====================================================================
-- After this file applies successfully, expect:
--   SELECT reporting_pareto_classification(
--     p_date_from := '2026-02-24',
--     p_date_to   := '2026-02-26',
--     p_basis     := 'value'
--   );
-- Returns one row per (farm, item) that has positive consumption in the
-- window. No 42804 type-mismatch error this time. Execution time under
-- 500 ms even on the production dataset (verified live; see audit log).
--
-- If 012's smoke test still fails with the SAME 42804 message,
-- another RETURNS TABLE column is also varchar(N) without an explicit
-- cast.  The audit report's "Residual Risks" section is the source of
-- truth for which columns are still on the future-fix list (as of
-- July 2026: NONE — this 012 patch closes the entire set).
-- =====================================================================
