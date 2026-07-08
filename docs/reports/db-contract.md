# Morvarid-Farm — Reporting Layer DB Contract

> **Purpose.** Documents every `reporting_*` SQL function the SPA can invoke (no service-role key required) plus the index set that backs them. Updated when `scripts/migrations/008_reporting_layer.sql` (or a successor) changes.
>
> **Audience.** SPA hooks in `src/hooks/use*.ts` that need to swap client-side aggregation for these server-side functions, and any future consumer outside the SPA (BI, ops CLI, accountant's CSV dump).
>
> **Companion documents.**
> - [`docs/reports/report-catalog.md`](./report-catalog.md) — the report definitions (`RPT-001` … `RPT-014`) and KPI formulas (`K-INV-*`) that the functions here back.
> - `scripts/migrations/008_reporting_layer.sql` — the actual SQL.

---

## 1. Calling rules

1. **No service-role key.** Every function below is `SECURITY INVOKER` + `GRANT EXECUTE TO anon, authenticated`. The SPA calls them via `supabase.rpc('reporting_<name>', { ... })` under the user's JWT.
2. **Per-farm scope is automatic** because RLS policies in `004_rls_policies.sql` filter every underlying SELECT by `has_farm_access_v2(farm_id)`. Admin callers get cross-farm data via the same policy's `role = 'admin'` fallback; non-admin callers see only their assigned farm.
3. **Date semantics.** All date parameters use PostgreSQL `date` type. The SPA passes Gregorian dates; UI conversion to/from Jalali happens in the client (`src/utils/jalariDate.ts`).
4. **Cursor stability on `reporting_inventory_ledger`.** Cursor identity is `(txn_ts, id)` exclusively. Date filters are passed only to NARROW the window, never as part of the cursor.

---

## 2. Function catalogue

| Name | Backed report | Returns |
|---|---|---|
| `reporting_get_item_unit_price(item_id, farm_id, as_of)` | K-INV-VAL helper | `(unit_price numeric, price_source text, priced_on date)` |
| `reporting_inventory_balance_as_of(as_of, farm_id?, item_id?, category?)` | RPT-009 | per-(farm,item) row, including ₨ value |
| `reporting_inventory_ledger(...)` | RPT-002 / RPT-003 | append-only lines with running balance + keyset pagination |
| `reporting_consumption_summary(...)` | RPT-005 / RPT-006 / RPT-007 | grouped sums (by day / item / hall / formula) |
| `reporting_purchase_summary(...)` | RPT-004 | grouped sums of `txn_type='purchase'` (by day / supplier / item) |

All four top-level functions are `LANGUAGE plpgsql` or `LANGUAGE sql` + `STABLE` + `SECURITY INVOKER`. They never `INSERT` / `UPDATE` / `DELETE`.

### 2.1 `reporting_get_item_unit_price(item_id uuid, farm_id uuid, as_of date)`

Returns the resolved per-unit price to use for valuation as-of `p_as_of`.

| Returned column | Type | Source |
|---|---|---|
| `unit_price` | numeric | `inventory_transactions.unit_price` of the latest purchase or transfer-in where `txn_date ≤ as_of`, `unit_price > 0`. `NULL` when no inbound price exists. |
| `price_source` | text | `'latest_purchase'` when found, `'none'` when not. (Reserved: `'manual'` once `farm_items.manual_unit_price` is added server-side.) |
| `priced_on` | date | `txn_date` of the priced row, or `NULL` when no source. |

### 2.2 `reporting_inventory_balance_as_of(p_as_of, p_farm_id?, p_item_id?, p_category?)`

| Returned column | Type | Notes |
|---|---|---|
| `farm_id` | uuid | |
| `item_id` | uuid | |
| `item_name` | text | from `farm_items.name` |
| `item_unit` | text | from `farm_items.unit` |
| `item_category` | text | `'feed'` \| `'packaging'` |
| `on_hand_qty` | numeric | `Σ(qty_in) − Σ(qty_out)` for `txn_date ≤ as_of` |
| `unit_cost` | numeric | from `reporting_get_item_unit_price(...)`; `NULL` when no purchase history |
| `cost_basis` | text | `'latest_purchase'` \| `'none'` |
| `priced_on` | date | date of the priced row |
| `value_rial` | numeric | `on_hand_qty × unit_cost`; `NULL` when `unit_cost IS NULL` |
| `as_of_date` | date | echoes `p_as_of` so the SPA can render "as of …" without re-passing |

Rows with `on_hand_qty = 0` are excluded.

### 2.3 `reporting_inventory_ledger(...)`

Signature:

```sql
reporting_inventory_ledger(
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
  ...ledger columns...,
  prior_balance   numeric,
  running_balance numeric,
  has_more        boolean
)
```

| Returned column | Type | Notes |
|---|---|---|
| `id`, `txn_ts`, `txn_date`, `txn_type`, `farm_id`, `item_id` | various | direct from `inventory_transactions` |
| `farm_name`, `item_name`, `item_unit`, `item_category` | text | joined from `farms`, `farm_items` |
| `source_type`, `source_id` | text / text | from `inventory_transactions`; non-null for voucher-derived rows |
| `qty_in`, `qty_out` | numeric | row delta |
| `unit_price`, `total_price` | numeric | only set on `purchase`/`transfer_in` rows |
| `reference_no`, `notes` | text | |
| `supplier_id`, `supplier_name` | uuid / text | joined LEFT JOIN `suppliers` |
| `prior_balance` | numeric | echoes `p_prior_balance` (visible to the SPA for sanity) |
| `running_balance` | numeric | `prior + cumulative` per (farm, item) on this page. Anchor for the next page. |
| `has_more` | boolean | `TRUE` when there is at least one more row beyond the page. |

**Pagination protocol.**

1. **First call.** `p_cursor_ts = NULL`, `p_cursor_id = NULL`, `p_prior_balance = 0`. Capture the LAST row's `(txn_ts, id, running_balance)` tuple.
2. **Subsequent calls.** `p_cursor_ts = last.txn_ts`, `p_cursor_id = last.id`, `p_prior_balance = last.running_balance`. Continue until `has_more = FALSE`.

Per item, the running-balance is correct across pages because the within-page window function is ordered by `(txn_ts ASC, id ASC)` (display is DESC). The `p_prior_balance` is the carry that bridges pages.

Hard cap: `p_limit` is clamped to `[1, 500]`.

### 2.4 `reporting_consumption_summary(p_date_from, p_date_to, p_farm_id?, p_category?, p_group_by)`

`p_group_by ∈ {'day','item','hall','formula'}`. Required: `p_date_from`, `p_date_to`. Raises an exception if either group_by or the dates are missing.

| Returned column | Type | Notes |
|---|---|---|
| `group_key` | text | machine-stable id (date ISO, item uuid, hall token, formula uuid) |
| `group_label` | text | human-readable label |
| `consumed_qty` | numeric | Σ `consumed_qty` from `daily_voucher_lines` for `status='submitted'` vouchers in window |
| `waste_qty` | numeric | Σ `waste_qty` same window |
| `total_qty` | numeric | sum of the two (consumed + waste) |
| `voucher_count` | bigint | distinct `voucher_id` count |
| `item_category` | text | the row's item category (one row per group) |

For `group_by='hall'`, `daily_voucher_lines.hall_numbers` (comma-separated) is split via `unnest(string_to_array(...))` so multi-hall vouchers contribute to each hall. `__no_hall` is the bucket for empty or null hall_numbers.

### 2.5 `reporting_purchase_summary(p_date_from, p_date_to, p_farm_id?, p_supplier_id?, p_category?, p_group_by)`

`p_group_by ∈ {'day','supplier','item'}`. Required: `p_date_from`, `p_date_to`. Filters strictly `txn_type='purchase'` (transfer_in is excluded; if your report needs to combine, document and add a parameter).

| Returned column | Type | Notes |
|---|---|---|
| `group_key` | text | date ISO \| supplier uuid \| item uuid |
| `group_label` | text | date ISO \| supplier name \| item name |
| `qty_in` | numeric | Σ `qty_in` for the group |
| `total_rial` | numeric | Σ `total_price` for the group; purchases without `total_price` set contribute 0 (caller may want to surface these for the report) |
| `txn_count` | bigint | row count |
| `item_category` | text | one row per group |

---

## 3. Index changes (added in 008)

| New index | Table | Purpose |
|---|---|---|
| `idx_inv_txn_ledger_keyset` ON `(farm_id, item_id, txn_ts DESC, id DESC)` | `inventory_transactions` | keyset cursor on the ledger |
| `idx_inv_txn_supplier_date` ON `(supplier_id, txn_date DESC, id DESC)` WHERE `supplier_id IS NOT NULL` | `inventory_transactions` | `reporting_purchase_summary` by supplier |
| `idx_daily_voucher_lines_formula` ON `(formula_id, voucher_id)` WHERE `formula_id IS NOT NULL` | `daily_voucher_lines` | `reporting_consumption_summary` by formula |
| `idx_inv_txn_farm_type_date` ON `(farm_id, txn_type, txn_date DESC)` | `inventory_transactions` | `txn_type`-filtered leg of the ledger and purchase summary |

Existing indexes (already present before 008) are untouched:
- `idx_inv_txn_farm_item_date` ON `(farm_id, item_id, txn_date)` — useful for date-only filters; keyset requires the new one for the cursor `(txn_ts, id)`.

---

## 4. RLS / RBAC strategy

- **Functions are `SECURITY INVOKER`.** Postgres executes the query as the calling role (the SPA's anon or authenticated user).
- **Underlying table SELECTs are gated by RLS** (004). Every SELECT in every function here goes through one of:
  - `inventory_transactions.inventory_txn_select_farm_access`
  - `daily_voucher_lines.daily_voucher_lines_select_farm_access`
  - `daily_vouchers.daily_vouchers_select_farm_access`
  - `farm_items.farm_items_select_farm_access`
  - `farms.farms_select_admin_or_staff`
  - `suppliers.suppliers_select_authenticated`
- **Admin cross-farm rollups** work via the explicit `role = 'admin' AND is_active = true` subquery inside every policy's USING clause. No additional admin guard needs to be added to the function body.
- **Writes are not exposed.** None of these functions touches INSERT/UPDATE/DELETE. The SPA's privileged write path still goes through the `rpc_admin_*` SECURITY DEFINER functions (003).

---

## 5. Sample RPC calls

All examples assume a Vite client using the same Supabase URL + anon key as production. Pass the user's JWT in `Authorization` automatically (auth state in `authStore`).

### 5.1 Inventory Valuation on 2026-06-15 (admin, all farms)

```js
const { data, error } = await supabase.rpc(
  'reporting_inventory_balance_as_of',
  { p_as_of: '2026-06-15', p_category: 'feed' }
);
// → rows shaped like:
// { farm_id, item_id, item_name, item_unit, item_category,
//   on_hand_qty: 4250.0, unit_cost: 28000, cost_basis: 'latest_purchase',
//   priced_on: '2026-06-10', value_rial: 119000000, as_of_date: '2026-06-15' }
```

### 5.2 Per-Item Ledger, page 1

```js
const { data: page1, error } = await supabase.rpc(
  'reporting_inventory_ledger',
  {
    p_farm_id:       '<farm uuid>',
    p_item_id:       '<item uuid>',
    p_category:      null,
    p_date_from:     null,
    p_date_to:       null,
    p_txn_type:      null,
    p_cursor_ts:     null,   // first page: no cursor
    p_cursor_id:     null,
    p_prior_balance: 0,      // first page: no prior
    p_limit:         50,
  }
);
if (page1.length === 0) return;
// The OLDEST row in DESC display is the LAST element of page1.
const lastRowOfPage1 = page1[page1.length - 1];
const hasMore = Boolean(page1[page1.length - 1].has_more);
const nextCursor = hasMore
  ? {
      p_cursor_ts:     lastRowOfPage1.txn_ts,
      p_cursor_id:     lastRowOfPage1.id,
      p_prior_balance: lastRowOfPage1.running_balance,
    }
  : null;
```

### 5.3 Per-Item Ledger, page 2

```js
if (!nextCursor) return;
const { data: page2, error } = await supabase.rpc(
  'reporting_inventory_ledger',
  {
    p_farm_id:       '<farm uuid>',
    p_item_id:       '<item uuid>',
    p_category:      null,
    p_date_from:     null,
    p_date_to:       null,
    p_txn_type:      null,
    p_cursor_ts:     nextCursor.p_cursor_ts,
    p_cursor_id:     nextCursor.p_cursor_id,
    p_prior_balance: nextCursor.p_prior_balance,   // ← CRITICAL: bridges running_balance across pages
    p_limit:         50,
  }
);
const lastRowOfPage2 = page2[page2.length - 1];
const hasMore2 = Boolean(page2[page2.length - 1].has_more);
const nextCursor2 = hasMore2
  ? {
      p_cursor_ts:     lastRowOfPage2.txn_ts,
      p_cursor_id:     lastRowOfPage2.id,
      p_prior_balance: lastRowOfPage2.running_balance,
    }
  : null;
// keep looping while has_more === true
```

### 5.4 Consumption by hall, last 30 days

```js
const today = new Date();
const ago30 = new Date(); ago30.setDate(today.getDate() - 30);
const { data, error } = await supabase.rpc(
  'reporting_consumption_summary',
  { p_farm_id: farmId, p_group_by: 'hall',
    p_date_from: ago30.toISOString().slice(0,10),
    p_date_to:   today.toISOString().slice(0,10) }
);
// → rows: { group_key: '3', group_label: '3', consumed_qty: 1820.5,
//           waste_qty: 12.3, total_qty: 1832.8, voucher_count: 28,
//           item_category: 'feed' }
```

### 5.5 Purchase by supplier, this month

```js
const { data, error } = await supabase.rpc(
  'reporting_purchase_summary',
  { p_farm_id: farmId, p_group_by: 'supplier',
    p_date_from: '2026-06-01', p_date_to: '2026-06-30' }
);
```

---

## 6. Error protocol

| Cause | Server response | Client handling |
|---|---|---|
| `p_date_from` or `p_date_to` missing on a summary RPC | `RAISE EXCEPTION` (SQL state `P0001`) | surface toast "بازه تاریخ الزامی است" |
| `p_group_by` not in the allowed set | `RAISE EXCEPTION 'p_group_by must be one of ...'` | the SPA should never send invalid values; surface as generic error |
| `p_limit` outside `[1, 500]` | silently clamped | no action needed; verify response length |
| Caller's farm_id doesn't satisfy RLS | returns 0 rows | the SPA should fill filters from `profile.farm_id` (RPC) before calling |

No `FORBIDDEN` exception is raised by these functions — RLS simply returns 0 rows to a non-admin caller asking for another farm.

---

## 7. Known limitations + future hooks

- `farm_items.manual_unit_price` does not exist server-side yet; the `reporting_get_item_unit_price` helper returns `'none'` whenever there is no purchase history. When that column is added, extend the helper to read it as a second-tier fallback before `'none'`.
- RPT-013 (ROP/SS recommendation) is intentionally NOT exposed as a single RPC. Statistical SS needs `z × σ_demand × √L`, where `σ_demand` is per-item daily stdev — better computed in a dedicated RPC or a Postgres aggregate. Track as a follow-up migration (008b).
- `reporting_consumption_summary(group_by='formula')` returns a row only when `daily_voucher_lines.formula_id IS NOT NULL`. Vouchers that consumed items without a formula (typical for packaging) appear in `'__no_formula'` / `'بدون فرمول'` bucket.
- `reporting_purchase_summary` deliberately excludes `transfer_in`. If a future use-case demands it, add a `p_in_kind text` filter defaulted to `'purchase'` that callers can switch to `'purchase,transfer_in'`.
