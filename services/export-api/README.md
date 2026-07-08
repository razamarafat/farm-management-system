# @morvarid/export-api

Server-side XLSX export API for Morvarid-Farm reports.

**What it does**

- Receives `POST /api/export/:reportId` from the SPA, authenticated with the
  user's Supabase JWT (Authorization Bearer).
- Verifies the JWT via `supabase.auth.getUser(token)`, then issues all RPC
  queries through a per-request *scoped* client that carries the same JWT.
  Because every reporting RPC is `SECURITY INVOKER`, RLS policies on the
  underlying tables apply naturally — no service-role key path.
- Enforces an RBAC matrix per report (default deny).
- Generates an ExcelJS workbook via the **Excel Design System**
  (`xlsx-template.mjs`) with frozen panes, RTL view, borders, Persian
  column headers, autofilter, number formats, totals + reconciliation,
  conditional formatting, and an optional Dashboard Summary sheet.
- Returns the binary with
  `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

**Why server-side**

The SPA used to ship `xlsx` (SheetJS) in the bundle. ExcelJS gives proper
styles, borders, frozen panes and autofilter, but is large and pushes the
client bundle across memory budgets. Generating XLSX server-side also
prevents any elevated keys from ever leaking into the Vite bundle.

---

## Excel Design System

Every workbook is produced by **`xlsx-template.mjs`** — a single module
that owns workbook metadata, styles, number formats, freeze panes, RTL
view, zebra striping, conditional formatting, totals + reconciliation,
and the optional Dashboard Summary sheet. The registry (`registry.mjs`)
declares per-report column types, totals columns, and reconciliation
shape; the server (`server.mjs`) is a thin caller of `buildReportWorkbook()`.

Spec: [`docs/reports/excel-export-architecture.md` §12](../../docs/reports/excel-export-architecture.md#12-excel-design-system).

### What's in the box

| Feature | Behavior |
|---|---|
| **Workbook metadata** | `creator`, `company`, `title`, `subject` set on every file. |
| **Header band** | Title row (merged), then header row with `wrapText`. Bold white on BluBank navy fill. |
| **Zebra striping** | Alternating row tint (`#F7FFF7` over `#FFFFFF`). Right-aligned numerics, centered text, RTL view. |
| **Number formats** | Type-tagged per column — `currency` (`#,##0" ریال"`), `qty` (`#,##0.##`), `integer` (`#,##0`), `percent` (`0.00%`), `date` (`yyyy-mm-dd`). Falls back to legacy numeric-key heuristic when type absent. |
| **Frozen pane** | First 2 rows (title + header). AutoFilter on the data range. RTL view per Persian sheet. |
| **Conditional formatting** | Pareto ABC class → green/yellow/red cell fills. Aging `days_since_last_movement` → navy dataBar gradient. Low-stock `cellIs lessThanOrEqual` → soft peach `#FFE8E8` fill when the registry-declared column ≤ threshold (operator override via `body.low_stock_threshold`). |
| **Totals row** | SUM formula on `reportDef.totalsColumns`. First cell = `جمع`. Spec §4 ("rectangular, consistent formula regions"). |
| **Reconciliation row** | `reportDef.reconcileColumn` → `(last - first)` formula on the chosen column. |
| **Dashboard Summary** | Opt-in via `body.dashboard === true`. Per-report default via `reportDef.dashboardByDefault` (valuation turns it on automatically). Sheet 1: title + meta + KPI block (row count, totals linked via formula, ABC distribution for Pareto, **Top-N by chosen column** when `reportDef.topN` is declared). |
| **Top-N block** | `reportDef.topN = { column, n, label, columns }`. Server pre-sorts rows by `column` DESC; dashboard renders N rows × chosen columns as direct formula refs to the sorted data sheet. |

### Font: Vazirmatn

Every text cell sets `font.name = 'Vazirmatn'`. ExcelJS does not embed
font files; Excel falls back to a system Persian font (Tahoma / B Nazanin /
Segoe UI) on machines without Vazirmatn installed. **Users who care
about Persian typography should install Vazirmatn**
(<https://github.com/razim-software/vazirmatn>) system-wide. Otherwise
the workbook layout and number formats are still correct — only the
glyphs change.

### Adding a new report

1. Add a row to `reportRegistry` in `registry.mjs`.
2. Optionally declare `totalsColumns: ['value_rial', ...]` and/or
   `reconcileColumn: { column: 'running_balance', label: '...' }`.
3. Optionally override per-column types via `column.type` (otherwise
   the legacy key heuristic decides).

Nothing else changes. The template handles styling.

---

## Local development

```bash
cd services/export-api
cp .env.example .env
# edit .env: fill SUPABASE_URL + SUPABASE_ANON_KEY
npm install
npm run dev        # node --watch server.mjs
```

The server binds to `:3000`. CORS allows localhost origins by default.

To smoke-test against a running server with a logged-in JWT:

```bash
TEST_JWT=eyJhbG... npm run test:smoke
```

This calls `POST /api/export/RPT_INVENTORY_VALUATION_SUMMARY`, validates
the response is an .xlsx blob (ZIP magic + size threshold), and writes it
to `./smoke-output.xlsx`. Override the report via `SMOKE_REPORT`:

```bash
SMOKE_REPORT=RPT_PARETO_CLASSIFICATION TEST_JWT=... npm run test:smoke
```

To run the **Excel Design System** self-test (pure-Node, no network,
no Supabase):

```bash
npm run test:template                      # asserts every invariant
OUTPUT=/tmp/xlsx-blobs npm run test:template # also writes sample .xlsx files
```

`template-test.mjs` reloads every workbook through ExcelJS and asserts:
no XML repair warnings, sheet count, headline copy, frozen pane + RTL,
autoFilter, SUM totals, reconciliation formula, ABC + dataBar CF rules,
and (when `opts.dashboard = true`) the Dashboard Summary KPI cells.

---

## Environment variables

| Var | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | Same project as the SPA. |
| `SUPABASE_ANON_KEY` | yes | Anon key — *not* the service-role key. Anonymous queries are safe when scoped with the user's JWT. |
| `SUPABASE_SECRET_KEY` | no, reserved for future admin tasks | Not used by the current query path. If you wire export-audit logging, this is where it goes. |
| `ALLOWED_ORIGIN` | recommended | Comma-sep CORS allowlist (e.g. `https://morvarid-farm.onrender.com`). Defaults to dev wildcard when `NODE_ENV != production`. |
| `PORT` | no | Defaults to 3000. Render sets it automatically. |
| `NODE_ENV` | no | Set to `production` on deploy. |

---

## Endpoints

### `GET /health`

Liveness check used by Render. Returns `{ status: 'ok', service: 'export-api' }`.

### `POST /api/export/:reportId`

- Path param: `reportId` — must be one of `RPT_INVENTORY_VALUATION_SUMMARY`,
  `RPT_INVENTORY_LEDGER`, `RPT_CONSUMPTION_ANALYTICS`, `RPT_INVENTORY_AGING`,
  `RPT_PARETO_CLASSIFICATION`.
- Headers: `Authorization: Bearer <jwt>`, `Content-Type: application/json`.
- Body: report-specific filter payload (see `registry.mjs`). Set
  `dashboard: true` to prepend the Dashboard Summary sheet.

Response: binary `.xlsx` blob with header `X-Export-Row-Count`.

Multi-sheet reports (`RPT_CONSUMPTION_ANALYTICS`) ignore the
`dashboard` flag — the two primary sheets are sufficient. The
`lowStock*-related` knobs apply only to `RPT_INVENTORY_VALUATION_SUMMARY`.

Errors:

| Status | Code | When |
|---|---|---|
| 401 | `missing_or_malformed_authorization_header` | No `Bearer` header. |
| 401 | `invalid_or_expired_jwt` | `auth.getUser()` rejected the token. |
| 403 | `account_inactive` | Profile `is_active = false`. |
| 403 | `rbac_denied` | Caller's role not in `allowedRoles` for the report. |
| 404 | `report_not_found` | Unknown `reportId`. |
| 413 | `export_too_large` | `rows.length > reportDef.maxRows`. Request was well-formed — refine filters. |
| 502 | `rpc_call_failed` | Postgres RPC raised. |
| 500 | `xlsx_build_failed` | ExcelJS could not serialize the workbook. |

### Request body knobs

| Field | Type | Effect |
|---|---|---|
| `dashboard` | `boolean` | Three-state: explicit `true` forces Dashboard Summary sheet; explicit `false` suppresses it; omitted falls back to `reportDef.dashboardByDefault`. |
| `low_stock_threshold` | `number` | Overrides `reportDef.lowStockThreshold` for the soft-warning low-stock cellIs rule. Skipped if omitted. |

### Valuation export — operator's "opening file"

`RPT_INVENTORY_VALUATION_SUMMARY` is the CEO/operator opening file:
current stock at a point in time, presented cleanly. Registry opt-ins:

- `dashboardByDefault: true` — the workbook always opens with the
  Dashboard Summary sheet.
- `totalsColumns: ['on_hand_qty', 'value_rial']` — Totals row + the
  Dashboard's KPI cells pull live `SUM` formulas tying back to the
  data sheet.
- `topN: { column: 'value_rial', n: 10, columns: ['item_name',
  'on_hand_qty', 'unit_cost', 'value_rial'] }` — server pre-sorts
  the rows DESC by `value_rial`; Dashboard renders the top 10 as
  direct formula refs back at the sorted data sheet.
- `lowStockColumn: 'on_hand_qty', lowStockThreshold: 10` — rows
  with `on_hand_qty ≤ threshold` get a soft peach fill on the data
  sheet (warning highlight). Operator override via
  `body.low_stock_threshold`.

### Consumption analytics export — multi-sheet pivot + formula analysis

`RPT_CONSUMPTION_ANALYTICS` is the only multi-sheet report — registry
declares `kind: 'multi-sheet'` so `server.mjs` dispatches to
`buildMultiReportWorkbook` instead of `buildReportWorkbook`. Two
sheets in Excel display order:

| Sheet | Purpose |
|---|---|
| **مصرف (خام)** | Pure pivot-ready normalized rows. **No title row, no parameters band, zero merged cells** anywhere — row 1 is exactly the column header so Ctrl+A → Insert PivotTable works without manual range selection. |
| **تحلیل** | Title bar + rectangular SUMIFS blocks keyed by `item_category` (the single axis shared across every `p_group_by` branch — `day`/`item`/`hall`/`formula`). Adds derived `waste_ratio` + `variance_flag` columns. Cross-sheet parity row surfaces `OK` / `⚠ عدم تطابق` so operators see online-vs-analysis drift instantly. |

#### Online-totals parity

`buildMultiReportWorkbook` writes a `کنترل برابری (تحلیل ↔ خام)` row
whose `consumed_sum`/`waste_sum`/`total_sum` cells each contain
`=IF(<analysis-totals>=SUM(<raw-sheet-range>), "OK", "⚠ عدم تطابق")`.
If anything in the analysis block disagrees with the raw sheet sums,
the operator sees the mismatch as soon as Excel opens.

#### Variance flag semantics

`reportDef.varianceThreshold` (default `0.15`) is the per-row soft cap.
On the analysis sheet:

- `waste_sum / total_sum` rendered as `percent` number format.
- `variance_flag` column renders `⚠ ` when `waste_ratio > threshold`,
  `OK` otherwise — no formulas reference external state, the test of
  the model is purely row-local.
- The totals row's `variance_flag` cell uses
  `COUNTIF(... , ">"&threshold) > 0 ? "⚠ " : "OK"` so the overall
  verdict is visible without scrolling.

---

## RBAC matrix

| Report | admin | supervisor | operator |
|---|---|---|---|
| `RPT_INVENTORY_VALUATION_SUMMARY` | ✅ | ✅ | ❌ |
| `RPT_INVENTORY_LEDGER` | ✅ | ✅ | ✅ |
| `RPT_CONSUMPTION_ANALYTICS` | ✅ | ✅ | ✅ |
| `RPT_INVENTORY_AGING` | ✅ | ✅ | ❌ |
| `RPT_PARETO_CLASSIFICATION` | ✅ | ✅ | ❌ |

Operators see only operational reports (ledger + consumption). Financial /
scoring reports are restricted to admin + supervisor.

---

## Render deploy

`render.yaml` at the repo root declares the Web Service. Render builds via
`services/export-api` directory, runs `npm start`. Set the env vars above
in the Render dashboard (do **not** commit secrets). The SPA itself is
the existing static site. CORS anchor the SPA origin so cookies and Bearer
headers can ride along.

---

## Local-only checks

- `node --check server.mjs` — server syntax sanity.
- `node --check registry.mjs` — registry syntax sanity.
- `node --check smoke-test.mjs` — smoke-test syntax sanity.
- `node --check xlsx-template.mjs` — template module syntax sanity.
- `node --check template-test.mjs` — self-test syntax sanity.
- `node template-test.mjs` — runtime self-test (pure-Node, no Supabase).

## Test harnesses

Three test scripts live alongside the Excel Design System. Two are
pure Node (no Supabase creds) and run on every PR; one is
env-gated and runs on protected branches where DB secrets are
configured.

| Script | Env | Purpose | Run command |
|---|---|---|---|
| `template-test.mjs` | none | Validates every shipped `.xlsx` is correctly formed (no XML repair warnings, sheet count, header copy, freeze pane, RTL, autofilter, SUM totals, reconciliation, ABC + dataBar CF, dashboard KPI cells, multi-sheet pivot-readiness, parity row). **235+ assertions.** | `npm run test:template` |
| `contracts-test.mjs` | none | Static validator over `reportRegistry`: each entry's columns (unique keys + headers + valid types), `allowedRoles`, `mapFilters`, opt-in field coherence (`totalsColumns`, `reconcileColumn`, `lowStockColumn`, `lowBalanceColumn`, `topN`, `parametersOrder`, `kind:multi-sheet` fields). **Runs in CI on every PR.** | `npm run test:contracts` |
| `reconciliation-test.mjs` | `SUPABASE_TEST_URL` + `SUPABASE_TEST_JWT` | Exercises the DB self-consistency invariants: (1) `balance_as_of(end) − balance_as_of(start) ≡ Σ(qty_in − qty_out)` over a 28-day window, per `(farm_id, item_id)` tuple; (2) `consumption_summary(group_by='item')` totals match `consumption_summary(group_by='day')` totals. Skips with exit 0 when env is absent so PRs without secrets don't fail. | `npm run test:reconciliation` |
| `perf-budget.mjs` | `SUPABASE_TEST_URL` + `SUPABASE_TEST_JWT` | Per-RPC p50/p95/p99 measurement (1 warm-up + 5 timed calls each). Asserts `p95 ≤ budget` per report: valuation 2s, ledger 8s, consumption 3s, aging 2s, pareto 2s. Failures print the offending RPC + measured p95. Skips when env is absent. | `npm run test:perf` |

`npm run test:all` chains `test:contracts + test:template`.

Reconciliation + perf-budget gate semantics:
- **Without** `SUPABASE_TEST_URL` + `SUPABASE_TEST_JWT` in the
  environment, both scripts print `[skipped]` and exit 0. PRs without
  secrets don't fail CI; protected branches with secrets run them
  for real.
- **With** env set, RPC failures / invariant violations exit 1 with
  a readable label per failure (tuple under audit, expected vs.
  actual, which RPC breached its budget).

Reading a reconciliation failure: each label includes the offending
`(farm=…, item=…)` tuple, the window dates, and the
`Σ(in − out)` vs `end − start` numeric diff so the audit log is
traceable. CI logs render the labels in red; the operator's
remediation is usually a `reporting_*` RPC regression in a recent
migration.

### Adding a perfBudget for a new report

Inside `registry.mjs`, attach `perfBudget: { p95Ms: <ms> }` to the
entry. `perf-budget.mjs` reads it via `reportDef.perfBudget?.p95Ms`
when present; otherwise the benchmark runs but only reports the
numbers (no assertion). Keep budgets conservative — add a 30%
buffer over the measured baseline so the budget doesn't fail on
benign Postgres plan-cache hiccups.
