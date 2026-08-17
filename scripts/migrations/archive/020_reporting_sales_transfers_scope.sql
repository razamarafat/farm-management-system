-- =====================================================================
-- migration: 020_reporting_sales_transfers_scope.sql
--
-- BUG: reporting_sales_transfers_v3 returned EVERY transaction type
-- (initial + consumption + waste + purchase) when p_txn_type was NULL,
-- because the WHERE clause only constrained txn_type when an explicit
-- p_txn_type was supplied. The report "گزارش فروش و انتقال بین انبارها"
-- (Sales & Inter-Warehouse Transfers) must only ever show the
-- transfer/sale universe — consumption/purchase/waste belong to other
-- reports. As shipped it duplicated the consumption report and leaked
-- purchase rows into a "sales/transfers" view.
--
-- FIX: hard-restrict the universe to ('transfer_in','transfer_out','sale')
-- always; narrow further only when p_txn_type is explicitly given.
-- When no such rows exist (e.g. before any transfer/sale is recorded)
-- the function legitimately returns 0 rows and the SPA shows the
-- honest "only transfers are live today; sales capture not yet enabled"
-- banner instead of fabricated/duplicated data.
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT.
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
$$;

REVOKE ALL ON FUNCTION public.reporting_sales_transfers_v3(date,date,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reporting_sales_transfers_v3(date,date,uuid,uuid,text) TO anon, authenticated;
