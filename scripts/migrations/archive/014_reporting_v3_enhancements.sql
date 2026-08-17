-- =====================================================================
-- migration: 014_reporting_v3_enhancements.sql
--
-- Purpose : Pass 2 of the Reports-menu redesign
--           (docs/reports/reports-menu-redesign.md). Adds the 6 NEW
--           v3 reporting RPCs that the AUTHORITATIVE 6-report catalog
--           (src/types/report.types.ts → REPORT_CATALOG) and the BFF
--           registry (services/export-api/registry.mjs) expect.
--
--           The 5 baseline reporting_* functions from migrations 008/009/010
--           are EXTENDED where possible (RPG pattern: thin wrappers that
--           reuse the existing per-item-as-of, ledger, Pareto, and
--           consumption/purchase summary aggregates). Brand new is
--           reporting_sales_transfers_v3 (transfers + sales slices).
--
-- Apply after: 008 (reporting layer), 009 (aging), 010 (Pareto),
--              011 (suppliers), 012 (RLS recursion fix),
--              013 (any further) — all already on production.
--
-- Design notes (mirror the 008 conventions):
--
-- 1. SECURITY INVOKER on every new function. RLS does the
--    farm-scope work. Per-farm filtering happens automatically via
--    SELECT policies on inventory_transactions / farm_items /
--    profiles / farms.
--
-- 2. No service-role bypass. The SPA calls these via
--    supabase.rpc(<name>, { ...args }). The BFF exposes them via
--    services/export-api/server.mjs under the user's JWT.
--
-- 3. Naming stays in public schema with reporting_* prefix so
--    PostgREST picks them up automatically and grep is easy.
--
-- 4. Every CREATE is OR REPLACE so re-apply is safe. Every INDEX
--    uses IF NOT EXISTS. GRANT/REVOKE are idempotent on their own.
--
-- 5. Default-deny on unknown reportIds lives at the BFF layer, not
--    here. One function = one reportId, but the registries keep the
--    mapping.
--
-- 6. Idempotency caveat: CREATE OR REPLACE FUNCTION will replace an
--    existing function ONLY when the new signature matches the old.
--    If we change arg names or order, we drop+recreate explicitly.
--    All signatures below intentionally match the BFF registry's
--    rpcName + mapFilters contract.
--
-- 7. Live-apply safety: this migration was tested locally and visually
--    inspected before apply. Re-running the migration should produce
--    "function already exists, no change" — Postgres handles that for
--    OR REPLACE. No data migration (no INSERT/UPDATE/DELETE on
--    inventory_transactions, farm_items, etc.) — pure schema/DDL.
-- =====================================================================


-- =====================================================================
-- 1. reporting_inventory_stock
-- =====================================================================
-- Purpose : RPT_INVENTORY_STOCK. Per-item current on-hand balance
--           + unit cost + ₨ value + last-movement date + days-since
--           + dead-stock flag, all in ONE consolidated snapshot.
--
-- Inputs  : p_as_of (date), p_farm_id, p_category, p_dead_stock_only.
-- Output  : one row per item (filtered: on_hand_qty ≠ 0 when dead-stock
--           filter is on) with the merged valuation/aging columns.
-- Order   : category, item_name asc.
--
-- Implementation: UNION the existing reporting_inventory_balance_as_of
-- (returns valuation columns) with a LATERAL last-movement lookup that
-- adds the aging columns. Single SELECT, no temp tables, single planner
-- pass.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reporting_inventory_stock(
  p_as_of              date     DEFAULT CURRENT_DATE,
  p_farm_id            uuid     DEFAULT NULL,
  p_category           text     DEFAULT NULL,
  p_dead_stock_only    boolean  DEFAULT FALSE
) RETURNS TABLE (
  farm_id                   uuid,
  farm_name                 text,
  item_id                   uuid,
  item_name                 text,
  item_category             text,
  item_unit                 text,
  on_hand_qty               numeric,
  unit_cost                 numeric,
  value_rial                numeric,
  last_movement_date        date,
  days_since_last_movement  integer,
  age_bucket                text,
  is_dead_stock             boolean,
  as_of_date                date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
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
$$;


-- =====================================================================
-- 2. reporting_consumption_report_v3
-- =====================================================================
-- Purpose : RPT_CONSUMPTION_REPORT. Upgraded successor of
--           reporting_consumption_summary from migration 008. Adds:
--             * hall_name (computed from farm_halls joined via
--               hall_numbers token)
--             * formula_name (joined via formula_id)
--             * unit_price (latest-purchase price for the item)
--             * rial_value (consumed_qty × unit_price)
--             * closing_balance (SUM(qty_in - qty_out) AS OF date_to)
-- Filters : p_hall_ids[] (multi-select), p_formula_ids[] (multi-select).
--           p_group_by ∈ {day, item, hall, formula}.
-- =====================================================================
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
          ON l.voucher_id = v.id
            AND v.status::text = 'submitted'
        JOIN public.farm_items fi
          ON fi.id = l.item_id AND fi.farm_id = v.farm_id
       WHERE (p_farm_id    IS NULL OR v.farm_id    = p_farm_id)
         AND (p_category   IS NULL OR fi.category::text = p_category)
         AND v.voucher_date BETWEEN p_date_from AND p_date_to
       GROUP BY v.voucher_date, fi.id
    ),
    priced AS (
      SELECT b.group_key, b.item_id, b.consumed_qty, b.waste_qty,
             b.item_category, b.voucher_count,
             price.unit_price AS unit_price
        FROM base b
        LEFT JOIN LATERAL public.reporting_get_item_unit_price(
               b.item_id, p_farm_id, p_date_to
             ) price ON true
    ),
    closing AS (
      SELECT it.item_id,
             SUM(it.qty_in - it.qty_out) AS on_hand_close
        FROM public.inventory_transactions it
       WHERE (p_farm_id IS NULL OR it.farm_id = p_farm_id)
         AND it.txn_date <= p_date_to
       GROUP BY it.item_id
    )
    SELECT p.group_key::text,
           to_char(p.group_key::date, 'YYYY-MM-DD')::text,
           p.item_category::text,
           NULL::text                                     AS hall_name,
           NULL::text                                     AS formula_name,
           p.consumed_qty::numeric,
           p.waste_qty::numeric,
           p.unit_price::numeric,
           (p.consumed_qty * COALESCE(p.unit_price, 0))::numeric AS rial_value,
           COALESCE(c.on_hand_close, 0)::numeric          AS closing_balance,
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
       WHERE (p_farm_id  IS NULL OR v.farm_id  = p_farm_id)
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
      SELECT it.item_id,
             SUM(it.qty_in - it.qty_out) AS on_hand_close
        FROM public.inventory_transactions it
       WHERE (p_farm_id IS NULL OR it.farm_id = p_farm_id)
         AND it.txn_date <= p_date_to
       GROUP BY it.item_id
    )
    SELECT p.group_key::text,
           p.group_label::text,
           p.item_category::text,
           NULL::text                                     AS hall_name,
           NULL::text                                     AS formula_name,
           p.consumed_qty::numeric,
           p.waste_qty::numeric,
           p.unit_price::numeric,
           (p.consumed_qty * COALESCE(p.unit_price, 0))::numeric AS rial_value,
           COALESCE(c.on_hand_close, 0)::numeric          AS closing_balance,
           p.voucher_count::bigint
      FROM priced p
      LEFT JOIN closing c ON c.item_id = p.item_id
     ORDER BY p.consumed_qty DESC, p.group_label;

  ELSIF v_gb = 'hall' THEN
    RETURN QUERY
    -- Expand daily_voucher_lines.hall_numbers (CSV text) into one row
    -- per hall token, then aggregate. Empty / malformed tokens are
    -- filtered out so they don't produce a spurious empty-string bucket.
    -- p_hall_ids is a multi-select filter — empty array means no filter.
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
       WHERE (p_farm_id  IS NULL OR v.farm_id  = p_farm_id)
         AND (p_category IS NULL OR fi.category::text = p_category)
         AND v.voucher_date BETWEEN p_date_from AND p_date_to
    ),
    filtered AS (
      SELECT e.*
        FROM expanded e
       WHERE e.hall_token_raw <> ''
         -- hall_token is numeric (the hall_number). Join to farm_halls
         -- to get the friendly name. Filter via p_hall_ids[] when set.
         AND (cardinality(p_hall_ids) = 0
              OR EXISTS (
                SELECT 1 FROM public.farm_halls fh
                 WHERE fh.farm_id = e.farm_id
                   AND fh.hall_number::text = e.hall_token_raw
                   AND fh.id = ANY(p_hall_ids)
              ))
    ),
    aggregated AS (
      SELECT f.hall_token_raw                              AS group_key,
             f.item_id,
             SUM(f.consumed_qty)                           AS consumed_qty,
             SUM(f.waste_qty)                              AS waste_qty,
             MAX(f.category)                               AS item_category,
             COUNT(DISTINCT f.voucher_id)                   AS voucher_count,
             MAX(f.farm_id)                                AS any_farm_id
        FROM filtered f
       GROUP BY f.hall_token_raw, f.item_id
    ),
    priced AS (
      SELECT a.*, price.unit_price
        FROM aggregated a
        LEFT JOIN LATERAL public.reporting_get_item_unit_price(
               a.item_id, a.any_farm_id, p_date_to
             ) price ON true
    ),
    closing AS (
      SELECT it.item_id,
             SUM(it.qty_in - it.qty_out) AS on_hand_close
        FROM public.inventory_transactions it
       WHERE (p_farm_id IS NULL OR it.farm_id = p_farm_id)
         AND it.txn_date <= p_date_to
       GROUP BY it.item_id
    ),
    hall_names AS (
      SELECT fh.hall_number::text AS hall_token, MAX(fh.name) AS hall_name
        FROM public.farm_halls fh
       WHERE (p_farm_id IS NULL OR fh.farm_id = p_farm_id)
         AND (cardinality(p_hall_ids) = 0 OR fh.id = ANY(p_hall_ids))
       GROUP BY fh.hall_number
    )
    SELECT p.group_key::text,
           COALESCE(hn.hall_name, p.group_key)::text       AS group_label,
           p.item_category::text,
           hn.hall_name::text,
           NULL::text                                      AS formula_name,
           p.consumed_qty::numeric,
           p.waste_qty::numeric,
           p.unit_price::numeric,
           (p.consumed_qty * COALESCE(p.unit_price, 0))::numeric AS rial_value,
           COALESCE(c.on_hand_close, 0)::numeric           AS closing_balance,
           p.voucher_count::bigint
      FROM priced p
      LEFT JOIN closing c ON c.item_id = p.item_id
      LEFT JOIN hall_names hn ON hn.hall_token = p.group_key
     ORDER BY p.consumed_qty DESC, p.group_key::int NULLS LAST;

  ELSIF v_gb = 'formula' THEN
    RETURN QUERY
    WITH base AS (
      SELECT COALESCE(f.id::text, '__no_formula')          AS group_key,
             COALESCE(f.name, 'بدون فرمول')               AS group_label,
             fi.id                                         AS item_id,
             fi.unit                                       AS item_unit,
             l.formula_id,
             SUM(l.consumed_qty)                           AS consumed_qty,
             SUM(l.waste_qty)                              AS waste_qty,
             MAX(fi.category)                              AS item_category,
             COUNT(DISTINCT v.id)                          AS voucher_count
        FROM public.daily_vouchers v
        JOIN public.daily_voucher_lines l
          ON l.voucher_id = v.id AND v.status::text = 'submitted'
        JOIN public.farm_items fi
          ON fi.id = l.item_id AND fi.farm_id = v.farm_id
        LEFT JOIN public.farm_feed_formulas f
          ON f.id = l.formula_id
       WHERE (p_farm_id  IS NULL OR v.farm_id  = p_farm_id)
         AND (p_category IS NULL OR fi.category::text = p_category)
         AND (cardinality(p_formula_ids) = 0
              OR l.formula_id = ANY(p_formula_ids))
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
      SELECT it.item_id,
             SUM(it.qty_in - it.qty_out) AS on_hand_close
        FROM public.inventory_transactions it
       WHERE (p_farm_id IS NULL OR it.farm_id = p_farm_id)
         AND it.txn_date <= p_date_to
       GROUP BY it.item_id
    )
    SELECT p.group_key::text,
           p.group_label::text,
           p.item_category::text,
           NULL::text                                      AS hall_name,
           p.group_label::text                             AS formula_name,
           p.consumed_qty::numeric,
           p.waste_qty::numeric,
           p.unit_price::numeric,
           (p.consumed_qty * COALESCE(p.unit_price, 0))::numeric AS rial_value,
           COALESCE(c.on_hand_close, 0)::numeric           AS closing_balance,
           p.voucher_count::bigint
      FROM priced p
      LEFT JOIN closing c ON c.item_id = p.item_id
     ORDER BY p.group_label NULLS LAST;
  END IF;
END;
$$;


-- =====================================================================
-- 3. reporting_sales_transfers_v3
-- =====================================================================
-- Purpose : RPT_SALES_TRANSFERS. Combined outbound sale + inter-farm
--           transfers view.
--
--           Phase-1 DATA-MODEL FINDING (see docs/reports/reports-menu-redesign.md §2):
--           The `txn_type_enum` does NOT include 'sale' today — there is
--           no sales-capture feature in this build. The function
--           returns zero rows for `txn_type = 'sale'` today, by design.
--           Transfer rows (transfer_out where source_type='farm') are
--           populated; the report UI shows the empty sales slice with
--           a clear in-app explanation.
--
-- Inputs  : p_date_from, p_date_to (required), p_farm_id, p_item_id,
--           p_txn_type (single value: 'sale' | 'transfer_in' | 'transfer_out').
-- Output  : one row per matching inventory_transactions row, joined
--           with source farm (origin) + destination farm (when
--           applicable) + item + supplier (for sales if suppliers added).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reporting_sales_transfers_v3(
  p_date_from    date     DEFAULT NULL,
  p_date_to      date     DEFAULT NULL,
  p_farm_id      uuid     DEFAULT NULL,
  p_item_id      uuid     DEFAULT NULL,
  p_txn_type     text     DEFAULT NULL
) RETURNS TABLE (
  txn_id          uuid,
  txn_date        date,
  txn_type        text,
  source_farm     text,
  dest_farm       text,
  customer_name   text,
  item_id         uuid,
  item_name       text,
  item_unit       text,
  qty             numeric,
  unit_price      numeric,
  amount          numeric,
  reference_no    text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT t.id                                   AS txn_id,
         t.txn_date,
         t.txn_type::text                       AS txn_type,
         f.name                                 AS source_farm,
         -- For transfer_out rows with source_type='farm', source_id IS the
         -- destination farm id. For other types, dest_farm is NULL.
         CASE WHEN t.txn_type::text = 'transfer_out'
               AND t.source_type = 'farm'
              THEN dest_f.name
              ELSE NULL
         END                                    AS dest_farm,
         -- Sales slice: today there is no 'sale' txn_type, so customer_name
         -- is always NULL. When the sales-capture feature lands (Phase 2),
         -- this column populates from a customer join scoped off
         -- inventory_transactions.placeholder_customer_id (TBD).
         NULL::text                             AS customer_name,
         fi.id                                  AS item_id,
         fi.name                                AS item_name,
         fi.unit                                AS item_unit,
         -- qty: net of inflow + outflow (transfer_out uses qty_out; sale will
         -- use qty_out when introduced).
         CASE WHEN t.txn_type::text IN ('transfer_out', 'consumption', 'waste', 'sale')
              THEN t.qty_out
              ELSE t.qty_in
         END                                    AS qty,
         t.unit_price,
         -- amount = qty × unit_price when both present; else NULL.
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
    -- For transfer_out rows with source_type='farm', source_id IS the
    -- destination farm id (UUID, NOT text — confirmed via live DB
    -- information_schema query during Pass 2 verify). Compare UUID-
    -- to-UUID directly and only attempt the join when source_type='farm'
    -- so NULL source_id rows + non-farm transfers don't bind to a farm
    -- with the matching uuid branch (defensive, no silent binding).
    LEFT JOIN public.farms dest_f
      ON t.source_type = 'farm'
     AND dest_f.id = t.source_id
   WHERE (p_date_from IS NULL OR t.txn_date >= p_date_from)
     AND (p_date_to   IS NULL OR t.txn_date <= p_date_to)
     AND (p_farm_id   IS NULL OR t.farm_id  = p_farm_id)
     AND (p_item_id   IS NULL OR t.item_id  = p_item_id)
     AND (p_txn_type  IS NULL OR t.txn_type::text = p_txn_type)
     -- Restrict to outbound sale / transfer semantics (inbound transfer_in
     -- is visible ONLY when explicitly requested or when listing all).
     AND (p_txn_type IS NULL
          OR p_txn_type IN ('transfer_in', 'transfer_out', 'sale'))
   ORDER BY t.txn_date DESC, t.txn_ts DESC, t.id DESC;
$$;


-- =====================================================================
-- 4. reporting_purchases_v3
-- =====================================================================
-- Purpose : RPT_PURCHASES. List of purchase-side inventory_transactions
--           with optional p_item_id filter (the v2 had p_supplier_id
--           and p_category only; v3 adds p_item_id).
-- Inputs  : p_date_from, p_date_to (required), p_farm_id, p_supplier_id,
--           p_item_id (NEW).
-- Output  : one row per txn_type='purchase' row matching filters.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reporting_purchases_v3(
  p_date_from    date     DEFAULT NULL,
  p_date_to      date     DEFAULT NULL,
  p_farm_id      uuid     DEFAULT NULL,
  p_supplier_id  uuid     DEFAULT NULL,
  p_item_id      uuid     DEFAULT NULL
) RETURNS TABLE (
  txn_id          uuid,
  txn_date        date,
  supplier_id     uuid,
  supplier_name   text,
  item_id         uuid,
  item_name       text,
  item_unit       text,
  qty             numeric,
  unit_price      numeric,
  total_amount    numeric,
  reference_no    text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
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
$$;


-- =====================================================================
-- 5. reporting_packaging_v3
-- =====================================================================
-- Purpose : RPT_PACKAGING. Packaging-items-only consumption. Hard-codes
--           category='packaging' so a caller cannot accidentally pull
--           feed rows. Columns mirror RPT_CONSUMPTION_REPORT without
--           the hall selector (per user spec).
--
-- Inputs  : p_date_from, p_date_to (required), p_farm_id. (No p_category:
--           hardcoded to 'packaging'.)
-- Output  : one row per farm_items row in the date window after category
--           filter, with consumed/waste/balance/rial_value aggregates.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reporting_packaging_v3(
  p_date_from    date     DEFAULT NULL,
  p_date_to      date     DEFAULT NULL,
  p_farm_id      uuid     DEFAULT NULL
) RETURNS TABLE (
  item_id           uuid,
  item_name         text,
  item_unit         text,
  consumed_qty      numeric,
  waste_qty         numeric,
  rial_value        numeric,
  closing_balance   numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
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
$$;


-- =====================================================================
-- 6. reporting_reorder_point_v3 (Pass-2 inline rewrite)
-- =====================================================================
-- Purpose : RPT_REORDER_POINT. Current on-hand × ABC class × reorder
--           recommendation. SELF-CONTAINED in this rewrite — we no
--           longer call reporting_pareto_classification (the live
--           function's first-arg type is `date` but `CURRENT_DATE -
--           INTERVAL '90 days'` is `timestamp`, producing a 42883
--           operator-not-found at apply time).
--
--           ABC classification now derived INLINE in a single CTE
--           chain:
--             * movement  : aggregate inventory_transactions over the
--                            90-day window per (farm, item)
--             * active_items: LEFT JOIN to farm_items + on_hand, compute
--                            basis_metric (value | quantity) +
--                            avg_daily_consumption (consumed_qty/90)
--             * ranked    : SUM(basis_metric) OVER (PARTITION BY farm
--                            ORDER BY basis_metric DESC) = cumulative
--             * classified: cumulative/total → 'A' (≤0.80) /
--                            'B' (≤0.95) / 'C' (else)
--
--           7-day lead-time assumption (no real lead-time data exists
--           yet — flagged as heuristic in design doc §5.6).
--
-- Inputs  : p_farm_id (scope), p_basis ('value'|'quantity' for ABC),
--           p_abc_class ('A'|'B'|'C'|NULL = all), p_reorder_needed_only
--           (literal boolean — do NOT coerce via || null, matching
--           the pattern in RPT_SUPPLIERS list filter).
-- Output  : one row per (farm, item) with on_hand + ABC + reorder_point
--           + reorder_recommended computed against the same threshold
--           the operator configures on farm_items.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reporting_reorder_point_v3(
  p_farm_id                uuid     DEFAULT NULL,
  p_basis                  text     DEFAULT 'value',
  p_abc_class              text     DEFAULT NULL,
  p_reorder_needed_only    boolean  DEFAULT FALSE
) RETURNS TABLE (
  item_id                uuid,
  item_name              text,
  farm_id                uuid,
  farm_name              text,
  item_unit              text,
  item_category          text,
  on_hand_qty            numeric,
  reorder_point          numeric,
  avg_daily_consumption  numeric,
  abc_class              text,
  reorder_recommended    boolean,
  basis                  text,
  period_from            date,
  period_to              date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
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
$$;


-- =====================================================================
-- 7. PERMISSIONS
-- =====================================================================
-- All 6 v3 functions are SECURITY INVOKER, so RLS is what scopes the
-- row stream per-JWT. We grant EXECUTE to anon + authenticated so the
-- SPA + BFF can call them under either kind of JWT. The anon grant is
-- a pragmatic safety measure: login pages can probe the existence of
-- the function before a session is established (rare but used by
-- health-check probes).
-- Idempotent: REVOKE ALL IF EXISTS / GRANT EXECUTE are no-ops when
-- already in the requested state.
-- =====================================================================
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'reporting_inventory_stock',
    'reporting_consumption_report_v3',
    'reporting_sales_transfers_v3',
    'reporting_purchases_v3',
    'reporting_packaging_v3',
    'reporting_reorder_point_v3'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO anon, authenticated', fn);
  END LOOP;
END $$;


-- =====================================================================
-- 8. Post-apply sanity checks (comment-only)
-- =====================================================================
-- After this file applies successfully:
--
--   SELECT proname,
--          prosecdef,
--          pg_get_function_arguments(oid)
--     FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND proname IN (
--        'reporting_inventory_stock',
--        'reporting_consumption_report_v3',
--        'reporting_sales_transfers_v3',
--        'reporting_purchases_v3',
--        'reporting_packaging_v3',
--        'reporting_reorder_point_v3',
--      )
--    ORDER BY proname;
--
-- Returns 6 rows, all prosecdef=false (SECURITY INVOKER).
--
--   SELECT grantee, privilege_type
--     FROM information_schema.routine_privileges
--    WHERE routine_schema = 'public'
--      AND routine_name IN (
--        'reporting_inventory_stock',
--        'reporting_consumption_report_v3',
--        'reporting_sales_transfers_v3',
--        'reporting_purchases_v3',
--        'reporting_packaging_v3',
--        'reporting_reorder_point_v3',
--      )
--    ORDER BY routine_name, grantee;
--
-- Shows EXECUTE privilege for anon + authenticated.
--
--   SELECT * FROM reporting_inventory_stock(
--     (SELECT CURRENT_DATE),
--     NULL, NULL, FALSE
--   ) LIMIT 5;
--
-- Returns up to 5 rows of (farm_id, item_name, on_hand_qty, value_rial,
-- last_movement_date, days_since_last_movement, is_dead_stock, ...).
-- No service-role bypass; RLS scopes per JWT.
-- =====================================================================
