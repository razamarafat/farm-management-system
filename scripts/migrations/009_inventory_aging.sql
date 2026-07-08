-- =====================================================================
-- migration: 009_inventory_aging.sql
--
-- Purpose  : Add RPT_INVENTORY_AGING source-of-truth RPC to the
--            reporting layer. Per (farm, item) snapshot of:
--              - on_hand_qty
--              - last_movement_date (MAX txn_date WHERE txn_date<=as_of)
--              - days_since_last_movement
--              - age_bucket (0–30 / 31–60 / 61–90 / 90+)
--              - dead_stock (on_hand > 0 AND days_since > threshold)
--              - last priced unit_cost + value_rial (reuses 008 helper)
--
-- Apply after: 008_reporting_layer.sql  (depends on the helper and on
--              farm_items + inventory_transactions having their current
--              schema and indexes).
--
-- Bucket convention (matches AGE_BUCKETS in utils/constants.ts):
--   days_since ∈ [0,30]    → '0-30'
--   days_since ∈ [31,60]   → '31-60'
--   days_since ∈ [61,90]   → '61-90'
--   days_since ≥ 91        → '90+'
--
-- Both bucket boundaries are inclusive (matches the spec example
-- "۰–۳۰ روز / ۳۱–۶۰ روز / ۶۱–۹۰ روز / ۹۰+ روز"). To shift the global
-- threshold, update BOTH this file and AGE_BUCKETS in one commit.
--
-- Dead stock:
--   p_dead_stock_days defaults to 90. A row is flagged dead when
--   on_hand_qty > 0 AND days_since_last_movement >= p_dead_stock_days.
--   Negative on_hand_qty items (overdrawn consumption) are NOT counted
--   as dead stock — that's a separate "negative stock watch" report
--   (RPT-014).
--
-- Idempotent. Every CREATE is OR REPLACE. Re-apply is safe.
-- =====================================================================


-- =====================================================================
-- 1. reporting_inventory_aging
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reporting_inventory_aging(
  p_as_of            date    DEFAULT NULL,
  p_farm_id          uuid    DEFAULT NULL,
  p_category         text    DEFAULT NULL,
  p_dead_stock_days  integer DEFAULT 90
) RETURNS TABLE (
  farm_id                  uuid,
  farm_name                text,
  item_id                  uuid,
  item_name                text,
  item_unit                text,
  item_category            text,
  on_hand_qty              numeric,
  last_movement_date       date,
  days_since_last_movement integer,
  age_bucket               text,
  unit_cost                numeric,
  priced_on                date,
  value_rial               numeric,
  dead_stock               boolean,
  as_of_date               date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH params AS (
    SELECT
      COALESCE(p_as_of, CURRENT_DATE)              AS eff_as_of,
      GREATEST(COALESCE(p_dead_stock_days, 90), 1) AS eff_dsd
  ),
  movements AS (
    -- Per (farm, item) on-hand at eff_as_of via the same shape as
    -- reporting_inventory_balance_as_of. We re-derive here instead of
    -- calling the helper because the bucket assignment depends on
    -- MAX(txn_date) which a balance-only helper doesn't expose.
    SELECT t.farm_id,
           t.item_id,
           SUM(t.qty_in)  FILTER (WHERE t.txn_date <= (SELECT eff_as_of FROM params)) AS sum_in,
           SUM(t.qty_out) FILTER (WHERE t.txn_date <= (SELECT eff_as_of FROM params)) AS sum_out,
           MAX(t.txn_date) FILTER (WHERE t.txn_date <= (SELECT eff_as_of FROM params)) AS last_movement
      FROM public.inventory_transactions t
     WHERE (p_farm_id IS NULL OR t.farm_id = p_farm_id)
       AND EXISTS (
         SELECT 1 FROM public.farm_items fi
           WHERE fi.id = t.item_id AND fi.farm_id = t.farm_id
             AND (p_category IS NULL OR fi.category::text = p_category)
             AND fi.is_active = true
       )
     GROUP BY t.farm_id, t.item_id
  ),
  priced AS (
    SELECT m.farm_id, m.item_id, m.last_movement,
           (COALESCE(m.sum_in,0) - COALESCE(m.sum_out,0))::numeric AS on_hand_qty,
           price.unit_price  AS unit_cost,
           price.priced_on
      FROM movements m
      JOIN public.farm_items fi ON fi.id = m.item_id AND fi.farm_id = m.farm_id
      LEFT JOIN LATERAL public.reporting_get_item_unit_price(
             m.item_id, m.farm_id, (SELECT eff_as_of FROM params)
           ) price ON true
     WHERE (COALESCE(m.sum_in,0) - COALESCE(m.sum_out,0)) <> 0
       AND fi.is_active = true
  )
  SELECT p.farm_id,
         f.name                          AS farm_name,
         p.item_id,
         fi.name                         AS item_name,
         fi.unit                         AS item_unit,
         fi.category                     AS item_category,
         p.on_hand_qty,
         p.last_movement                 AS last_movement_date,
         CASE WHEN p.last_movement IS NULL
              THEN NULL
              ELSE ((SELECT eff_as_of FROM params) - p.last_movement)::int
         END                             AS days_since_last_movement,
         CASE WHEN p.last_movement IS NULL THEN NULL
              WHEN ((SELECT eff_as_of FROM params) - p.last_movement) <= 30 THEN '0-30'
              WHEN ((SELECT eff_as_of FROM params) - p.last_movement) <= 60 THEN '31-60'
              WHEN ((SELECT eff_as_of FROM params) - p.last_movement) <= 90 THEN '61-90'
              ELSE '90+'
         END                             AS age_bucket,
         p.unit_cost,
         p.priced_on,
         CASE WHEN p.unit_cost IS NULL OR p.on_hand_qty <= 0
              THEN NULL
              ELSE p.on_hand_qty * p.unit_cost
         END                             AS value_rial,
         (p.on_hand_qty > 0
          AND p.last_movement IS NOT NULL
          AND ((SELECT eff_as_of FROM params) - p.last_movement)
              >= (SELECT eff_dsd FROM params))::boolean AS dead_stock,
         (SELECT eff_as_of FROM params)  AS as_of_date
    FROM priced p
    JOIN public.farm_items fi ON fi.id = p.item_id AND fi.farm_id = p.farm_id
    JOIN public.farms       f  ON f.id  = p.farm_id
   ORDER BY
     (p.on_hand_qty > 0
      AND p.last_movement IS NOT NULL
      AND ((SELECT eff_as_of FROM params) - p.last_movement)
          >= (SELECT eff_dsd FROM params)) DESC,  -- dead stock first
     ((SELECT eff_as_of FROM params) - p.last_movement) DESC NULLS LAST,
     fi.name;
$$;


-- =====================================================================
-- 2. PERMISSIONS
-- =====================================================================
-- Idempotent: REVOKE + GRANT do not throw on missing privileges.
-- Each `reporting_*` name has exactly one signature so name
-- resolution is unambiguous without `(argtype)` qualification.
-- =====================================================================
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['reporting_inventory_aging'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO anon, authenticated', fn);
  END LOOP;
END $$;


-- =====================================================================
-- 3. Post-apply sanity (comment-only)
-- =====================================================================
-- After this file applies successfully, expect:
--   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND proname = 'reporting_inventory_aging';
-- Returns 1 row.
--
--   SELECT reporting_inventory_aging(
--     p_as_of := CURRENT_DATE,
--     p_farm_id := NULL,
--     p_category := 'feed',
--     p_dead_stock_days := 90
--   );
-- Returns at most one row per (farm_id, item_id) PAIR where on-hand ≠ 0
-- and the item is active. Age buckets are inclusive on both ends.
-- =====================================================================
