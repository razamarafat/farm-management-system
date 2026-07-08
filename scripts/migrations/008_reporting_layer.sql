-- =====================================================================
-- migration: 008_reporting_layer.sql
--
-- Purpose  : Reporting-grade SQL layer for the Morvarid-Farm SPA.
--            Four stable RPCs + one helper feed the report catalog
--            (docs/reports/report-catalog.md) with the union,
--            keyset-paginated, grouped, and as-of-snapshot queries
--            that are faster and more correct than re-deriving in JS.
--
-- Apply after: 003, 004, 005, 006, 007  (RLS + write RPCs must exist
--              before this file).
--
-- v0.2 CHANGE LOG (post-review):
--   * `.category`, `.txn_type`, `.status` enum columns are compared
--     against TEXT parameters/literals via `.category::text = p_cat`
--     etc. Postgres does NOT auto-cast between user-defined enums and
--     text; the original operator-less expression raised 42883 at apply.
--   * `REVOKE` loop no longer hard-codes a function signature in the
--     format pattern. Each `reporting_*` name has one signature so
--     name resolution is unambiguous without `(argtype)` qualification.
--   * `consumption_summary(group_by='hall')` filters trailing/leading-
--     comma empty tokens so malformed `hall_numbers` strings don't
--     produce a spurious empty-string bucket.
--
-- Design notes (DO confirm before changing):
--
-- 1. SECURITY INVOKER on every reporting function. RLS does the
--    farm-scope work. 004 already grants admins cross-farm reads
--    (each policy has the explicit `role = 'admin'` fallback in the
--    USING clause). Non-admins see only their assigned farm naturally.
--
-- 2. No service-role key path. The SPA calls these via
--    `supabase.rpc('reporting_inventory_balance_as_of', { p_as_of: ... })`
--    under a user JWT.
--
-- 3. Naming stays in the `public` schema with a `reporting_*` prefix
--    so PostgREST picks them up automatically and grep is easy.
--
-- 4. `p_group_by` is a TEXT parameter with a manual RAISE EXCEPTION
--    guard inside each function. We deliberately avoid creating
--    Postgres ENUM types for reporting axes — they churn too fast
--    relative to DDL cost.
--
-- 5. The ledger uses KEYSET pagination on (txn_ts DESC, id DESC).
--    The date filters (p_date_from, p_date_to) only NARROW the
--    window — they are NOT part of the cursor identity. Clients
--    reproduce bind stability across pages by passing back the
--    LAST row's (txn_ts, id) exactly.
--
-- 6. Running balance across pages is computed honestly:
--    client passes `p_prior_balance` (= the `running_balance` value
--    of the last row from the previous page). Within a page, a
--    window function ordered by (txn_ts ASC, id ASC) gives the
--    within-page cumulative correctly even when displayed DESC.
--
-- 7. Cost basis lookup: a stable helper
--    `reporting_get_item_unit_price(item_id, farm_id, as_of)`
--    encapsulates the "latest purchase unit_price ≤ as_of"
--    query so the main balance-as-of query stays readable. Result
--    is single-row: (unit_price, price_source, priced_on).
--    When no purchase history is available, returns
--    (NULL, 'none', NULL) — caller renders row without a ₨ value.
--
-- 8. Idempotent. Every CREATE is OR REPLACE / IF NOT EXISTS. Re-apply
--    is safe.
-- =====================================================================


-- =====================================================================
-- 0. NEW INDEXES (apply first so planner has them for the apply's own
--    sanity queries). All reference columns that already exist;
--    the existing `idx_inv_txn_farm_item_date` cannot serve the
--    (txn_ts DESC, id DESC) cursor on the ledger.
-- =====================================================================

-- Ledger cursor index — covers (farm_id, item_id, txn_ts DESC, id DESC).
CREATE INDEX IF NOT EXISTS idx_inv_txn_ledger_keyset
  ON public.inventory_transactions
  USING btree (farm_id, item_id, txn_ts DESC, id DESC);

-- Supplier + date for purchase_summary by supplier.
CREATE INDEX IF NOT EXISTS idx_inv_txn_supplier_date
  ON public.inventory_transactions
  USING btree (supplier_id, txn_date DESC, id DESC)
  WHERE supplier_id IS NOT NULL;

-- Per-(formula_id, voucher_id) on lines so consumption_summary by formula
-- doesn't have to scan every submitted voucher line.
CREATE INDEX IF NOT EXISTS idx_daily_voucher_lines_formula
  ON public.daily_voucher_lines
  USING btree (formula_id, voucher_id)
  WHERE formula_id IS NOT NULL;

-- Optional but cheap: explicit (farm_id, txn_type, txn_date) for the
-- type-filtered leg of the ledger and purchase_summary.
CREATE INDEX IF NOT EXISTS idx_inv_txn_farm_type_date
  ON public.inventory_transactions
  USING btree (farm_id, txn_type, txn_date DESC);


-- =====================================================================
-- 1. reporting_get_item_unit_price  (helper)
-- =====================================================================
-- Returns the unit_price (numeric) and provenance to use when valuing
-- stock for a (item, farm) at a point in time.
--
-- Resolution order:
--   1. The most-recent inventory_transactions row where txn_type
--      (`txn_type_enum` cast to text) IN ('purchase','transfer_in'),
--      txn_date ≤ p_as_of, AND unit_price IS NOT NULL AND > 0.
--      (Tie-break: largest txn_ts.)
--   2. (Reserved for future use) farm_items.manual_unit_price — NOT
--      a column in the current schema; this helper returns
--      ('manual', NULL) only when §1 returns nothing. Operators
--      currently pipe a manual override through the SPA's
--      localStorage map (ReorderPointPage.tsx). When the column is
--      added server-side, extend this function to read it; callers do
--      not change.
--   3. (NULL, 'none', NULL) when neither source has data.
--
-- SECURITY INVOKER. RLS gates inventory_transactions and farm_items
-- naturally for non-admins.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reporting_get_item_unit_price(
  p_item_id  uuid,
  p_farm_id  uuid,
  p_as_of    date
) RETURNS TABLE (
  unit_price   numeric,
  price_source text,
  priced_on    date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
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
$$;


-- =====================================================================
-- 2. reporting_inventory_balance_as_of
-- =====================================================================
-- Purpose : K-INV-VAL. Per-item on-hand at as_of_date, with the
--           resolved unit price and a derived ₨ value.
-- Filters : p_farm_id, p_item_id, p_category (all NULL = scope-wide).
--           p_category is text compared against item_category_enum
--           via ::text cast.
-- Output  : one row per (farm, item) with on_hand_qty > 0 OR moved.
-- Order   : category, item_name asc.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reporting_inventory_balance_as_of(
  p_as_of    date,
  p_farm_id  uuid    DEFAULT NULL,
  p_item_id  uuid    DEFAULT NULL,
  p_category text    DEFAULT NULL
) RETURNS TABLE (
  farm_id        uuid,
  item_id        uuid,
  item_name      text,
  item_unit      text,
  item_category  text,
  on_hand_qty    numeric,
  unit_cost      numeric,
  cost_basis     text,
  priced_on      date,
  value_rial     numeric,
  as_of_date     date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
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
$$;


-- =====================================================================
-- 3. reporting_inventory_ledger  (keyset-paginated, append-only)
-- =====================================================================
-- Purpose : RPT-002 / RPT-003 / RPT-009 source of truth.
--           Append-only movement lines + a running_balance that is
--           CORRECT across pages (continuity guaranteed by the caller
--           last-row → p_prior_balance cycle).
-- Pagination:
--   * First page : p_cursor_ts=NULL, p_cursor_id=NULL, p_prior_balance=0.
--   * Next page  : cursor = (txn_ts, id) of the LAST row returned by
--                  the previous page; p_prior_balance = that row's
--                  running_balance value.
-- Window ordering:
--   * Display order       : txn_ts DESC, id DESC.
--   * Running-balance calc: WINDOW ordered txn_ts ASC, id ASC, so the
--                          cumulative per row matches what the user
--                          expects when reading top-down.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reporting_inventory_ledger(
  p_farm_id        uuid         DEFAULT NULL,
  p_item_id        uuid         DEFAULT NULL,
  p_category       text         DEFAULT NULL,
  p_date_from      date         DEFAULT NULL,
  p_date_to        date         DEFAULT NULL,
  p_txn_type       text         DEFAULT NULL,
  p_cursor_ts      timestamptz  DEFAULT NULL,
  p_cursor_id      uuid         DEFAULT NULL,
  p_prior_balance  numeric      DEFAULT 0,
  p_limit          integer      DEFAULT 50
) RETURNS TABLE (
  id                uuid,
  txn_ts            timestamptz,
  txn_date          date,
  txn_type          text,
  farm_id           uuid,
  farm_name         text,
  item_id           uuid,
  item_name         text,
  item_unit         text,
  item_category     text,
  source_type       text,
  source_id         text,
  qty_in            numeric,
  qty_out           numeric,
  unit_price        numeric,
  total_price       numeric,
  reference_no      text,
  notes             text,
  supplier_id       uuid,
  supplier_name     text,
  prior_balance     numeric,
  running_balance   numeric,
  has_more          boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
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
$$;


-- =====================================================================
-- 4. reporting_consumption_summary
-- =====================================================================
-- Purpose : RPT-005 / RPT-006 / RPT-007. Sum of consumed and waste
--           quantities, with optional group_by on day|item|hall|formula.
-- Filters : p_farm_id, p_category (both NULL = scope-wide).
--           p_date_from / p_date_to are REQUIRED.
--           p_group_by ∈ {'day','item','hall','formula'}.
-- Hall parsing (group_by='hall'):
--   daily_voucher_lines.hall_numbers is a comma-separated TEXT field.
--   We split + trim via unnest(string_to_array(...)) into one row per
--   hall token. Empty tokens (from trailing/leading commas or NULL)
--   are filtered out so they don't produce a spurious empty-string
--   bucket. NULL → '__no_hall' bucket.
-- Comparators:
--   v.status (voucher_status_enum)    compared via ::text cast.
--   fi.category (item_category_enum)  compared via ::text cast.
-- =====================================================================
-- NOTE on parameter order: Postgres rule (42P13) — once any param has a
-- DEFAULT, every subsequent param must also have one. The required
-- p_date_from / p_date_to therefore come BEFORE the optional filters.
-- Call sites use named args (see db-contract §5), so call order is
-- independent of declaration order.
CREATE OR REPLACE FUNCTION public.reporting_consumption_summary(
  p_date_from  date,
  p_date_to    date,
  p_farm_id    uuid         DEFAULT NULL,
  p_category   text         DEFAULT NULL,
  p_group_by   text         DEFAULT 'day'
) RETURNS TABLE (
  group_key       text,
  group_label     text,
  consumed_qty    numeric,
  waste_qty       numeric,
  total_qty       numeric,
  voucher_count   bigint,
  item_category   text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
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
    -- fi.name is varchar(255); RETURNS TABLE column `group_label` is text.
    -- PL/pgSQL's return-type check is strict, so cast explicitly (matches
    -- the 'formula' branch). Without ::text this branch raises 42804
    -- "structure of query does not match function result type" at runtime
    -- as soon as any row is returned.
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
     -- Both the explicit '__no_hall' bucket and real hall numbers are
     -- non-empty strings after TRIM(). Discarding empty/NULL drops
     -- spurious buckets from trailing/leading commas or malformed input.
     WHERE e.hall_token <> ''
     GROUP BY e.hall_token
     ORDER BY SUM(e.consumed_qty) DESC, e.hall_token;

  ELSIF v_gb = 'formula' THEN
    RETURN QUERY
    -- COALESCE(f.name, '<literal>') resolves to varchar because
    -- farm_feed_formulas.name is varchar and PG coerces the unknown
    -- literal to match. RETURNS TABLE column `group_label` is text;
    -- PL/pgSQL's return-type check is strict, so we cast explicitly.
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
$$;


-- =====================================================================
-- 5. reporting_purchase_summary
-- =====================================================================
-- Purpose : RPT-004. Sum of purchase-side inbound: qty_in and ₨ value
--           with optional group_by on day|supplier|item.
-- Filters : p_farm_id, p_supplier_id, p_category. p_date_from /
--           p_date_to are REQUIRED. transfer_in rows are EXCLUDED
--           by default — buyer/purchasing semantics only.
-- Comparators:
--   t.txn_type (txn_type_enum) compared via ::text cast.
--   fi.category (item_category_enum) compared via ::text cast.
-- =====================================================================
-- See note above 008 / reporting_consumption_summary about 42P13
-- ordering: required date params come first.
CREATE OR REPLACE FUNCTION public.reporting_purchase_summary(
  p_date_from    date,
  p_date_to      date,
  p_farm_id      uuid         DEFAULT NULL,
  p_supplier_id  uuid         DEFAULT NULL,
  p_category     text         DEFAULT NULL,
  p_group_by     text         DEFAULT 'day'
) RETURNS TABLE (
  group_key       text,
  group_label     text,
  qty_in          numeric,
  total_rial      numeric,
  txn_count       bigint,
  item_category   text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_gb text := lower(coalesce(p_group_by, 'day'));
BEGIN
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'p_date_from and p_date_to are required';
  END IF;
  IF v_gb NOT IN ('day','supplier','item') THEN
    RAISE EXCEPTION 'p_group_by must be one of day|supplier|item (got: %)', p_group_by;
  END IF;

  IF v_gb = 'day' THEN
    RETURN QUERY
    SELECT t.txn_date::text                                                       AS group_key,
           to_char(t.txn_date, 'YYYY-MM-DD')                                      AS group_label,
           COALESCE(SUM(t.qty_in), 0)::numeric                                    AS qty_in,
           COALESCE(SUM(t.total_price) FILTER (WHERE t.total_price IS NOT NULL),
                    0)::numeric                                                    AS total_rial,
           COUNT(*)::bigint                                                        AS txn_count,
           max(fi.category)::text                                                  AS item_category
      FROM public.inventory_transactions t
      JOIN public.farm_items fi ON fi.id = t.item_id AND fi.farm_id = t.farm_id
     WHERE t.txn_type::text = 'purchase'
       AND (p_farm_id     IS NULL OR t.farm_id     = p_farm_id)
       AND (p_supplier_id IS NULL OR t.supplier_id = p_supplier_id)
       AND (p_category    IS NULL OR fi.category::text = p_category)
       AND t.txn_date BETWEEN p_date_from AND p_date_to
     GROUP BY t.txn_date
     ORDER BY t.txn_date;

  ELSIF v_gb = 'supplier' THEN
    RETURN QUERY
    -- Same varchar→text disambiguation as in consumption_summary(formula):
    -- COALESCE(s.name, '<literal>') resolves to varchar; cast back to text.
    SELECT COALESCE(s.id::text,   '__no_supplier')                                AS group_key,
           COALESCE(s.name,       'بدون تأمین‌کننده')::text                       AS group_label,
           COALESCE(SUM(t.qty_in), 0)::numeric,
           COALESCE(SUM(t.total_price) FILTER (WHERE t.total_price IS NOT NULL),
                    0)::numeric,
           COUNT(*)::bigint,
           max(fi.category)::text
      FROM public.inventory_transactions t
      JOIN public.farm_items fi ON fi.id = t.item_id AND fi.farm_id = t.farm_id
      LEFT JOIN public.suppliers s ON s.id = t.supplier_id
     WHERE t.txn_type::text = 'purchase'
       AND (p_farm_id     IS NULL OR t.farm_id     = p_farm_id)
       AND (p_supplier_id IS NULL OR t.supplier_id = p_supplier_id)
       AND (p_category    IS NULL OR fi.category::text = p_category)
       AND t.txn_date BETWEEN p_date_from AND p_date_to
     GROUP BY s.id, s.name
     ORDER BY SUM(t.total_price) DESC NULLS LAST, s.name NULLS LAST;

  ELSIF v_gb = 'item' THEN
    RETURN QUERY
    SELECT fi.id::text                                                            AS group_key,
           fi.name                                                                AS group_label,
           COALESCE(SUM(t.qty_in), 0)::numeric,
           COALESCE(SUM(t.total_price) FILTER (WHERE t.total_price IS NOT NULL),
                    0)::numeric,
           COUNT(*)::bigint,
           max(fi.category)::text
      FROM public.inventory_transactions t
      JOIN public.farm_items fi ON fi.id = t.item_id AND fi.farm_id = t.farm_id
     WHERE t.txn_type::text = 'purchase'
       AND (p_farm_id     IS NULL OR t.farm_id     = p_farm_id)
       AND (p_supplier_id IS NULL OR t.supplier_id = p_supplier_id)
       AND (p_category    IS NULL OR fi.category::text = p_category)
       AND t.txn_date BETWEEN p_date_from AND p_date_to
     GROUP BY fi.id, fi.name
     ORDER BY SUM(t.total_price) DESC NULLS LAST, fi.name;
  END IF;
END;
$$;


-- =====================================================================
-- 6. PERMISSIONS
-- =====================================================================
-- Grant EXECUTE on the five reporting functions + the helper to
-- `anon` (for unauthenticated probes returning empty) and to
-- `authenticated` (the entire SPA audience). The functions are
-- SECURITY INVOKER so RLS gates the actual data.
--
-- Idempotency: REVOKE/GRANT do not throw on missing privileges —
-- safe to re-run after the first apply.
--
-- v0.2 fix: we deliberately do NOT hard-code a function signature in
-- the format string (the previous version embedded `(uuid, uuid, date)`
-- which only matched the helper; the four other functions would have
-- raised `function does not exist` and aborted the DO block). Each
-- `reporting_*` name has exactly one signature in this schema, so the
-- unqualified name resolves cleanly.
-- =====================================================================
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'reporting_get_item_unit_price',
    'reporting_inventory_balance_as_of',
    'reporting_inventory_ledger',
    'reporting_consumption_summary',
    'reporting_purchase_summary'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO anon, authenticated', fn);
  END LOOP;
END $$;


-- =====================================================================
-- 7. Post-apply sanity (comment-only)
-- =====================================================================
-- After this file applies successfully, expect:
--   SELECT proname, prosecdef
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND proname LIKE 'reporting_%';
-- Returns 5 rows, all prosecdef = false (SECURITY INVOKER).
--
--   SELECT indexname FROM pg_indexes
--   WHERE schemaname='public' AND tablename='inventory_transactions'
--   ORDER BY indexname;
-- Now includes (existing + new):
--   idx_inv_txn_farm_item_date       (existing)
--   idx_inv_txn_farm_type_date       (NEW)
--   idx_inv_txn_ledger_keyset        (NEW)
--   idx_inv_txn_supplier_date        (NEW)
--   plus the legacy indexes. No duplicates.
-- =====================================================================
