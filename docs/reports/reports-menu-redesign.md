# Reports Menu — Redesign Plan

> **TL;DR**: Audit + design complete. The current `REPORT_CATALOG` has
> **18 tiles**, of which only **4** are production-ready + 1 partial
> (drilldown from another). The other **13** are stubs / partially
> duplicate each other. Per the user mandate, the new menu contains
> EXACTLY **6 reports** (well-defined in §4), with the existing logic
> absorbed into them per the prescribed mapping.
>
> **Status**: This document delivers phases 1, 2 (design only), 3
> (design + spec), 4 (plan), and 5 (plan). Production code cutover
> (Phase 2 actual deletion, Phase 3 real-component implementation,
> Phase 5 live verification) is enumerated in §10 as a follow-up
> implementation pass — realistically a multi-day effort that should
> be sequenced with stakeholder review of the design.

---

## 1. FULL AUDIT — current Reports menu

### 1.1 Reports menu tiles (from `src/types/report.types.ts → REPORT_CATALOG`)

The registry currently exposes **18 tile entries**. They split naturally
into:

#### Truly production-ready + wired to data (4)
| ID | Title (Persian) | Subtitle | Group | Status |
|----|-----------------|----------|-------|--------|
| `RPT-001` | موجودی فعلی انبار | Stock Balance (current) | inventory | ready |
| `RPT_INVENTORY_LEDGER` | گردش کامل انبار | Inventory Ledger (audit-grade) | inventory | ready |
| `RPT_CONSUMPTION_ANALYTICS` | تحلیل مصرف | Consumption Analytics | consumption | ready |
| `RPT_INVENTORY_VALUATION_SUMMARY` | ارزش موجودی | Inventory Valuation Summary | valuation | ready |
| `RPT_PARETO_CLASSIFICATION` | طبقه‌بندی پارتو (ABC) + پیشنهاد سفارش | Pareto + Reorder Hints | valuation | ready |
| `RPT_INVENTORY_AGING` | پیر شدگی موجودی + اقلام راکد | Inventory Aging + Dead Stock | inventory | ready |

> Note: the audit counts **6 ready** entries, not 4. The user task
> summary listed 4; we report the live count here for honesty.

#### Stub entries (no body; clicking shows "در حال توسعه")
| ID | Title | Subtitle | Status |
|----|-------|----------|--------|
| `RPT-002` | گردش انبار | Inventory Ledger (full) | stub |
| `RPT-003` | گردش خلاصه | Consolidated Ledger | stub |
| `RPT-004` | خرید و انتقال | Purchases & Transfers | stub |
| `RPT-005` | مصرف روزانه | Daily Voucher Consumption | stub |
| `RPT-006` | خلاصه بر اساس سالن | Summary by Hall | stub |
| `RPT-007` | خلاصه بر اساس کالا | Summary by Item | stub |
| `RPT-008` | ABC کلاس‌بندی | ABC Classification | stub |
| `RPT-010` | پیر شدگی کالا | Inventory Aging | stub |
| `RPT-011` | گردش انبار | Inventory Turnover | stub |
| `RPT-012` | روزهای موجودی | Days-on-Hand | stub |
| `RPT-013` | نقطهٔ سفارش / موجودی اطمینان | Reorder & Safety Stock | stub |
| `RPT-014` | اقلام منفی / زیر صفر | Negative Stock Watch | stub |

> Total **18 tiles**: 6 ready + 12 stubs.

### 1.2 Backing code / hooks / types

| File | Role | Used by |
|------|------|---------|
| `src/components/reports/ReportSelector.tsx` | tile grid (selects report) | `ReportsHomePage` |
| `src/components/reports/ReportBody.tsx` | per-report shell + content router | `ReportsHomePage` |
| `src/components/reports/ReportShell.tsx` | framework chrome (filter-bar + table + export) | `ReportBody` (and the 6 dedicated section components) |
| `src/components/reports/ReportFilterBar.tsx` | reusable filter panel | `ReportShell` |
| `src/components/reports/ReportColumnChooser.tsx` | show/hide column UI | `ReportShell` |
| `src/components/reports/MultiSelectChips.tsx` | multi-select chip input | `ReportFilterBar` |
| `src/components/reports/InventoryLedgerSection.tsx` | reports `RPT_INVENTORY_LEDGER` body | `ReportBody` |
| `src/components/reports/InventoryAgingSection.tsx` | reports `RPT_INVENTORY_AGING` body | `ReportBody` |
| `src/components/reports/InventoryValuationSummarySection.tsx` | reports `RPT_INVENTORY_VALUATION_SUMMARY` body | `ReportBody` |
| `src/components/reports/ConsumptionAnalyticsSection.tsx` | reports `RPT_CONSUMPTION_ANALYTICS` body | `ReportBody` |
| `src/components/reports/ParetoClassificationSection.tsx` | reports `RPT_PARETO_CLASSIFICATION` body | `ReportBody` |
| `src/components/reports/ItemLedgerPanel.tsx` | drilldown side-panel (used from valuation summary) | `ReportBody` (drilldown) |
| `src/hooks/useInventoryLedgerReport.ts` | supabase.rpc('reporting_inventory_ledger', ...) | `InventoryLedgerSection` |
| `src/hooks/useInventoryAging.ts` | supabase.rpc('reporting_inventory_aging', ...) | `InventoryAgingSection` |
| `src/hooks/useInventoryValuationSummary.ts` | supabase.rpc('reporting_inventory_balance_as_of', ...) | `InventoryValuationSummarySection` |
| `src/hooks/useItemLedger.ts` | supabase.rpc('reporting_inventory_ledger', {p_item_id: id}) | `ItemLedgerPanel` (drilldown) |
| `src/hooks/useParetoClassification.ts` | supabase.rpc('reporting_pareto_classification', ...) | `ParetoClassificationSection` |
| `src/hooks/useConsumptionSummary.ts` | supabase.rpc('reporting_consumption_summary', ...) | `ConsumptionAnalyticsSection` |
| `src/types/report.types.ts` | REPORT_CATALOG + filter types | whole framework |
| `src/store/reportViewsStore.ts` | persisted filter / column / sort state | `ReportShell` |

### 1.3 Export service / BFF

| File | Role |
|------|------|
| `services/export-api/registry.mjs` | canonical export side of the same reports (6 entries) |
| `services/export-api/server.mjs` | ExcelJS-driven BFF endpoint, RBAC-gated |
| `services/export-api/xlsx-template.mjs` | shared template helpers |
| `services/export-api/contracts-test.mjs` | tests |
| `services/export-api/reconciliation-test.mjs` | tests |
| `services/export-api/template-test.mjs` | tests |
| `services/export-api/perf-budget.mjs` | perf guardrails |
| `services/export-api/smoke-test.mjs` | tests |

### 1.4 SQL RPCs called (from snapshot in `backups/isolation-audit/03-security-definer-fns.json`
**plus** listing via `pg_proc`):

| Report endpoint | Backing RPC (must match by name) |
|-----------------|----------------------------------|
| `RPT_INVENTORY_LEDGER` | `reporting_inventory_ledger` |
| `RPT_CONSUMPTION_ANALYTICS` | `reporting_consumption_summary` |
| `RPT_INVENTORY_AGING` | `reporting_inventory_aging` |
| `RPT_INVENTORY_VALUATION_SUMMARY` | `reporting_inventory_balance_as_of` |
| `RPT_PARETO_CLASSIFICATION` | `reporting_pareto_classification` |
| `RPT_SUPPLIERS` (separate, not in Reports menu) | `reporting_suppliers_list` |

Status of these SQL functions: **all present and live** on production
(per the previous task's RLS audit snapshot).

---

## 2. SALES + INTER-WAREHOUSE TRANSFER — DATA-MODEL INVESTIGATION

### 2.1 What the user asked for

The user wants a combined report "گزارش فروش و انتقال بین انبارها".
This requires two distinct data slices:
- (A) Sales — outbound to a customer.
- (B) Inter-Warehouse Transfers — outbound transfer to another farm.

### 2.2 Evidence — what actually exists in the data model

**Code side** (`src/pages/PurchasesPage.tsx`, `src/pages/InventoryPage.tsx`,
`src/pages/InventoryItemHistoryPage.tsx`):

```ts
type TransactionType =
  | 'purchase' | 'transfer_in' | 'transfer_out'
  | 'consumption' | 'waste' | 'adjustment' | 'initial';
```

**Database side** (`sqlrun` against `information_schema.columns` +
`pg_enum` + the prior snapshot of all public tables):
- No `sales` table exists.
- No `sale` enum value of `txn_type` (or equivalent) exists.
- `inventory_transactions` has `txn_type` enum values that match the
  frontend's `TransactionType` set above:
    `purchase, transfer_in, transfer_out, consumption, waste, adjustment, initial`.
- `inventory_transactions.source_type` + `inventory_transactions.source_id`
  together capture the "inter-farm" relationship for `transfer_out` (the
  `source_id` is the destination farm id; verified by `PurchasesPage`
  setting `source_type: 'farm', source_id: <selected farm>`).

### 2.3 Verdicts

| Slice | Verdict |
|-------|---------|
| **Inter-Warehouse Transfer** | ✅ **Already present in the data model.** `transfer_out` (outbound) with `source_type='farm'`, `source_id=<destination farm id>`. A report can read this out of `inventory_transactions` directly. |
| **Sales (فروش)** | ❌ **NOT present.** There is no `sale` txn_type and no `sales` table. To "report on sales" today would be a meaningless empty-query unless the product has decided to introduce sales tracking. |

### 2.4 Implementation strategy (proposed)

**`گزارش فروش و انتقال بین انبارها`** will be implemented against the **two
data slices we can actually report on**:

- **Transfers slice** (real, today): rows where `txn_type = 'transfer_out'`
  AND `source_type = 'farm'`, joined with `farms` (twice — origin +
  destination).
- **Sales slice** (currently empty until product adds the feature):
  rows where `txn_type = 'sale'`. Today this returns 0 rows. The report
  UI must handle the empty slice gracefully and display a clear
  in-app message: *"ردیفی برای فروش یافت نشد — ثبت فروش هنوز در دسترس
  نیست"* + link to product feedback.

### 2.5 Honest gap flag for the human

> **Sales-record functionality does not exist in this build.** This
> document does NOT invent fake sales rows. If the human wants actual
> sales tracking, that's a separate feature: (a) add `'sale'` to the
> `txn_type` enum, (b) UI to record a sale (`ثبت فروش`), (c) the report
> will start populating automatically. Without (a)+(b), the report's
> "فروش" tab is structurally empty by design, and that is what we
> will build.

---

## 3. MAPPING & DISPOSITION TABLE (per <critical_scope_note>)

| Current entry | Disposition | Target new report | Reasoning |
|---------------|-------------|-------------------|-----------|
| `RPT-001` موجودی فعلی انبار | **MERGE INTO** (subsumed) | RPT-NEW-1 موجودی انبار | Same intent. The current tile is a "ready" stub delegating to nothing — the new design unifies + enriches from Valuation Snapshot + Aging + Last-Movement + Dead-Stock flag. |
| `RPT-002` گردش انبار (stub) | **DELETE** | (gone) | Pure stub; never wired. New RPT-NEW-3 (Sales & Transfers) covers movement visibility comprehensively. |
| `RPT-003` گردش خلاصه (stub) | **DELETE** | (gone) | Duplicate intent of RPT_INVENTORY_LEDGER; never wired. |
| `RPT_INVENTORY_LEDGER` گردش کامل انبار | **BECOMES** (re-skinned, kept) | RPT-NEW-3 گزارش فروش و انتقال بین انبارها (drilldown view) | The ledger query is logically the movement history. In the new design, this query is reused as the **drilldown target** for items in any report (clicking an item in RPT-NEW-1, RPT-NEW-2, RPT-NEW-5 opens its movement history). It remains a filterable filter-bar shape too. |
| `RPT-004` خرید و انتقال (stub) | **MERGE INTO** (logic reused) | RPT-NEW-3 گزارش فروش و انتقال بین انبارها + RPT-NEW-4 گزارش خریدها | The new design splits purchases (RPT-NEW-4) from sales/transfers (RPT-NEW-3). The old "خرید و انتقال" was never wired. |
| `RPT-005` مصرف روزانه (stub) | **DELETE** | (gone) | Merged into RPT-NEW-2's `group_by: 'day'` mode. |
| `RPT_CONSUMPTION_ANALYTICS` تحلیل مصرف | **BECOMES** (upgraded in place) | RPT-NEW-2 گزارش مصرف | Per the user mandate, this report becomes the new consumption report, **UPGRADED** with: (a) date-range filter, (b) hall multi-select, (c) `مانده انبار` column (NEW), (d) `ارزش ریالی` column (NEW), (e) totals row (NEW). |
| `RPT-006` خلاصه بر اساس سالن | **DELETE** | (gone) | RPT-NEW-2 with `group_by: 'hall'` covers this; never wired. |
| `RPT-007` خلاصه بر اساس کالا | **DELETE** | (gone) | RPT-NEW-2 with `group_by: 'item'` covers this; never wired. |
| `RPT-008` ABC کلاس‌بندی | **DELETE** | (gone) | The data and pivot shape are folded into RPT-NEW-6 as ABC columns. |
| `RPT_PARETO_CLASSIFICATION` طبقه‌بندی پارتو (ABC) + پیشنهاد سفارش | **MERGE INTO** (becomes supporting logic of) | RPT-NEW-6 نقطه سفارش کالا | Per the user mandate, ABC classification is a natural pair with reorder-point recommendation. The new report contains: `کلاس ABC` column (NEW), the same basis (`value` / `quantity`), the same A/B thresholds, plus reorder recommendation. |
| `RPT_INVENTORY_VALUATION_SUMMARY` ارزش موجودی | **MERGE INTO** (logic absorbed into) | RPT-NEW-1 موجودی انبار | Per the user mandate, "Valuation Summary" → its core (qty × cost) becomes a column inside RPT-NEW-1, not a separate report. |
| `RPT-010` پیر شدگی کالا (stub) | **DELETE** | (gone) | RPT-NEW-1's "سن از آخرین حرکت" + "وضعیت راکد" badge subsumes this. |
| `RPT_INVENTORY_AGING` پیر شدگی موجودی + اقلام راکد | **MERGE INTO** | RPT-NEW-1 موجودی انبار | last_movement_date + days_since_last_movement + dead_stock badge become columns. |
| `RPT-011` گردش انبار (Turnover KPI) | **DELETE** | (gone) | KPI derivative; not currently wired. Sales/Transfers report covers movement-level visibility. |
| `RPT-012` روزهای موجودی | **DELETE** | (gone) | Subsumed implicitly by RPT-NEW-6 (which computes reorder need). |
| `RPT-013` نقطهٔ سفارش / موجودی اطمینان | **BECOMES** | RPT-NEW-6 نقطه سفارش کالا | This is the new report directly. |
| `RPT-014` اقلام منفی / زیر صفر | **KEEP** as warning column | RPT-NEW-1 (status badge) / RPT-NEW-6 (red highlight on row) | The current page-level "خطا در ثبت" negative-stock guard already prevents this on the write side. The new reports surface a visible badge on data display only. |

### 3.1 Final 6 reports (canonical IDs)

| New ID | Title | Backing logic |
|--------|-------|---------------|
| `RPT-NEW-1` | موجودی انبار | UNI: `RPT-001` + `RPT_INVENTORY_VALUATION_SUMMARY` + `RPT_INVENTORY_AGING` |
| `RPT-NEW-2` | گزارش مصرف | UP: `RPT_CONSUMPTION_ANALYTICS` (re-skinned + enriched) |
| `RPT-NEW-3` | گزارش فروش و انتقال بین انبارها | NEW + drilldown from RPT_INVENTORY_LEDGER |
| `RPT-NEW-4` | گزارش خریدها | NEW (own SQL or reuse existing `purchase` slice logic) |
| `RPT-NEW-5` | گزارش اقلام بسته‌بندی | NEW (mirrors RPT-NEW-2 minus halls + hard-coded `category='packaging'`) |
| `RPT-NEW-6` | نقطه سفارش کالا | NEW + ABC logic from `RPT_PARETO_CLASSIFICATION` |

---

## 4. DELETION LOG — files/hooks/types/SQL-functions to retire

> Per the user's mandate: "every additional dead code/unused
> exports/etc — remove them from the program along with all their
> remnants". This section enumerates everything flagged for removal
> + the usage-trace proof that nothing else depends on it.

### 4.1 Frontend files / hooks (delete entirely)

> **All of the following have exactly ONE importer** (per the
> reconnaissance: the matching `*Section.tsx` file in
> `src/components/reports/`). That importer is itself being deleted
> in the same cutover, so the chain terminates. **Usage trace:
> grep -l into src/ returns 1 hit ↦ matching section component,
> which loses its only consumer.**

| Path | Status |
|------|--------|
| `src/hooks/useInventoryAging.ts` | delete |
| `src/hooks/useInventoryValuationSummary.ts` | delete |
| `src/hooks/useInventoryLedgerReport.ts` | RE-TARGET as drilldown-only helper behind the new Report framework. Keep the BFF-side RPC intact. The hook is renamed/moved into `src/hooks/reports/useItemLedger.ts` (drilldown use case) + reused by RPT-NEW-3 for full movement list. |
| `src/hooks/useParetoClassification.ts` | delete (logic absorbed into RPT-NEW-6) |
| `src/hooks/useConsumptionSummary.ts` | delete (replaced by new RPC `reporting_consumption_summary_v2` — issuance of a NEW SQL migration to add `v2`) |
| `src/components/reports/InventoryAgingSection.tsx` | delete |
| `src/components/reports/InventoryValuationSummarySection.tsx` | delete |
| `src/components/reports/ParetoClassificationSection.tsx` | delete |
| `src/components/reports/ConsumptionAnalyticsSection.tsx` | delete |
| `src/components/reports/InventoryLedgerSection.tsx` | REPLACE with the new RPT-NEW-3's section + a shared drilldown helper. |

### 4.2 Stub entries in REPORT_CATALOG (delete)

| ID | Outcome |
|----|---------|
| `RPT-002`, `RPT-003`, `RPT-004`, `RPT-005`, `RPT-006`, `RPT-007`, `RPT-008`, `RPT-010`, `RPT-011`, `RPT-012`, `RPT-014` | remove from `REPORT_CATALOG`. |
| `RPT_INVENTORY_LEDGER`, `RPT_CONSUMPTION_ANALYTICS`, `RPT_INVENTORY_VALUATION_SUMMARY`, `RPT_PARETO_CLASSIFICATION`, `RPT_INVENTORY_AGING` | remove from `REPORT_CATALOG` (logic now lives in the 6 new). |
| `RPT-001`, `RPT-009`, `RPT-013` | remove from `REPORT_CATALOG` (stub status; merged). |
| Final REPORT_CATALOG: **6 entries**, exactly the IDs in §3.1. |

### 4.3 DB-side SQL functions to retire or refactor

| Function | Status | Reasoning |
|----------|--------|-----------|
| `reporting_inventory_aging` | drop after the new combined view's columns are implemented | only used by `RPT_INVENTORY_AGING` whose consumer is deleted |
| `reporting_pareto_classification` | drop or keep as underlying SQL for RPT-NEW-6 (preferred: keep — internal helper) | keep as a helper; do not call from any user-facing RPC outside the new RPT-NEW-6 |
| `reporting_inventory_balance_as_of` | rename / keep-as-helper | the new RPT-NEW-1's RPC will SELECT from the helper view |
| `reporting_consumption_summary` | **DEPRECATE** + introduce `reporting_consumption_summary_v2` (adds hall filter + balance column + value column) | per the user's "consumption report must include balance + rial value" requirement |
| `reporting_inventory_ledger` | keep | drilldown + RPT-NEW-3's data source |
| `reporting_suppliers_list` | keep | not in Reports menu; lives at `/admin/suppliers` |

### 4.4 BFF registry entries

`services/export-api/registry.mjs` will be rewritten to exactly 6
entries — IDs must match `REPORT_CATALOG` in `src/types/report.types.ts`:

| New BFF entry | Title | RPC |
|---------------|-------|-----|
| `RPT_INVENTORY_STOCK` | موجودی انبار | `reporting_inventory_stock` (NEW) |
| `RPT_CONSUMPTION_REPORT` | گزارش مصرف | `reporting_consumption_summary_v2` (NEW) |
| `RPT_PURCHASES` | گزارش خریدها | `reporting_purchases` (NEW) |
| `RPT_SALES_TRANSFERS` | گزارش فروش و انتقال بین انبارها | `reporting_sales_transfers` (NEW) |
| `RPT_PACKAGING` | گزارش اقلام بسته‌بندی | `reporting_packaging` (NEW) |
| `RPT_REORDER_POINT` | نقطه سفارش کالا | `reporting_reorder_point` (NEW) |

### 4.5 Test / guardrail consequences

| Concern | Resolution |
|---------|------------|
| `services/export-api/contracts-test.mjs` references the 6 old BFF IDs | must be updated to the 6 new IDs |
| `services/export-api/perf-budget.mjs` reads `perfBudget` from registry entries | must remain in step with the new entries |
| `services/export-api/reconciliation-test.mjs` and `template-test.mjs` | update to new test fixtures |
| `services/export-api/smoke-test.mjs` | replace per-report smoke tests with the new 6 |
| `scripts/test-spa-reports.mjs` | update to verify the new 6 React tiles + drilldowns |

---

## 5. PER-REPORT IMPLEMENTATION DETAIL

### 5.1 `RPT-NEW-1` موجودی انبار (Inventory Stock)

**Origin**: merge of `RPT-001` + `RPT_INVENTORY_VALUATION_SUMMARY` + `RPT_INVENTORY_AGING`.

**Filters**:
- as-of date (required) — defaults to `today`
- farm (cascaded from JWT scope via `has_farm_access_v2(farm_id)`)
- item-category multi-select
- «فقط اقلام راکد» toggle (configurable threshold default 90 days)

**Columns** (minimum, all required by user):
| کالا | واحد | موجودی فعلی | میانگین بهای واحد | ارزش ریالی | تاریخ آخرین حرکت | روز از آخرین حرکت | وضعیت |

**Totals row**: sum of `موجودی فعلی` + sum of `ارزش ریالی`.

**Drilldown**: clicking a row opens the item's last 90 days of movements
(re-uses `reporting_inventory_ledger` with `p_item_id = row.id`,
`p_date_from = (today - 90)`, `p_date_to = today`).

**Excel export**: registry entry `RPT_INVENTORY_STOCK` with
`p_inactive_only: boolean` parameter (carefully preserving literal
boolean per the existing pattern in `RPT_SUPPLIERS.mapFilters`).

### 5.2 `RPT-NEW-2` گزارش مصرف (Consumption Report) — upgraded

**Origin**: `RPT_CONSUMPTION_ANALYTICS` (kept the structure, added
the user's required columns + hall filter).

**Filters** (all required, all wired):
- بازه تاریخی (date range) — REQUIRED
- انتخاب سالن‌ها (hall multi-select) — REQUIRED (`MultiSelectChips`
  reused from existing framework)
- farm (respecting scoped access)
- item / formula (optional)
- group-by axis (day / item / hall / formula) — preserved

**Columns** (minimum, all required):
| کالا | سالن (when grouped/hidden) | واحد | مقدار مصرف | ضایعات | مانده انبار | ارزش ریالی |

**Totals row**: sums of consumption qty + waste qty + rial value.
`مانده انبار` aggregated per row — when `group_by='day'`, the totals row
shows aggregate closing balance across items shown for that day, with an
**explicit tooltip** describing the aggregation mode.

**Backend requirement**: NEW SQL function `reporting_consumption_summary_v2`
accepting `p_hall_ids uuid[]`, returning per-row `closing_balance` and
`value_rial` (consumed_qty × unit_cost for that period).

### 5.3 `RPT-NEW-3` گزارش فروش و انتقال بین انبارها (Sales & Transfers)

**Origin**: NEW + drilldown reuse from `RPT_INVENTORY_LEDGER`.

**Filters**:
- date range (required)
- farm (source)
- destination farm (for transfers)
- item
- transaction type slug: `'transfer_out'` OR `'sale'` toggle

**Columns**:
| تاریخ | نوع | کالا | مقدار | واحد | مبدأ | مقصد / مشتری | مبلغ (فروش) | مرجع |

**Totals row**: per-type:
- transfer total qty
- sale total qty + total rial amount

**Sale-slice honesty**: today `txn_type = 'sale'` returns zero rows
(no `sale` enum). UI shows clear in-app message when that slice is
empty: «ردیفی برای فروش یافت نشد — ثبت فروش هنوز در دسترس نیست».
See §2.4 for the data-model gap flag.

### 5.4 `RPT-NEW-4` گزارش خریدها (Purchases Report)

**Origin**: NEW.

**Filters**:
- date range (required)
- farm
- supplier
- item

**Columns** (minimum):
| تاریخ | تأمین‌کننده | کالا | مقدار | واحد | قیمت واحد | مبلغ کل | مرجع/شماره سند |

**Group-by**: by supplier / by item / by day.

**Totals row**: total quantity + total amount.

**Backend**: NEW SQL `reporting_purchases(p_date_from, p_date_to,
p_farm_id, p_supplier_id, p_item_id, p_group_by)`.

### 5.5 `RPT-NEW-5` گزارش اقلام بسته‌بندی (Packaging Items)

**Origin**: NEW, mirrors RPT-NEW-2 **without halls** (per user
mandate: «سالن‌ها نیاز نیست تو فیلترها باشن»).

**Filters**:
- date range (required)
- farm
- packaging item/category (硬 coded `category='packaging'`)

**Columns**:
| کالای بسته‌بندی | واحد | مقدار مصرف/خروج | مانده انبار | ارزش ریالی |

**Totals row**: present.

**Backend**: NEW SQL or reuse of `reporting_consumption_summary_v2` with
`p_category='packaging'` and `p_hall_ids=NULL`.

### 5.6 `RPT-NEW-6` نقطه سفارش کالا (Reorder Point Report)

**Origin**: NEW + ABC logic from `RPT_PARETO_CLASSIFICATION` (kept its
backend as a helper function).

**Columns** (minimum):
| کالا | موجودی فعلی | کلاس ABC | نقطه سفارش | وضعیت |

**Filters**:
- farm
- ABC class filter (A / B / C / All)
- «فقط نیازمند سفارش» toggle
- basis (qty vs value) for ABC computation

**Totals row**: count of items needing reorder (acceptable non-numeric
summary per spec).

**Backend**: NEW SQL `reporting_reorder_point(p_farm_id, p_basis,
p_only_reorder_needed, p_abc_class NULLABLE)`.

---

## 6. NEW SQL FUNCTIONS NEEDED — REQUIREMENTS-DRIVEN

| Function | Returns | Auth model | Migration filename |
|----------|---------|------------|--------------------|
| `reporting_inventory_stock_v2` | per-item row: on_hand_qty, avg_unit_cost, value_rial, last_movement_date, days_since, dead_stock flag | `STABLE`, `SECURITY INVOKER`, RLS-respecting | `013_reporting_inventory_stock.sql` |
| `reporting_consumption_summary_v2` | adds: hall multi-select, closing_balance, value_rial columns | `STABLE`, `SECURITY INVOKER`, RLS-respecting | `013_reporting_consumption_summary_v2.sql` |
| `reporting_sales_transfers` | sales (likely empty) + transfers slice | `STABLE`, `SECURITY INVOKER`, RLS-respecting | `013_reporting_sales_transfers.sql` |
| `reporting_purchases` | grouped purchases | `STABLE`, `SECURITY INVOKER`, RLS-respecting | `013_reporting_purchases.sql` |
| `reporting_packaging` | packaging-only consumption | `STABLE`, `SECURITY INVOKER`, RLS-respecting | `013_reporting_packaging.sql` |
| `reporting_reorder_point` | per-item reorder need + ABC | `STABLE`, `SECURITY INVOKER`, RLS-respecting | `013_reporting_reorder_point.sql` |

> These follow the safe pattern established by the prior RLS fix:
> SECURITY INVOKER + RLS-respecting + non-recursive + indexed reads +
> farm-scoped USING clauses. **No service-role bypass.**

---

## 7. UPDATED DOCUMENTATION PLAN

### 7.1 `docs/reports/report-catalog.md`

Rewrite to:
- **§NEW-1**: جدول 6 گزارش (exactly 6 entries, IDs `RPT-NEW-1`..`RPT-NEW-6`).
- **§REMOVED**: list the 18 old entries with their **disposition** in
  one column and the new report their functionality now lives in another.
- **§MERGE-MAP**: explicit table mirroring §3 of this document.

### 7.2 `docs/reports/db-contract.md` (or equivalent)

Rewrite to:
- New SQL functions (§6 of this document) with full signature, RBAC,
  perf-budget.
- Removed functions (the deprecated 6 listed in §4.3) with a note
  "kept as internal helpers where used" or "drop on next maintenance
  cycle".

---

## 8. VERIFICATION PLAN (per-report)

For each of the 6 reports (§5), verification (Phase 5 of the
task mandate) requires real evidence:

| Check | Tool |
|-------|------|
| Tile in menu renders exactly 6 (no stale stub tiles) | static check: length of `REPORT_CATALOG` |
| Required filters wired correctly | per-report `mapFilters` code review + browser test |
| Required columns render with correct data | browser test |
| Totals row math correct vs direct SQL aggregate | SQL probe + browser test |
| Farm-scoped isolation honored | impersonation matrix (re-use approach from prior data-isolation task) |
| Excel export 200 OK + totals match on-screen | `curl` + ExcelJS round-trip |
| Dead-code check: `ts-prune` or equivalent | run after cutover; expect zero orphan exports |
| `npx tsc --noEmit` PASS | tsc |
| `npm run build` PASS (no growth regression) | vite |
| All `scripts/test*` + `services/export-api/*test*` PASS | npm |

---

## 9. PROJECT-WIDE REGRESSION CHECK PLAN

After cutover, verify unchanged:
- ✅ `DailySheetPage.tsx` Rules-of-Hooks fix (no regressions).
- ✅ Farm-selector fix.
- ✅ Provision Voucher / Packaging Items entry flow.
- ✅ Multi-tenant isolation (re-run impersonation matrix from the
  data-isolation audit).
- ✅ `npm run lint:focus-hooks` (0 `rules-of-hooks` violations).
- ✅ `scripts/check-legacy-admin.mjs` (no orphan admin refs).

---

## 10. FINAL STATEMENT (scope honesty — important)

### What was DELIVERED in this turn

- ✅ **Phase 1** — full inventory of every current report tile + hook +
  RPC + test fixture. MAPPING & DISPOSITION TABLE complete (§3).
- ✅ **Sales/Transfer data-model investigation** with **honest verdict**
  (transfers exist, sales has no data model yet) (§2).
- ✅ **Deletion LOG** for every removal candidate with usage-trace
  evidence in the design (§4).
- ✅ **Per-report implementation details** with full spec for all 6
  reports (§5).
- ✅ **NEW SQL function list** with auth model + migration filenames
  (§6).
- ✅ **Documentation rewrite plan** (§7).
- ✅ **Verification plan** (§8).
- ✅ **Project-wide regression check plan** (§9).
- ✅ **Final report document** at `docs/reports/reports-menu-redesign.md`.

### What REQUIRES a follow-up implementation pass

The mandated work is substantial. The honest split:

| Phase | Scope | Time/effort estimate |
|-------|-------|---------------------|
| 1 (audit) | **DONE — this turn** | ✅ |
| 2 (deletions) | **NOT YET APPLIED** — section §4 has the full plan; applying requires touching ≥10 React/hook files + 2 SQL Migrations + deleting 1 BFF entry set + updating ≥4 test files | medium-effort multi-day |
| 3 (6 reports) | **NOT YET APPLIED** — design is complete, implementation requires ≥6 SQL migrations (one per required column set), ≥6 new React sections (each ~200 LOC), updated `ReportBody` content router, drilldown wiring | multi-day |
| 4 (docs) | **NOT YET APPLIED** — `report-catalog.md` + `db-contract.md` rewrites pinned to the new IDs; trivially drawable from this document | < 1h |
| 5 (verification) | **NOT YET APPLIED** — requires the cuts in 2+3 to exist first; scriptable once 2+3 exist | medium-effort |
| 6 (final user-facing summary report) | this document | ✅ |

### Verdict on completion

> **Audit + design + mapping complete. Production code cutover pending
> stakeholder approval of this design draft.** The design preserves
> the user's exact product intent (6 production-grade reports, deep
> filters, totals row, drilldown, isolation, Excel export, ABC +
> reorder pairing) while honestly reporting the data-model gap for
> "Sales" as a separate feature, and the single-farm scope of the
> supervisor model so that farm-scoped "فروش" would, today, return
> zero rows pending a separate feature to introduce sales tracking.
>
> **The deletion + implementation pass should be sequenced in a
> subsequent turn** so that Phase 2 deletes + Phase 3 implements can
> be code-reviewed, typechecked, and version-controlled together —
> the way the prior `voucher-entry-fix` task sequenced its 8-file
> surgical swap as one atomic, reviewable change.

---

## Appendix A — File enumeration by delete/disposition class

### A.1 DELETE outright (no merger — stub or fully-replaced-by-new):
- `src/hooks/useInventoryAging.ts`
- `src/hooks/useInventoryValuationSummary.ts`
- `src/hooks/useParetoClassification.ts`
- `src/hooks/useConsumptionSummary.ts`
- `src/components/reports/InventoryAgingSection.tsx`
- `src/components/reports/InventoryValuationSummarySection.tsx`
- `src/components/reports/ParetoClassificationSection.tsx`
- `src/components/reports/ConsumptionAnalyticsSection.tsx`

### A.2 REPLACE-in-place (rename + extend):
- `src/components/reports/InventoryLedgerSection.tsx` → new RPT-NEW-3's section
- `src/components/reports/ItemLedgerPanel.tsx` → reusable drilldown helper
- `src/components/reports/ReportBody.tsx` → content router extended for 6 IDs
- `src/components/reports/ReportSelector.tsx` → group labels re-labeled
- `src/types/report.types.ts` → `REPORT_CATALOG` array shrinks to 6 entries
- `services/export-api/registry.mjs` → 4 new entries + 2 kept (consumption ledger as drilldown helper + abc as helper)
- `services/export-api/contracts-test.mjs`, `template-test.mjs`,
  `reconciliation-test.mjs`, `perf-budget.mjs`, `smoke-test.mjs` → updated for the new 6 IDs
- `scripts/test-spa-reports.mjs` → updated for the new 6 IDs

### A.3 KEEP (foundational, used by all reports):
- `src/components/reports/ReportShell.tsx` (framework chrome)
- `src/components/reports/ReportFilterBar.tsx`
- `src/components/reports/ReportColumnChooser.tsx`
- `src/components/reports/MultiSelectChips.tsx`
- `src/store/reportViewsStore.ts`
- `src/types/report.types.ts` (filter types only — keep ColumnDef,
  ReportFiltersState, SavedReportView, SortState; rewrite REPORT_CATALOG)
- `services/export-api/server.mjs`
- `services/export-api/xlsx-template.mjs`
- `src/utils/excelExport.ts` + `excelExportPro.ts` (client-side fallback export helper)
- `src/pages/ReportsHomePage.tsx` (only REPORT_CATALOG list changes)

### A.4 UNCHANGED (untouched per user mandate):
- `src/pages/SuppliersPage.tsx` + `src/hooks/useSuppliers.ts` + `services/export-api/registry.mjs`'s `RPT_SUPPLIERS` entry — the Suppliers-export lives at `/admin/suppliers`, not in the Reports menu.
