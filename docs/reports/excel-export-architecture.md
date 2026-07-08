# Morvarid-Farm Excel Export — Architecture & Security Model

**Status:** shipped v0.1

**Owners:** platform team, farm-tech leads

## 1. Purpose

Rich XLSX exports (frozen panes, RTL view, autofilter, native styles) were
previously generated client-side via SheetJS (`xlsx`). That required shipping
~250 KB of generator code in the SPA bundle and forced the client to construct
the workbook in browser memory. This document covers the v0.1 split: a
dedicated server service (`services/export-api/` on Render) handles every
`.xlsx` build, while the SPA issues fetch requests with the user's existing
Supabase JWT.

### Design goals

1. **No elevated keys in the SPA bundle.** The SPA never embeds a
   service-role key — neither in `excelExport.ts` nor in any vite-env
   variable. Verification lives in `scripts/check-secrets.mjs`.
2. **End-to-end correctness for paginated sources.** The ledger RPC is
   keyset-paginated. The server drains the entire cursor chain so the
   export reflects the complete ledger for the user's filter window,
   not just the first 50 rows the SPA section can see.
3. **RLS preserved end-to-end.** The server does *not* impersonate the
   user with a service-role key. Every RPC call goes through a
   request-scoped Supabase client that carries the user's Bearer JWT.
   Because the reporting RPCs (`scripts/migrations/*reporting*.sql`)
   are `SECURITY INVOKER`, Postgres RLS policies apply naturally.
4. **RBAC gate is the server's responsibility.** Operators see only
   operational reports. Financial / scoring reports are gated to
   admin + supervisor.
5. **ExcelJS, not SheetJS.** ExcelJS gives proper styles + RTL + frozen
   panes + autofilter; the SPA bundle no longer carries the SheetJS
   code path for reports.

## 2. Trust boundary

```
   ┌─────────────────┐   Bearer JWT    ┌────────────────────────┐
   │  SPA (browser)  │ ──────────────► │  export-api (Fastify)  │
   └─────────────────┘                 │   ├─ JWT verify         │
        │                              │   ├─ RBAC allowlist     │
        │ xlsx blob                    │   ├─ scoped anon client │
        ◄────────────────────────────── │   ├─ reporting_* RPCs   │
                                       │   └─ ExcelJS build      │
                                       └────────────────────────┘
                                                  │
                                                  ▼
                                       ┌────────────────────────┐
                                       │  Supabase Postgres     │
                                       │  (RLS, SECURITY INVOKER) │
                                       └────────────────────────┘
```

1. The **SPA** is the user agent. It sends the user's Bearer JWT — the
   same JWT it uses for any other Supabase RPC. It never holds the
   service-role key.
2. **export-api** is what Render runs. It has two env-only secrets: the
   Supabase URL and the anon key. Per-request, it scopes a client with
   the user's JWT so its RPC queries are RLS-bound to that user.
3. **Supabase Postgres** is the source of truth. The reporting RPCs are
   declared `SECURITY INVOKER` (see the migration headers), so RLS
   policies are honored on every `reporting_*` call from any JWT.

## 3. Threat model

| Risk | Mitigation |
|---|---|
| Service-role key leaks into SPA bundle | `scripts/check-secrets.mjs` blocks `VITE_SUPABASE_SERVICE_ROLE_KEY*` in environment files. Render env group contains only URL + anon key. |
| Cross-tenant data access | Each request is bound to the caller's JWT via `buildScopedClient(jwt)`. No request runs without `Authorization`. |
| Token replay | JWT verification goes through `supabase.auth.getUser(token)`, which checks signature + expiry server-side. |
| RBAC bypass by path-tampering | The registry keys off `reportId` matching the catalog id. Unknown `reportId` ⇒ 404. Operator requesting a financial report ⇒ 403. |
| CORS widening | `ALLOWED_ORIGIN` env var; defaults to dev wildcard only when `NODE_ENV != production`. Refuses cross-origin in prod if allowlist empty. |
| Row-dump DoS | Drain loop caps at 200k rows. `bodyLimit: 5MB`. Server masks `err?.message` in production responses for every error path (401 / 500 / 502); raw text stays in `req.log.error` only. |
| Audit gap | Future: log export events to an `export_audit` table. `SUPABASE_SECRET_KEY` slot is reserved for that flow but unused today. |

## 4. Components

### Server (`services/export-api/`)

- **`package.json`** — minimal Fastify + ExcelJS + @supabase/supabase-js.
- **`server.mjs`** — Fastify 4 with:
  - `@fastify/cors` allowlist via `ALLOWED_ORIGIN`.
  - `authClient` — single anon-key client used only for JWT verification
    via `auth.getUser(token)`.
  - `buildScopedClient(jwt)` helper — per-request client that carries
    the user's Bearer JWT. RPC calls go here.
  - `verifyJwt` — extracts + validates the token; on failure returns 401.
  - `fetchProfile` — reads `profiles.role`, `farm_id`, `is_active`.
  - `callRpc` — for the ledger, follows the `has_more` cursor and
    threads `prior_balance`; for all other reports, single-shot.
  - `buildWorkbook` — ExcelJS builder:
    - Title row (merged across columns), navy fill, white bold, freeze.
    - Header row: navy fill, white bold, white borders, wrapText.
    - Body rows: alternating tint, Calibri 10pt, all borders.
    - `views: [{ state: 'frozen', ySplit: 2, rightToLeft: true }]`.
    - `autoFilter` over the data range.
- **`registry.mjs`** — single source of truth for the 5 live reports:
  RPC name, RBAC allowlist, Persian sheet name, body→args mapper,
  Persian column headers. Adding a new report = one entry here.
- **`smoke-test.mjs`** — pure-Node `fetch` against `localhost:3000`,
  asserts the ZIP magic (`PK\x03\x04`) + minimum size, writes the blob
  to `smoke-output.xlsx`. CI-friendly.
- **`.env.example`** — documents required env vars.

### SPA (`src/lib/excelServer.ts`)

Single helper, used from report sections:

```ts
await triggerServerExport('RPT_PARETO_CLASSIFICATION', filters);
```

- Reads the active Supabase session via `supabase.auth.getSession()`.
- POSTs to `${VITE_BFF_URL}/api/export/${reportId}` with the filters
  as JSON body + Bearer token.
- Reads the blob and triggers an `<a download>` for the user.

`excelExport.ts` (client-side SheetJS) is retained for legacy pages
(inventory transactions, daily-sheet, suppliers, etc.) until those
move to the same path.

## 5. Deploy

`render.yaml` at the repo root declares both services:

- `morvarid-farm-spa` — Static Site, current SPA.
- `morvarid-export-api` — Node Web Service, new.

Set the env vars in the Render dashboard secret group
`morvarid-prod-secrets`:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

`ALLOWED_ORIGIN` is set inline in `render.yaml` and should match the
SPA's production URL.

## 6. RBAC matrix

| Report | admin | supervisor | operator |
|---|---|---|---|
| `RPT_INVENTORY_VALUATION_SUMMARY` | ✅ | ✅ | ❌ |
| `RPT_INVENTORY_LEDGER` | ✅ | ✅ | ✅ |
| `RPT_CONSUMPTION_ANALYTICS` | ✅ | ✅ | ✅ |
| `RPT_INVENTORY_AGING` | ✅ | ✅ | ❌ |
| `RPT_PARETO_CLASSIFICATION` | ✅ | ✅ | ❌ |

Editing the matrix = editing `registry.mjs`'s `allowedRoles`.

## 7. Smoke test

```bash
TEST_JWT=eyJhbG... npm --prefix services/export-api run test:smoke
```

Exits 0 if the response is a valid .xlsx blob ≥4 KB starting with
`PK\x03\x04`. Override the report id via `SMOKE_REPORT=...`.

## 8. Future work

- Production audit table (`EXPORT_AUDIT`) populated via the
  (currently unused) `SUPABASE_SECRET_KEY` slot.
- Move the 5 legacy `exportXxxToExcel` functions in `excelExport.ts`
  onto the server framework once their pages wire up.
- Move operator-only ledger filtering onto row-level security on the
  ledger RPC itself (currently the operator sees all data their JWT
  can see).

## 12. Excel Design System

A single module — **`services/export-api/xlsx-template.mjs`** — owns
every workbook produced by the export service. The server is a thin
caller of `buildReportWorkbook(reportDef, rows, opts)`. The registry
(`registry.mjs`) declares per-report column types; the template maps
those types into styles, formats, freeze panes, conditional formatting,
totals + reconciliation, and an optional Dashboard Summary sheet.

### 12.1 Workbook metadata

| Property | Value |
|---|---|
| `creator` | `Morvarid-Farm` |
| `company` | `Morvarid-Farm` |
| `title` | The report's Persian title |
| `subject` | The Persian sheet name |
| Sheet name pattern | `گزارش — <persian sheet name>` |

The `گزارش — ` prefix keeps multi-sheet workbooks (Dashboard Summary
+ Reports/*) scan-grouping cleanly in Excel's tab bar.

### 12.2 Header band

Two-row header on every data sheet:

- **Row 1 — Title.** Merged across `columns.length`. Bold white
  (`14pt`) on BluBank navy (`#1D3557`). Height 30pt. Bottom border
  in white.
- **Row 2 — Column headers.** Bold white (`11pt`) on darker navy
  (`#264653`). `wrapText: true`. White borders all four sides.
  Height 26pt.

### 12.3 Body rows

- **Zebra striping.** Even rows `#F7FFF7`, odd rows `#FFFFFF`.
- **Border tint.** `#B7E4C7` (mint), thin all four sides.
- **Alignment.**
  - Numeric (`currency`, `qty`, `integer`, `percent`) → right-aligned,
    `readingOrder: 'ltr'`. Numerics read LTR even on RTL sheets so
    the minus sign, decimal, and thousands separator land in the
    expected positions.
  - `date` → center.
  - Plain text → center with `readingOrder: 'rtl'`.
- **Font.** `Vazirmatn 10pt` body, `Vazirmatn 10pt bold #1D3557`
  totals. See §12.8 for the font-install caveat.

### 12.4 Number formats

The registry can tag any column with `column.type` ∈ `{ currency, qty,
integer, percent, date, plain }`. The template applies the matching
`numFmt`:

| Type | numFmt | Example |
|---|---|---|
| `currency` | `'#,##0" ریال"'` | `42,000,000 ریال` |
| `qty` | `'#,##0.##'` | `1,500.50` |
| `integer` | `'#,##0'` | `1,500` |
| `percent` | `'0.00%'` | `45.00%` |
| `date` | `'yyyy-mm-dd'` | `2026-06-12` |
| `plain` | (none — raw) | (Pashto / free text) |

If `column.type` is absent, a legacy numeric-key heuristic classifies
the column (e.g. `qty_in`, `value_rial` → `qty`; `share_pct`,
`cumulative_share_pct` → `percent`). New reports should set
`column.type` explicitly so the heuristic can be retired.

### 12.5 Layout: freeze panes, autofilter, RTL

Every data sheet has:

- `views: [{ state: 'frozen', xSplit: 0, ySplit: 2, rightToLeft: true, showGridLines: true }]`.
  Title + header are frozen; rows scroll below.
- `autoFilter` from row 2 (header) to `lastDataRow`, columns 1 → N.
  Row 2 is the header row so dropdowns align with the column titles.
- `rightToLeft: true` because every Morvarid-Farm report reads Persian
  RTL. Setting `readingOrder: 'ltr'` on numeric cells (§12.3) keeps
  digit columns reading in the natural Arabic-numeral direction.

### 12.6 Conditional formatting

Applied only to data sheets, only where the relevant column key exists
in the `columns` array.

| Trigger | Type | Visual |
|---|---|---|
| `abc_class == "A"` | `cellIs equal` | Green fill `#D4F4D2` |
| `abc_class == "B"` | `cellIs equal` | Yellow fill `#FFF1B5` |
| `abc_class == "C"` | `cellIs equal` | Red fill `#FCD3CD` |
| `days_since_last_movement` | `dataBar gradient navy` | Filling from 0 to max |
| `lowStockColumn ≤ lowStockThreshold` | `cellIs lessThanOrEqual` | Soft peach fill `#FFE8E8` |

Spec §2 asks for "Conditional formatting equivalents if ExcelJS
supports them (or basic fill rules)." CellIs + dataBar cover the two
shapes the registry surfaces. The **low-stock** rule is registry-
driven: any report can declare `lowStockColumn` + `lowStockThreshold`,
and operators can override the threshold per request via
`body.low_stock_threshold` without a code change. Sheet-level
applications remain an iterative decision (e.g. heat-map on aging's
`value_rial`) until a use case demands it.

### 12.7 Totals row + reconciliation row — formula policy

Two formula rows sit *below* the data range. Per spec §4: **only
rectangular, consistent formula regions — no one-off formulas**.

#### Totals row (registry opt-in)

- `reportDef.totalsColumns: ['value_rial', ...]`.
- Inserted immediately after `lastDataRow`.
- First cell = `'جمع'`.
- Each declared column gets `{ formula: 'IF(last >= first, SUM(<col><first>:<col><last>), 0)' }`.
  The `IF` guard prevents `SUM(<empty>:...)` from throwing on a
  no-row export.
- Cell uses `totalsFill` (`#E7F3E7`) tint, bold navy font, the column's
  own `numFmt` so the totals render in the same format as the column.

Current registry opt-ins:

| Report | `totalsColumns` |
|---|---|
| `RPT_INVENTORY_VALUATION_SUMMARY` | `on_hand_qty`, `value_rial` |
| `RPT_CONSUMPTION_ANALYTICS` | `consumed_qty`, `waste_qty`, `total_qty`, `voucher_count` |
| `RPT_INVENTORY_AGING` | `on_hand_qty`, `value_rial` |
| `RPT_INVENTORY_LEDGER` | — (running_balance is a per-row cumulative, not a sheet sum) |
| `RPT_PARETO_CLASSIFICATION` | — (share % sums to 100% by construction; meaningless to re-sum) |

#### Reconciliation row (registry opt-in)

- `reportDef.reconcileColumn: { column: 'value_rial', label: '...' }`.
- Inserted immediately after the totals row.
- First cell = `'label'`.
- The declared column gets
  `{ formula: 'IF(OR(<first>=<cell>, <first>>last), "-", <col><last> - <col><first>)' }`.
  Renders `پایان − آغاز` of the column, or `'-'` when the export is
  empty / single-row.
- Light amber fill (`#FFF7E0`) to distinguish from totals.

Current registry opt-ins:

| Report | `reconcileColumn.column` |
|---|---|
| `RPT_INVENTORY_VALUATION_SUMMARY` | `value_rial` (مقایسه با اولین ردیف) |
| `RPT_INVENTORY_LEDGER` | `running_balance` (پایان − آغاز برای کنترل) |

### 12.8 Font — Vazirmatn

Every text cell sets `font.name = 'Vazirmatn'`. ExcelJS does
**not** embed font files — it just records the font name in the
workbook XML. When Excel opens the file, it falls back to a system
Persian font (Tahoma, B Nazanin, Segoe UI) on machines without
Vazirmatn installed.

- **Affected machines:** any environment without Vazirmatn
  system-wide.
- **What changes when the font is missing:** glyph shapes only.
  Layout, column widths, number formats, freeze panes, autofilter,
  conditional formatting, and formulas — everything else works.
- **Where to install:** <https://github.com/razim-software/vazirmatn>
  (free, OFL).
- **Mitigation in code:** we keep the declared font as a style
  preference so IT teams that *have* installed Vazirmatn see the
  intended typography without code changes.

### 12.9 Dashboard Summary sheet (opt-in)

`opts.dashboard === true` prepends a sheet named `'داشبورد'`. The
data sheet shifts to position 2.

Sheet layout:

- **Row 1.** Title bar (merged `A1:D1`). Book navy fill, bold
  white `16pt`, centered RTL. Value:
  `'داشبورد خلاصه — <persian report title>'`.
- **Rows 3-6.** Meta block (label / value rows), light-blue tint:
  - `شناسه گزارش` → `reportDef.id` (`RPT_INVENTORY_VALUATION_SUMMARY`)
  - `نام برگه` → data sheet name (`گزارش — ارزش موجودی`)
  - `تعداد ردیف` → `String(rows.length)` (numeric, written as a
    plain value so it survives even if the data sheet's rows are
    later edited)
  - `تاریخ تولید` → `new Date().toLocaleString('fa-IR')`
- **Rows 8+.** KPI block (label / formula cells), each row pairs a
  Persian label with a formula that links to the data sheet so the
  dashboard auto-updates if the operator edits a cell:

  | KPI | Formula |
  |---|---|
  | Always | `COUNTA('<data>'!A<first>:A<last>)`  — row count |
  | Per `totalsColumns` | `IF(<last>>=<first>, SUM('<data>'!<col><first>:<col><last>), 0)` |
  | Pareto (only) | `COUNTIF('<data>'!<abc><first>:<abc><last>, "<class>")` for `A`, `B`, `C` |

The KPI value cells use `numFmt: '#,##0'` and the dashboard `kpiValue`
font. Operators can copy any KPI value into a downstream sheet without
re-deriving it from the raw data.

**Dashboard opt-in semantics.** Three-state, useful when the SPA
currently hard-codes dashboard=false:

- `body.dashboard === true` → Dashboard Summary always on.
- `body.dashboard === false` → Dashboard Summary suppressed.
- `body.dashboard` omitted → falls back to `reportDef.dashboardByDefault`
  (currently `true` for `RPT_INVENTORY_VALUATION_SUMMARY`, `false`
  otherwise). This lets the SPA evolve toward an opt-out UX without
  requiring per-report tile work.

**Top-N block.** Reports may declare `topN = { column, n, label,
columns }` in the registry. When the Dashboard Summary is on AND the
report has `topN`:

1. `server.mjs` pre-sorts the row array DESC by `topN.column`
   (NULL/non-numeric sinks to the bottom).
2. The dashboard renders a sub-header band merged across
   `topN.columns.length`, a column-header row from the same registry
   columns, and `topN.n` data rows whose cells are direct formula
   refs back to the sorted data sheet
   (`='گزارش — <sheet>'!<col><dataRowIndex>`).

The result: opening Excel and clicking on a dashboard cell shows the
underlying data cell live in the formula bar — drag-recalculate
behaves naturally.

**Current opt-ins.** `RPT_INVENTORY_VALUATION_SUMMARY` is the first
report to use all three knobs (`dashboardByDefault`, `topN`,
`lowStockColumn` / `lowStockThreshold`). Other reports stay on-demand
default-omit.

### 12.10 Adding a new report

1. Add a row to `reportRegistry` in `registry.mjs`.
2. Set `rpcName`, `allowedRoles`, `sheetName`, `title`, `mapFilters`,
   `columns` (each column: `key`, `header`, `width`, optional `type`).
3. Optionally declare `totalsColumns` / `reconcileColumn` for the
   formula rows.

Nothing else changes. The template handles styling.

### 12.11 Self-test

`node template-test.mjs` (or `npm run test:template`) re-parses each
generated workbook with ExcelJS and asserts:

- ZIP magic + size threshold (no repair warning).
- Workbook metadata (`creator`, `company`, `title`).
- Sheet count + sheet names (`داشبورد` first when enabled,
  `گزارش — *` always for data).
- Title row (merge + bold + size + alignment).
- Header row (cell count + Persian header copy).
- Frozen pane + RTL + `ySplit` + `autoFilter.from/to`.
- Column widths.
- Number format applied per type (`yyyy-mm-dd`, `0.00%`, `ریال` suffix).
- Totals row SUM formulas on declared `totalsColumns`.
- Reconciliation row formula on declared `reconcileColumn`.
- Conditional formatting (ABC cellIs + aging dataBar).
- Dashboard sheet meta block + KPI formula cells.

Set `OUTPUT=/tmp/xlsx-blobs` to also write sample `.xlsx` files for
human inspection.

### Caveat: cross-item ledger `running_balance`

The ledger export threads `prior_balance = LAST row's running_balance`
across paginated pages. SQL `PARTITION BY (farm_id, item_id)` means
prior_balance *only* stays correct when every row on every page lives
in the same partition. When `item_id` is NULL (cross-item export),
the carried prior_balance can leak across partitions and inflate the
running_balance of items that were not on the prior page.

**Mitigation:** the SPA ledger UI pre-filters to one item at a time
(`filters.itemIds[0]`), so single-item exports are correct. Cross-item
exports treat `running_balance` as informational. A follow-up should
either partition the cursor per `(farm_id, item_id)` or compute the
true cumulative as a server-side aggregation when item_id is NULL.
