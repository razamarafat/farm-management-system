# Morvarid-Farm — Report Catalog & KPI Definitions

> **Purpose.** Single source-of-truth describing every report Morvarid-Farm can produce, who it serves, what filters it accepts, how it groups, columns it emits, drill-downs it supports, and whether it exports. Where reports imply a metric, the underlying KPI formula is defined here so implementations stay consistent.
>
> **Scope of this document.** Documentation only. No UI changes, no DB migrations.
>
> **Conventions.**
> - All quantities are in the item's declared `farm_items.unit` (کیلوگرم / لیتر / عدد / بسته …).
> - Dates are Jalali at the UI layer (`utils/jalaliDate.ts`), Gregorian `date` columns in the DB.
> - All currency is Iranian Rial (ریال) at the value-tier the user chose for the report period.
> - Per-farm isolation is enforced by RLS (`has_farm_access_v2`, `004_rls_policies.sql`); every report must scope to the caller's farm unless the caller is `admin`.

---

## 1. Report Catalog

Each report has a stable ID. Codes prefixed `RPT-` are existing or near-term-deliverable; codes prefixed `RPT-N` are not-yet-implemented but specified here so future work lands consistently.

### 1.1 RPT-001 — Current Stock Balance (موجودی انبار — لحظه‌ای)

| Field | Value |
|---|---|
| ID | `RPT-001` |
| Persian title | گزارش موجودی انبار |
| Audience | accounting, operations, supervisor |
| Status | **existing** (`InventoryPage` → tab "موجودی انبار"; same query also embedded in `ReportsPage` → نوع "موجودی انبار") |
| Required inputs | `farm_id` (mandatory), `category` (optional: feed / packaging / all) |
| Optional inputs | `item_id` filter |
| Default grouping | by category → by `priority` (predefined order on `farm_items`) |
| As-of | today (default); any past date supported by the same query (`txn_date ≤ to`) |
| Columns | ردیف, نام کالا, دسته (feed/packaging), واحد, موجودی اولیه, کل ورودی, کل خروجی, مانده, وضعیت (موجود/نقطه سفارش/تمام‌شده) |
| Drilldowns | row click → `RPT-003` per-item ledger |
| Exports | `exportStockBalanceToExcel` (Persian RTL xlsx) |

### 1.2 RPT-002 — Inventory Movements Ledger (دفتر تراکنش‌های انبار)

| Field | Value |
|---|---|
| ID | `RPT-002` |
| Persian title | دفتر تراکنش‌های انبار |
| Audience | accounting, admin (audit trail) |
| Status | **existing** (`InventoryPage` → tab "تاریخچه کالا", grouped per item) |
| Required inputs | `farm_id` (mandatory), `date_from`/`date_to` (range) |
| Optional inputs | `txn_type` (any of the 7 enum values / "all"), `item_id`, `category` (feed/packaging/all), `search` (matches `notes`, `reference_no`) |
| Default grouping | by `item_id` (one card per item) → within each card by `txn_ts` desc |
| Columns (per row) | تاریخ, نوع تراکنش, ورودی (+), خروجی (-), شماره مرجع, توضیحات, مشاهده سند (link back to voucher), عملیات (admin: delete) |
| Drilldowns | per `daily_voucher` source: link → `RPT-005` |
| Exports | `exportInventoryTransactionsToExcel` |

### 1.3 RPT-003 — Per-Item Transaction History (تاریخچه یک کالا)

| Field | Value |
|---|---|
| ID | `RPT-003` |
| Persian title | تاریخچه تغییرات یک کالا |
| Audience | operator, supervisor, admin |
| Status | **existing** (`InventoryItemHistoryPage`; route `/:role/inventory/:itemId/history`) |
| Required inputs | `farm_id`, `item_id` (from route param) |
| Optional inputs | `txn_type`, `date_from`, `date_to`, `search` |
| Default grouping | single item, by `txn_ts` desc, client-paginated 15 rows/page |
| Columns | تاریخ, نوع, ورودی, خروجی, شماره مرجع, توضیحات, سند |
| Drilldowns | link to `RPT-005` when `source_type='daily_voucher'` |
| Exports | `exportInventoryTransactionsToExcel` |

### 1.4 RPT-004 — Purchases & Transfers In (خرید و انتقال ورودی)

| Field | Value |
|---|---|
| ID | `RPT-004` |
| Persian title | گزارش خرید و انتقال ورودی |
| Audience | accounting, procurement |
| Status | **existing** — a *saved view* of `RPT-002` filtered to `txn_type ∈ {purchase, transfer_in}`. Lives in `ReportsPage → نوع "خرید و انتقال"`. Listed as its own catalog entry because it carries distinct columns (price, total, supplier, reference_no) and is the canonical "procurement" view. |
| Required inputs | `farm_id`, `date_from`/`date_to` (date range preset) |
| Optional inputs | `category`, `item_id`, `supplier_id` |
| Default grouping | by date desc (no per-item grouping) |
| Columns | تاریخ, نام کالا, دسته, واحد, مقدار, قیمت واحد (ریال), قیمت کل (ریال), تأمین‌کننده, شماره مرجع |
| Drilldowns | none directly; relevant per-item history is `RPT-003` |
| Exports | `exportPurchasesToExcel` |

### 1.5 RPT-005 — Daily Voucher Consumption (حواله مصرف روزانه)

| Field | Value |
|---|---|
| ID | `RPT-005` |
| Persian title | گزارش حواله مصرف روزانه |
| Audience | operations, supervisor, admin |
| Status | **existing** (`ReportsPage → نوع "مصرف"`; data is sourced from `daily_vouchers` joined to `daily_voucher_lines`) |
| Required inputs | `farm_id`, `date_from`/`date_to` |
| Optional inputs | `category` (feed/packaging), `item_id`, **and per-row `hall_numbers`** (text column already exists on `daily_voucher_lines`) |
| Default grouping | by item → by date (today + yesterday collapsed onto date) |
| Columns | تاریخ, نام کالا, دسته, واحد, مقدار, **ارزش مصرف (ریال)** (= qty × latest-purchase-unit-price, falls back to `manual_unit_price` on `farm_items`), سالن (from `hall_numbers`) |
| Drilldowns | none in this report; the originating voucher is `/consumption/{feed|packaging}?date=...` (entry page re-opens the editing surface) |
| Exports | via `exportToExcel` generic function |

> Note: per-line `hall_consumed` JSON also exists; flatten-and-render is a future enhancement.

### 1.6 RPT-006 — Consumption Summary by Hall (جمع مصرف بر اساس سالن)

| Field | Value |
|---|---|
| ID | `RPT-006` |
| Persian title | گزارش خلاصه مصرف بر اساس سالن |
| Audience | operations, admin |
| Status | **existing** (`ReportsPage → نوع "گزارش خلاصه"`, half of the report — items grouped by hall). Synthesized as alt rows `"جمع بر اساس سالن"` in the page. |
| Required inputs | `farm_id`, `date_from`/`date_to` |
| Optional inputs | `category` |
| Default grouping | by hall (`hall_numbers` text column → comma-separated comma-joined string normally treated as the key). Hall names are read from `farm_halls`. |
| Columns | ردیف, سالن (or "بدون سالن" if hall_numbers is null), مجموع مقدار مصرف |
| Drilldowns | theoretical: per-hall + per-day voucher drilldown to `RPT-005` (future enhancement) |
| Exports | via generic `exportToExcel` |

### 1.7 RPT-007 — Consumption Summary by Item (جمع مصرف بر اساس کالا)

| Field | Value |
|---|---|
| ID | `RPT-007` |
| Persian title | گزارش خلاصه مصرف بر اساس کالا |
| Audience | operations, accounting |
| Status | **existing** (second half of `ReportsPage → نوع "گزارش خلاصة"`, alt rows `"جمع بر اساس کالا"`) |
| Required inputs | `farm_id`, `date_from`/`date_to` |
| Optional inputs | `category` |
| Default grouping | by item name, summed across the date range |
| Columns | ردیف, نام کالا, مجموع مقدار مصرف |
| Drilldowns | per-item drilldown → `RPT-003` or `RPT-007` per-day |
| Exports | via generic `exportToExcel` |

### 1.8 RPT-008 — Reorder Status & Coverage (وضعیت نقطه سفارش)

| Field | Value |
|---|---|
| ID | `RPT-008` |
| Persian title | گزارش نقطه سفارش و پوشش موجودی |
| Audience | operations, supervisor, admin (this is *the* operations dashboard) |
| Status | **existing** (`ReorderPointPage`). Four summary tiles + four category tables (زیر / نزدیک / کافی / بدون نقطه سفارش). |
| Required inputs | `farm_id` |
| Optional inputs | `category` |
| Default grouping | by status tier (بحرانی / هشدار / نزدیک / مناسب / بدون نقطه سفارش) |
| Lookup window for "daily avg consumption" | last **7 days** (hard-coded in `fetch7DayAvgConsumption`). Document this as the canonical window — RPT-013 uses the same window. |
| Columns | نام کالا, واحد, موجودی, نقطه سفارش, آخرین قیمت (with manual override indicator), میانگین روزانه مصرف (7 روز اخیر), روز تا اتمام, وضعیت |
| Drilldowns | row → `RPT-003` per-item history; price override is editable inline (only `manual_unit_price` storage is local-only — see outstanding lint below) |
| Exports | not yet — recommend adding `exportReorderPointToExcel` |

### 1.9 RPT-009 — Inventory Valuation (as-of date) (ارزش‌گذاری موجودی در تاریخ X)

| Field | Value |
|---|---|
| ID | `RPT-009` |
| Persian title | گزارش ارزش‌گذاری موجودی |
| Audience | CFO / accounting |
| Status | **not yet built** — specified here for parity with the requested KPI |
| Required inputs | `farm_id`, `as_of_date` |
| Optional inputs | `category` |
| Default grouping | by category → by descending value |
| Columns | نام کالا, دسته, واحد, موجودی فیزیکی, قیمت واحد (basis), **ارزش (ریال)**, درصد از کل |
| Drilldowns | per-item → `RPT-001` (live) + `RPT-003` (history) |
| Exports | via generic `exportToExcel`. See KPI `K-INV-VAL` for cost basis. |

### 1.10 RPT-010 — Inventory Aging (رده‌بندی سن موجودی)

| Field | Value |
|---|---|
| ID | `RPT-010` |
| Persian title | گزارش سن موجودی |
| Audience | operations, accounting (slow-moving stock) |
| Status | **not yet built** |
| Required inputs | `farm_id`, `as_of_date` |
| Optional inputs | `category`, `threshold_bracket_days` (override the bucket boundaries) |
| Default grouping | by aging bucket (0–30, 31–60, 61–90, 90+; + "بدون تاریخ دریافت" for items with no inbound history) |
| Columns | نام کالا, دسته, واحد, آخرین تاریخ ورود, سن (روز), **رده سنی**, موجودی فعلی, ارزش تخمینی (latest-purchase × qty) |
| Drilldowns | items in 90+ bucket → `RPT-013` (recommend liquidating / re-evaluating) |
| Exports | via generic `exportToExcel`. See KPI `K-INV-AGE`. |

### 1.11 RPT-011 — ABC Classification (رده‌بندی ABC)

| Field | Value |
|---|---|
| ID | `RPT-011` |
| Persian title | گزارش طبقه‌بندی ABC کالاها |
| Audience | procurement, accounting |
| Status | **not yet built** |
| Required inputs | `farm_id`, `from_date`, `to_date` (define the usage window) |
| Optional inputs | `category`, `class_cutoffs` (override the default 80/95 percentage breakpoints) |
| Default grouping | by class (A / B / C), within class: descending usage value |
| Columns | نام کالا, دسته, واحد, مصرف در دوره, ارزش مصرف (ریال), درصد از کل, درصد تجمعی, **رده (A/B/C)** |
| Drilldowns | row → `RPT-003` (where the consumption came from). High-A items → `RPT-008` (reorder discipline). |
| Exports | via generic `exportToExcel`. See KPI `K-INV-ABC`. |

### 1.12 RPT-012 — Inventory Turnover & Days on Hand (گردش موجودی و روزهای پوشش)

| Field | Value |
|---|---|
| ID | `RPT-012` |
| Persian title | گزارش گردش موجودی و روزهای پوشش |
| Audience | operations, CFO |
| Status | **not yet built** |
| Required inputs | `farm_id`, `from_date`, `to_date` |
| Optional inputs | `category` |
| Default grouping | by category → by descending turnover ratio |
| Columns | نام کالا, دسته, واحد, مصرف در دوره, میانگین موجودی, **نسبت گردش**, **روزهای پوشش (DOH)**, ارزش مصرف تخمینی |
| Drilldowns | item with DOH > N days → `RPT-010` (aging) and `RPT-013` (suggested ROP/SS). |
| Exports | via generic `exportToExcel`. See KPIs `K-INV-TRN` and `K-INV-DOH`. |

### 1.13 RPT-013 — Reorder Point & Safety Stock Recommendation (پیشنهاد نقطه سفارش و ذخیره اطمینان)

| Field | Value |
|---|---|
| ID | `RPT-013` |
| Persian title | گزارش پیشنهادی نقطه سفارش |
| Audience | operations, admin (decision support for `farm_items.reorder_point`) |
| Status | **not yet built** — `farm_items.reorder_point` is currently a manually-typed integer |
| Required inputs | `farm_id`, `lookback_days` (window for consumption statistics; default 30) |
| Optional inputs | `category`, `lead_time_days` (default 7), `service_level_pct` (default 95), `safety_factor` (default 0.5) |
| Default grouping | by descending "gap" (current ROP vs suggested ROP) |
| Columns | نام کالا, دسته, میانگین مصرف روزانه (lookback), انحراف معیار روزانه, **ROP پیشنهادی**, **SS پیشنهادی**, ROP فعلی (manual), فاصله تا رسیدن به ROP (روز) |
| Drilldowns | apply ROP suggestion button → updates `farm_items.reorder_point` (admin-gated) |
| Exports | via generic `exportToExcel`. See KPIs `K-INV-ROP` and `K-INV-SS`. |

### 1.14 RPT-014 — Suppliers Directory (فهرست تأمین‌کنندگان)

| Field | Value |
|---|---|
| ID | `RPT-014` |
| Persian title | گزارش تأمین‌کنندگان |
| Audience | procurement, accounting |
| Status | **existing** (`SuppliersPage` — already exports via `exportSuppliersToExcel`) |
| Required inputs | none |
| Optional inputs | active/inactive filter |
| Default grouping | by active status, then by name asc |
| Columns | ردیف, نام, وضعیت (فعال/غیرفعال), تاریخ ایجاد |
| Drilldowns | (future) total purchased ₨ and units YTD per supplier — joins to `inventory_transactions` filtered on `txn_type='purchase'`. Today only the directory is exported. |
| Exports | `exportSuppliersToExcel` |

---

## 2. KPI Definitions

KPIs are referenced from one or more reports above. Defining them here keeps every report consistent. All formulas assume scope is a single farm unless explicitly noted.

### 2.1 K-INV-VAL — Inventory Valuation (as-of date)

**Plain language.** "How many toman is sitting in the warehouse at end-of-day on a date the user picks, summed per category and per item?"

**Formula (per item at as_of_date):**
```
on_hand(item, as_of) = Σ(qty_in where txn_date ≤ as_of)
                       − Σ(qty_out where txn_date ≤ as_of)
                       + (initial qty — already captured as a qty_in where txn_type='initial')
                       (note: in this codebase `initial` was first sale as qty_in, so on-hand
                               = opening + Σ all inbound − Σ all outbound; the simplest
                               implementation is sum-of-rows over the period from the first
                               known txn to as_of)
unit_cost(item, as_of) =
    1. SELECT unit_price FROM inventory_transactions
       WHERE farm_id = farm
         AND item_id  = item
         AND txn_type IN ('purchase', 'transfer_in')
         AND txn_date  ≤ as_of
         AND unit_price IS NOT NULL
         AND unit_price > 0
       ORDER BY txn_date DESC, txn_ts DESC LIMIT 1;
    2. If (1) returns nothing → use farm_items.manual_unit_price (existing on-page manual override store).
    3. If (2) is empty → unit_cost = NULL and the row is shown without a ₨ value.
value(item, as_of) = on_hand(item, as_of) × unit_cost(item, as_of)
farm_total(as_of) = Σ value(item, as_of) over all active farm_items
category_total(c, as_of) = Σ value(item, as_of) where item.category = c
```

**Assumptions & caveats.**
- Single cost basis: latest purchase observation before or on `as_of_date`, falling back to a manually-entered `manual_unit_price` per farm-assignment. We do NOT implement FIFO/LIFO lot tracking. This is a deliberate simplification: the feedmill in scope operates on bag-level batches delivered as one shipment, so "latest price" is a defensible proxy.
- The "as-of snapshot" is implemented by the simple sum-from-zero-to-date query — no need to walk a daily closing-balance series for this KPI.
- For aging within `RPT-009`, value is a derived estimate; treat as approximate, not ledger-grade.
- **Future hooks** (out of scope here): add `farm_items.cost_basis` (`'latest_purchase' | 'manual' | 'average_30d' | 'average_90d'`) so the report can switch cost basis without code change.

**Used by:** `RPT-009`. Also surfaced as the "قیمت مصرفی" column in `RPT-005` (same lookup).

### 2.2 K-INV-AGE — Inventory Aging Buckets

**Plain language.** "For every item still on hand, how long has it been since the last delivery arrived?" Used to spot slow-moving or stale stock.

**Formula (per item with on_hand > 0):**
```
last_in_date(item) = MAX(txn_date) WHERE
                       item_id     = item
                       AND farm_id  = farm
                       AND qty_in   > 0
                       AND txn_type IN ('purchase','transfer_in','initial')
                     (NULL if no such row exists)
age_days(item, as_of) = as_of − last_in_date(item)   (NULL if no inbound history)

bucket:
  age_days IS NULL         → 'بدون تاریخ دریافت'  (special bucket — flag separately)
  age_days ∈ [0, 30]       → '۰–۳۰ روز'
  age_days ∈ [31, 60]      → '۳۱–۶۰ روز'
  age_days ∈ [61, 90]      → '۶۱–۹۰ روز'
  age_days > 90            → '۹۰+ روز'
```

**Assumptions & caveats.**
- We use *last inbound date* as a proxy for shelf-life clock because there is no expiry or lot ID on `farm_items` or `inventory_transactions`. This is acceptable for feed (typical shelf-life months) and packaging (sensitive to humidity but typically months too).
- The "بدون تاریخ دریافت" bucket is **kept separate** from `90+`. Merging it would silently misrepresent items that have only an opening balance (the `initial` txn) but no subsequent receipts — those are not stale, they are *untracked*.
- Items with no inbound history AND non-zero on-hand are rare in this codebase (initial stock is the very first txn), but possible if a manual adjustment ever bumps balance without a corresponding purchase. Flag them in the report header.

**Used by:** `RPT-010`.

### 2.3 K-INV-ABC — ABC Classification (Usage-Value Pareto)

**Plain language.** "Which 20% of items drive 80% of consumption value?" Used to prioritize procurement effort, supplier negotiation, and storage discipline.

**Formula (per item, period [from, to]):**
```
usage_qty(item, [from,to]) = Σ(qty_out) WHERE
                               item_id = item
                               AND farm_id = farm
                               AND txn_type = 'consumption'
                               AND txn_date BETWEEN from AND to
                             (optionally include 'waste' for total disposition;
                              make this toggleable per-report.)

cost_per_unit(item, as_of=to) =
    Same lookup as K-INV-VAL, anchored at the END of the period (to-date),
    so pricing is contemporaneous with the usage window.

usage_value(item) = usage_qty(item) × cost_per_unit(item, to)

Sort items by usage_value DESC.
For each item i in that order:
  pct_i        = usage_value_i / Σ usage_value_j over all j
  cumulative_i = Σ pct_j over j ≤ i (running total)

class:
  cumulative_i ≤ 0.80        → 'A'
  cumulative_i ≤ 0.95        → 'B'
  cumulative_i >  0.95       → 'C'
  usage_value_i = 0          → 'C*' (no activity → fallback bucket; do not include in cum.)
```

**Assumptions & caveats.**
- The dimension is **usage value**, not purchase value or stock value. This is the right choice for a feedmill because the *operational* importance of an item is determined by how much of it disappears through halls — corn that's never consumed is irrelevant to operations regardless of its on-hand value.
- **No sales revenue exists in this domain.** This is the explicit adaptation of the classical Pareto technique (which is usually applied to SKU revenue). We do NOT confuse this with "revenue" — it is *consumption × cost*.
- Including `waste` is controlled by a per-report toggle because waste quantity has ambiguous cost attribution (often zero salvage value).
- Class boundaries (80/95) are exposed as overrides (`class_cutoffs`) per `RPT-011`. They are NOT hard-coded in storage — boundary changes between reports must not mutate the data.
- If the period is too short for a meaningful pattern (e.g., < 7 days), surface a warning banner in the report.

**Used by:** `RPT-011`.

### 2.4 K-INV-TRN — Inventory Turnover (consumption-based)

**Plain language.** "How many times did we 'turn over' each item during the period?" Adapted for feedmill context where sales don't exist — consumption substitutes for COGS.

**Formula (per item, period [from, to]):**
```
consumed_in_period(item) = Σ(qty_out) WHERE
                              item_id = item
                              AND txn_type = 'consumption'
                              AND txn_date BETWEEN from AND to

avg_inventory(item, [from,to]) = (1 / period_days)
                                × Σ closing_balance(item, d) for d in [from .. to]
where closing_balance(item, d) = on_hand(item, d)   (see K-INV-VAL, evaluated at day-end d)

turnover_ratio(item) = consumed_in_period(item) / avg_inventory(item)
                     (NULL when avg_inventory = 0 → row flagged "n/a — no movement")
```

**Assumptions & caveats.**
- The classical definition (COGS / Avg Inventory) is replaced: COGS = the `consumption` flow (no sales of finished goods). This is the cleanest substitution that an operations manager accepts because *every gram that leaves a hall is consumed*, with no possibility of double-counting as both consumption and sale.
- `avg_inventory` is the time-average of daily closing balances. Implementation walks a daily series from `from` to `to` — at scale this wants a server-side aggregation (future: SQL aggregate `running_balance` view); for now a JS-side loop is fine because the dataset per farm is small.
- For "no movement" items (consumption = 0 AND avg_inventory = 0), report `n/a` rather than `∞`.

**Used by:** `RPT-012`.

### 2.5 K-INV-DOH — Average Days on Hand

**Plain language.** "At the current rate of consumption, how many days will the current stock last?"

**Formula (per item):**
```
DOH(item, [from,to]) = avg_inventory(item, [from,to])
                       / (consumed_in_period(item) / period_days)

Equivalently:
DOH = period_days / turnover_ratio   (when turnover_ratio > 0)
```

**Two operational flavors:**
- **Backward DOH** — uses *historical* avg_inventory and consumption over [from, to]. Answers "over the last month, how many days of stock did we hold on average?"
- **Forward DOH** — anchor at `as_of_date = today`, use `current_balance(item, today)` in numerator and `daily_avg_consumption(last N days)` (N configurable; default 30) for denominator. Answers "at today's rate, how long will on-hand stock last?"

`RPT-012` should support both, with a toggle (`DOH_MODE` ∈ `{BACKWARD, FORWARD, BOTH}`).

**Assumptions & caveats.**
- DOH is undefined when there is no consumption (`turnover_ratio = 0`); show as `—` not `∞`.
- For items with high item-unit cost but tiny weight (e.g., a 1 g vitamin pack), DOH numbers must be interpreted alongside `unit` — read with caution.

**Used by:** `RPT-012`. Forward-DOH is also computed inline in `RPT-008` (ReorderPointPage already does this with `daysRemaining = balance / daily_avg`).

### 2.6 K-INV-ROP — Reorder Point

**Plain language.** "When should we trigger a purchase order so we don't run out before delivery arrives?"

**Formula (per item):**
```
ROP(item) = (avg_daily_demand × lead_time_days) + safety_stock

where
  avg_daily_demand(item, lookback=N=30)
      = Σ(qty_out where txn_type='consumption' and txn_date ≥ today − N days) / N
  lead_time_days(item, farm)
      = farm-level or item-level config column  (CURRENTLY MISSING — placeholder default = 7)
  safety_stock(item)
      = see K-INV-SS (two candidate policies below)
```

**Notes.**
- This formula matches the canonical inventory-management reference (see e.g. *Factory Physics* supply-chain chapters, *APICS Dictionary*).
- `lead_time_days` is currently **not modeled** in the schema. RPT-013 should expose it as a farm-level input (a simple `farms.lead_time_days` numeric column, default 7).
- The simpler version `ROP = avg_daily_demand × (lead_time + buffer_days)` is acceptable when std-dev is unknown. Use the simpler form by default; keep the statistical form as the "accurate" view.
- `avg_daily_demand` lookback should match the existing `RPT-008` window for consistency, OR be a separate longer window (30 days is recommended for stability — 7-day mean is noisy).

**Used by:** `RPT-013` (suggestion), `RPT-008` (today's "زیر نقطه سفارش" status uses the *manually-entered* ROP — these are separate concepts intentionally: the manual `reorder_point` is business policy; the suggested ROP is statistically derived).

### 2.7 K-INV-SS — Safety Stock (two complementary policies)

**Plain language.** "How much buffer do we keep to absorb demand variation during lead time?"

**Policy A — Service-level / statistical (preferred for high-throughput items):**
```
SS_A(item) = z × σ_demand × √(lead_time_days)

where
  z          = service-level z-score
                 default z = 1.65 → 95% service level
  σ_demand   = stdev of daily consumption over lookback window (N=30 default)
```

**Policy B — Buffer-factor / heuristic (simpler, used when σ_demand is unavailable or noisy):**
```
SS_B(item) = avg_daily_demand × lead_time_days × safety_factor

where
  safety_factor  default = 0.5  (i.e., 50% extra over the lead-time demand)
```

**RPT-013 should expose both** as columns (`SS_A`, `SS_B`) and let the operations manager pick — or, default to `SS_B` when `σ_demand = 0`.

**Assumptions & caveats.**
- The 0.5 buffer factor and 7-day lead time are **placeholder defaults** appropriate for a regional feedmill but **must be configurable** in production. Surface them as parameters at the top of `RPT-013`.
- `safety_factor` and `z` should be settable per-farm — add a column on `farms` table for both (future migration).
- If `lookback_window = 30 days` has fewer than 5 days of consumption data, prefer `SS_B` (insufficient data for σ).

**Used by:** `RPT-013`. `RPT-008` does NOT use SS — its "below reorder" status uses the manual `reorder_point` directly.

---

## 3. Filter Matrix

The matrix marks which filters each report honors. Filters are documented once, in §3.1. Markings in the matrix table:

- ✅ → filter is supported today (or in the planned report per the report's status)
- ⚪ → filter is not applicable to this report
- ❌ → report does NOT expose this filter (user must derive the equivalent post-filter)

### 3.1 Filters (canonical list)

| Code | Name (Persian) | Type | Source |
|---|---|---|---|
| `F-DT` | بازه زمانی (`date_from`/`date_to`) | date range | many columns filter on `txn_date` or `voucher_date` |
| `F-CAT` | دسته کالا (`category`) | enum ∈ {feed, packaging, all} | `farm_items.category`, vouchers.category |
| `F-ITM` | کالا (`item_id`) | uuid / "all" | `farm_items.id` |
| `F-HALL` | سالن (`hall_id` / `hall_numbers`) | uuid or text | `farm_halls.id`, `daily_voucher_lines.hall_numbers` |
| `F-SUP` | تأمین‌کننده (`supplier_id`) | uuid / "all" | `inventory_transactions.supplier_id`, `suppliers.id` |
| `F-TXN` | نوع تراکنش (`txn_type`) | enum set | `inventory_transactions.txn_type` |
| `F-STAT` | وضعیت سند/حواله (`status`) | enum | `daily_vouchers.status` ∈ {draft, submitted, locked, reverted} |
| `F-ASOF` | تاریخ مقطع (`as_of_date`) | single date | single-snapshot reports (RPT-009, RPT-010) |
| `F-VAL` | مبنای ارزش‌گذاری (`cost_basis`) | enum ∈ {latest_purchase, manual, avg30, avg90} | K-INV-VAL cost-basis selector |
| `F-LB` | دوره مصرف (`lookback_days`) | integer | K-INV-ROP/SS lookback window |

### 3.2 Matrix

| Report | F-DT | F-CAT | F-ITM | F-HALL | F-SUP | F-TXN | F-STAT | F-ASOF | F-VAL | F-LB |
|---|---|---|---|---|---|---|---|---|---|---|
| RPT-001 Stock Balance | ⚪ (single moment) | ✅ | ✅ | ⚪ | ⚪ | ⚪ | ⚪ | ✅ (as `≤ as_of_date`) | ⚪ | ⚪ |
| RPT-002 Movements Ledger | ✅ | ✅ | ✅ | ⚪ | ⚪ | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |
| RPT-003 Per-Item History | ✅ | ✅ | ❌ (implied — the item is the page itself) | ⚪ | ❌ | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |
| RPT-004 Purchases & Transfers In | ✅ | ✅ | ✅ | ⚪ | ✅ | ❌ (preset: purchase + transfer_in) | ⚪ | ⚪ | ⚪ | ⚪ |
| RPT-005 Daily Voucher Consumption | ✅ | ✅ | ✅ | ⚪ (today a per-row hall column; per-row hall filter ⚪) | ⚪ | ❌ (only implicit: consumption) | ❌ (implicit: submitted) | ❌ | ✅ (consumption value ₨ column) | ⚪ |
| RPT-006 Summary by Hall | ✅ | ✅ | ⚪ | ✅ (grouping key) | ⚪ | ❌ | ❌ | ⚪ | ⚪ | ⚪ |
| RPT-007 Summary by Item | ✅ | ✅ | ⚪ (grouping key) | ⚪ | ⚪ | ❌ | ❌ | ⚪ | ⚪ | ⚪ |
| RPT-008 Reorder Status | ⚪ | ✅ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ✅ | ⚪ | ⚪ (7-day avg is hard-coded; document) |
| RPT-009 Inventory Valuation | ⚪ | ✅ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ✅ | ✅ | ⚪ |
| RPT-010 Inventory Aging | ⚪ | ✅ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ✅ | ⚪ | ⚪ |
| RPT-011 ABC Classification | ✅ | ✅ | ⚪ | ⚪ | ⚪ | ❌ | ⚪ | ⚪ | ⚪ | ✅ |
| RPT-012 Turnover & DOH | ✅ | ✅ | ⚪ | ⚪ | ⚪ | ❌ (preset: consumption) | ⚪ | ⚪ | ⚪ | ✅ |
| RPT-013 ROP & SS Recommendation | ⚪ | ✅ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ✅ |
| RPT-014 Suppliers Directory | ⚪ | ⚪ | ⚪ | ⚪ | ❌ (directory is the report — that's the filter) | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ |

> Legend: ✅ supported / ⚪ not applicable / ❌ not exposed (the report applies a fixed value)

---

## 4. Cross-Report Consistency Rules

To prevent random, divergent implementations:

1. **Per-farm scope is non-negotiable.** Every report honors `has_farm_access_v2(farm_id)` (`005_helpers.sql`). Admins can override; supervisors/operators are auto-scoped to their assigned farm.
2. **Date semantics.** Reports using transaction data filter on `txn_date` (Gregorian). Reports using voucher data filter on `voucher_date`. Documents presenting Jalali dates render via `formatJalaliDate` but the underlying filter stays Gregorian.
3. **"سالن" canonicalization.** `daily_voucher_lines.hall_numbers` is a comma-separated text field. Any report that groups or filters by hall should normalize this to a canonical form (parse, sort, re-join) before deriving aggregates — do not assume alphabetical order from raw text.
4. **Cost basis reuse.** Any report that emits a ₨ value uses **K-INV-VAL's `unit_cost` lookup** unchanged. Do not duplicate the price heuristic.
5. **Rounding.** Quantities round-trip as supplied (`server → JS`) — display rounding is `toLocaleString('fa-IR')` via `toPersianNumbers`. Currency rounding is integer ریال (no decimals).
6. **Currency unit.** Reports denominate in **ریال**. The legacy helper `formatRial` already exists; use it consistently.
7. **Export shape.** Every exportable report MUST use the generic `exportToExcelPro` (via `excelExport.ts`). Add a dedicated exporter only when the column set is genuinely distinct.
8. **Empty-result UX.** Every report must show a Persian zero-state ("موردی یافت نشد" with an actionable next-step hint) rather than a blank table.

---

## 5. Open Items / Follow-ups

Items surfaced by this audit that are NOT in scope for this catalog but should be tracked:

- **Lead-time and service-level columns** do not exist on `farms` or `farm_items`. `RPT-013` needs them as configurable inputs; a small migration would be the right next step (out of scope here).
- **`manual_unit_price` is stored only in the browser's `localStorage`** (`ReorderPointPage.tsx`, key `manual-last-price-map:{farmId}`). It does not persist server-side. RPT-009 / RPT-013 should derive a price from a server-side source. Adding `farm_items.manual_unit_price numeric` is the natural fix.
- **Waste inclusion in ABC.** RPT-011 should expose a toggle for "include waste in usage qty". Default off; flag in the report UI when on.
- **RPT-008 hard-coded 7-day lookback.** `fetch7DayAvgConsumption` is hard-wired to 7 days. If we want consistency with K-INV-ROP's 30-day lookback, lift this to a constant in `inventory.types.ts` and document.
- **Forward-DOH (`balance / daily_avg`)** is computed inline in `RPT-008`/`ReorderPointPage` — extract into a shared `useDaysRemaining` hook so the calculation can be reused without copy-paste.
- **Currency unit ambiguity.** No report today displays toman vs ریال. Confirm with the project owner whether toman display (÷10) is wanted for end-user reports — K-INV-VAL does not care, but the export view does.

---

*End of catalog — v0.1. Future versions should bump the per-section revision note when formulas or report definitions change.*
