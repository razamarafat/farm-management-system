-- =====================================================================
-- migration: 011_reporting_suppliers_list.sql
--
-- Purpose  : Add RPT_SUPPLIERS source-of-truth RPC to the reporting
--            layer. Audit-grade supplier directory with per-supplier
--            usage stats derived from purchase-side inventory_transactions.
--
-- Apply after: 004_rls_policies.sql  (suppliers_select_authenticated
--               policy must exist before SECURITY INVOKER takes effect)
--              008_reporting_layer.sql (filter & filter-naming convention)
--
-- Filter semantics (intentionally documented — the suppliers table does
-- NOT carry `farm_id` or `category` columns, so the SQL implements
-- the join via inventory_transactions):
--
--   * p_farm_id   NULL → no farm scope; non-NULL → restrict to suppliers
--                  having at least one purchase txn in that farm.
--   * p_category  NULL → no category scope; non-NULL → restrict to
--                  suppliers having at least one purchase txn whose
--                  item belongs to that item_category.
--   * p_is_active NULL → both active and inactive rows; TRUE → only
--                  active rows; FALSE → only inactive rows. NEVER
--                  coerced via ||/||null — `false` must round-trip.
--   * p_search    case-insensitive substring match on suppliers.name.
--                  Empty string is treated as NULL via the body's
--                  `body.search || null` shortcut in mapFilters.
--
-- SECURITY model:
--   SECURITY INVOKER. RLS on `suppliers` (authenticated read), on
--   `inventory_transactions` (farm-scope via has_farm_access_v2), and
--   on `profiles` (self-or-admin) all scope the rows naturally for the
--   caller's JWT. We never escalate via SECURITY DEFINER.
--
-- Idempotent. CREATE OR REPLACE + standard REVOKE/GRANT loop.
-- =====================================================================


-- =====================================================================
-- 1. reporting_suppliers_list
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reporting_suppliers_list(
  p_farm_id   uuid    DEFAULT NULL,
  p_category  text    DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_search    text    DEFAULT NULL
) RETURNS TABLE (
  supplier_id           uuid,
  name                  text,
  status                text,
  usage_count           bigint,
  total_purchases_rial  numeric,
  first_purchase_date   date,
  last_purchase_date    date,
  farm_count            bigint,
  created_by_username   text,
  created_at            timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
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
$$;


-- =====================================================================
-- 2. PERMISSIONS
-- =====================================================================
-- Idempotent REVOKE/GRANT. SECURITY INVOKER means RLS does the
-- actual gating; we just need to allow the call to be made under
-- anon + authenticated JWTs.
--
-- Same pattern as 008 / 009 / 010: a single-name array because the
-- schema has exactly one signature for `reporting_suppliers_list`,
-- so `format('%I', fn)` resolves unambiguously without (argtype).
-- =====================================================================
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['reporting_suppliers_list'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO anon, authenticated', fn);
  END LOOP;
END $$;


-- =====================================================================
-- 3. Post-apply sanity (comment-only)
-- =====================================================================
-- After this file applies successfully, expect:
--
--   SELECT proname, prosecdef
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND proname = 'reporting_suppliers_list';
-- Returns 1 row with prosecdef = false (SECURITY INVOKER).
--
--   SELECT reporting_suppliers_list(
--     p_farm_id := NULL,
--     p_category := NULL,
--     p_is_active := true,
--     p_search := NULL
--   );
-- Returns one row per active supplier (no farm/category scope).
-- `usage_count` / `total_purchases_rial` are zero for suppliers with
-- no purchase-side movements. `created_by_username` is NULL when the
-- caller's RLS on profiles prevents seeing the creator row (correct:
-- profiles_self_or_admin policy in 004).
--
--   SELECT reporting_suppliers_list(p_farm_id := '<uuid>');
-- Returns only suppliers that have at least one purchase txn in that
-- farm (one or both filters narrow the EXISTS scope).
-- =====================================================================
