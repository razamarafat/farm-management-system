# Decision briefs — four product-direction calls

Context: Morvarid Farm at commit `a9257dd`, branch `advisor/009-direction-decision-briefs`.
Each brief states one question, the verified evidence (every claim carries a
`file:line` you can quote), the options with coarse cost (S/M/L), one
recommendation, and honest prerequisites. Language: English with Persian UI
terms. Tone note: the referenced tone model `docs/audit-handoff.md` does not
exist at this commit (verified: `docs/` contains only `agent-sync.txt`,
`deploy/`, `reports/`, `security/`, `supabase/`), so this doc uses plain
technical English instead.

Cross-cutting facts used by several briefs:

- `package.json:42` is `"rxdb": "^17.4.0"` — NOT `vite-plugin-pwa`. The string
  `vite-plugin-pwa` occurs zero times in `package.json` and zero times in
  `vite.config.ts` (verified by content search; the only singlefile plugin is
  `vite-plugin-singlefile` at `package.json:63`). The README still claims
  PWA/offline (`README.md:48-49`, `README.md:651`, `README.md:702`), and
  `CLAUDE.md:19` still lists PWA in the technology stack. The PWA claim is
  therefore false, and more strongly false than "plugin present but unwired":
  the plugin was never added.
- `scripts/migrations/` contains `001_schema.sql` … `009_offline_cache_tables.sql`
  plus `archive/` — there is NO `020_reporting_sales_transfers_scope.sql` at
  this commit, so no brief below cites it. The sales/transfers scope evidence
  comes from `services/export-api/registry.mjs:131-156` instead.
- `AGENTS.md` does not exist at this commit (verified: `Test-Path AGENTS.md`
  is False in the worktree). No brief cites it; the ledger rules it would
  contain are evidenced directly from the schema and types.

---

## Brief 1 — Sales entry (گزارش فروش و انتقال بین انبارها)

**Question:** Should we build a sales-entry screen now, and if so, what must be
decided first?

**Evidence:**

- The report section is explicit that the sale type does not exist:
  `src/components/reports/SalesTransfersSection.tsx:4-10` — "the 'sale'
  txn_type DOES NOT EXIST in inventory_transactions today — the sales entry
  screen is a Phase-2 product feature that hasn't landed", with an honest
  in-table banner when zero sale rows return.
- The ledger type union has no sale:
  `src/types/inventory.types.ts:3-10` (`TransactionType` =
  `initial | purchase | consumption | waste | transfer_in | transfer_out |
  adjustment`) and the Persian labels at `src/types/inventory.types.ts:98-106`
  likewise have no فروش entry.
- The export layer already accepts a value the ledger can never produce:
  `services/export-api/registry.mjs:131-136` documents the gap, and
  `services/export-api/registry.mjs:150-155` maps `p_txn_type` from
  `['sale', 'transfer_in', 'transfer_out']` — so a `sale` filter is accepted
  and silently returns zero rows until an entry screen exists.
- The UI type anticipates the future row shape anyway:
  `src/components/reports/SalesTransfersSection.tsx:37` (`TransferRow.txn_type`
  includes `'sale'`) with a فروش badge at
  `src/components/reports/SalesTransfersSection.tsx:52` — display is ready,
  writes are not.
- Customer modeling has no home: `supabase/migrations/001_schema.sql:151`
  creates `public.suppliers`, and the full table list
  (`supabase/migrations/001_schema.sql:15-160`) contains no `customers` table;
  content search over `src/types/*.ts` finds Supplier interfaces
  (`src/types/supplier.types.ts:1,10,15`) and zero Customer interfaces. The
  report row carries `customer_name`
  (`src/components/reports/SalesTransfersSection.tsx:40`) with nothing to
  join it to. `suppliers` is the only available template for a counterparty
  model.

**Options:**

- A — Add `sale` to the enum + minimal entry screen writing `transfer_out`-style
  ledger rows with `unit_price`/`total_price` and a free-text customer field.
  Cost S. Risks: free-text customers corrupt aggregates and the فروش report;
  enum change touches every switch over `TransactionType`; repeats the
  fabricated-data class of incident (placeholder counterparties baked into
  real reports). Unlocks: فروش rows appear in the existing report with no
  further work.
- B — Add `sale` to the enum + a `customers` table mirroring `suppliers`
  (same columns, RLS, and hooks shape) + entry screen referencing it.
  Cost M. Risks: larger review surface; customer deduplication/naming rules
  need a maintainer call. Unlocks: a real counterparty dimension for sales,
  future receivables, and per-customer reporting.
- C — Keep sales out of the ledger; record sales elsewhere (documents only).
  Cost S now, L later. Risks: splits truth across two stores; the
  `RPT_SALES_TRANSFERS` report stays half-empty indefinitely. Unlocks: nothing
  except avoiding the decision.

**Recommendation:** Build Option B as the next feature-sized piece of work,
not now: decide customer modeling first (a `customers` table mirroring
`suppliers` is the recommended shape because the codebase already proves that
shape works for counterparties), then add the `sale` enum value and the entry
screen together so the report filter at `registry.mjs:150-155` starts matching
real rows the day the feature lands.

**Prerequisites (blockers, stated honestly):** Sales writes go to the
`inventory_transactions` ledger, so this inherits the write-path hardening
line: atomic RPC with server-side stock enforcement and row locking on the
pattern of `submit_daily_voucher`
(`src/hooks/useDailySheet.ts:510-527`), plus the 24h edit-window discipline
the voucher flow already implements. Do not ship sales entry on a weaker
write path than consumption already has. The `sale` enum addition must update
`TXN_TYPE_LABELS`/`TXN_TYPE_COLORS`
(`src/types/inventory.types.ts:98-116`), every exhaustive switch, and the
`reporting_sales_transfers_v3` implementation together — partial landings
recreate today's silent-zero-rows state.

---

## Brief 2 — Offline stack: delete or finish? (همگام‌سازی آفلاین)

**Question:** The offline write queue exists but is unwired — do we finish it
or delete it and admit the app is online-only?

**Evidence:**

- Both modules are present at this commit:
  `src/lib/offlineStorage.ts` (229 lines; queue record shape
  `voucherId/lines/type` at `src/lib/offlineStorage.ts:10-17`, written at
  `src/lib/offlineStorage.ts:78-85`) and `src/hooks/useOfflineSync.ts`
  (160 lines; `queueChange` at `src/hooks/useOfflineSync.ts:70-77`).
- Zero external importers: content search for `useOfflineSync|offlineStorage`
  across `src/**/*.ts(x)` returns only the definition at
  `src/hooks/useOfflineSync.ts:26` and the self-import at
  `src/hooks/useOfflineSync.ts:12`. Nothing ever calls `queueChange`; the
  QUEUE side (writes) is dead code. The read facade IS wired:
  `src/hooks/useDailySheet.ts:5-14` and `src/hooks/useInventory.ts:5` import
  from `@/lib/offline/reads`, with the RxDB-when-offline contract stated at
  `src/hooks/useInventory.ts:33-36`; the read functions themselves are
  `src/lib/offline/reads.ts:27-207` (including `readFarmHalls` at :176).
- Payload-vs-RPC-contract answer: the queue replays against the LEGACY
  contract. `src/hooks/useOfflineSync.ts:93-98` calls
  `supabase.rpc('save_daily_sheet', { p_voucher_id, p_lines })`, matching the
  legacy signature still declared at
  `src/types/database.types.ts:487-493`. The live flow moved on:
  `src/hooks/useDailySheet.ts:521-527` calls
  `supabase.rpc('submit_daily_voucher', { p_voucher_id, p_farm_id,
  p_voucher_date, p_items, p_ignore_window })` (signature at
  `src/types/database.types.ts:494-503`), a different name AND a different
  payload (`p_lines` vs `p_items`, missing farm/date/window fields), with
  server-side stock enforcement and row locking built for the new shape
  (`src/hooks/useDailySheet.ts:510-512`). A queued payload replayed today
  would hit a stale RPC with a stale shape, bypassing the stock checks the
  live path enforces. Additionally, `submit`-type queue entries are silently
  dropped by design (`src/hooks/useOfflineSync.ts:115-119` — "ثبت نهایی حواله
  نیاز به اتصال اینترنت دارد"), so the queue cannot complete the one write
  that matters.
- The offline story told to users is false: `README.md:48-49` claims
  "PWA-ready (`vite-plugin-pwa` + custom manifest)" and "suitable for offline
  / static hosting"; `README.md:651` claims the service worker registers at
  build time; `README.md:702` documents PWA install behavior — while
  `vite-plugin-pwa` is in neither `package.json` nor `vite.config.ts`
  (see cross-cutting facts above). Keeping dead queue code next to these
  claims lets the next reader believe offline works.

**Options:**

- A — DELETE the write queue (`useOfflineSync.ts`, `offlineStorage.ts`) and
  correct the README PWA/offline claims in the same PR; keep the RxDB read
  facade, which is wired and harmless. Cost S. Risks: re-introduction cost
  later if demand appears; IndexedDB schema cleanup for any client that
  cached the `morvarid_farm_offline` DB. Unlocks: an honest online-only
  posture; no fake-offline liability.
- B — Finish the queue against the CURRENT contract (replay through
  `submit_daily_voucher` with idempotency keys, conflict UI for locked
  vouchers, retry discipline). Cost L. Risks: distributed-write semantics
  (double-submit across reconnect, lock races with the 24h window) are the
  hardest code in this codebase to get right; large test burden. Unlocks:
  genuine offline voucher capture for low-connectivity farms.
- C — Leave the code as-is, unwired. Cost zero now, unbounded later. Risks:
  bit-rot against every RPC change (already bitten once: the queue still
  targets the legacy RPC); false confidence from its mere presence. Unlocks:
  nothing.

**Recommendation:** Decide NOW, default DELETE (Option A). An honest
online-only app beats a fake-offline one: the queue is dead code against a
stale contract, its flagship operation is undeliverable by construction, and
the README claims around it are factually false. Delete the two write-queue
modules, fix the three README claims (`README.md:48-49`, `:651`, `:702`) and
the `CLAUDE.md:19` technology entry in the same PR, keep `src/lib/offline/reads.ts`
and its two wired consumers. Re-introduce queued writes only behind
idempotency keys and only on proven farm-connectivity demand — never by
resurrecting the `save_daily_sheet` replay path.

**Prerequisites (blockers, stated honestly):** The offline queue must NOT be
wired to any submit path before write idempotency exists: duplicate delivery
across reconnect would double-post consumption against the ledger, and the
lock/window errors (`VOUCHER_LOCKED`, handled at
`src/hooks/useOfflineSync.ts:100-106` for the legacy call) need a designed
conflict UX against the current RPC's error codes, not a toast-and-drop.
Until then, deletion is the safe state.

---

## Brief 3 — Excel import (ورود اکسل موجودی اولیه)

**Question:** Should we build Excel import, and if so, scoped to what?

**Evidence:**

- There is no import path anywhere: content search for
  `xlsx|XLSX|parse-excel|sheetjs|exceljs|workbook-read|parseExcel` over
  `src/**` and `services/**` returns only export-direction hits — the
  server-side `.xlsx` generator (`services/export-api/server.mjs:30`,
  `xlsx-template.mjs:50`), its tests, and the SPA download trigger
  (`src/lib/excelServer.ts:81`, `src/pages/SuppliersPage.tsx:44-48`,
  `src/pages/InventoryItemHistoryPage.tsx:64`). ExcelJS lives in
  `services/export-api/package.json:24` (generation only). No parser, no
  upload-and-ingest flow, no template endpoint exists.
- The natural first target is single-item shaped:
  `src/types/inventory.types.ts:66-71` defines `InitialStockInput` as ONE
  `{ item_id, quantity, txn_date, notes? }` — there is no batch input type, so
  any multi-row import must loop single writes or add a batch RPC.
- The ledger already has the columns an import needs for traceability:
  `src/types/inventory.types.ts:23-24` (`source_type`, `source_id` on
  `InventoryTransaction`), so imported rows can be batch-tagged without a
  schema change.

**Options:**

- A — Full import (initial stock + purchases + adjustments) with column
  mapping UI. Cost L. Risks: mapping ambiguity (item-name matching across
  Persian labels), partial-failure semantics, duplicate-import detection —
  the most validation surface of any option. Unlocks: fastest onboarding for
  farms with existing spreadsheets.
- B — Initial-stock ONLY: upload → dry-run preview (row-by-row validity,
  unknown items, duplicates) → confirm → write with
  `source_type='excel_import'` and a shared `source_id` batch tag per file.
  Cost M. Risks: narrower value; still needs the preview screen and a
  duplicate-file guard. Unlocks: safe one-shot farm onboarding; every
  imported row is attributable via the existing `source_type`/`source_id`
  columns.
- C — No import; manual entry only. Cost zero. Risks: slow onboarding for
  large catalogs; operator transcription errors at scale. Unlocks: nothing.

**Recommendation:** DEFER, then scope to Option B only. Import is onboarding
acceleration, not a missing core flow — the manual paths all exist — so it
waits behind sales and the offline decision. When scheduled, initial-stock
only: it is the one import whose rows never collide with live transactional
history the way purchase/consumption imports would, and the dry-run preview
is non-negotiable (unknown-item and duplicate detection before a single
ledger write). Tag every row `source_type='excel_import'` with one
`source_id` per uploaded file so the batch is auditable and reversible in
reporting.

**Prerequisites (blockers, stated honestly):** Like sales, import writes to
the ledger and inherits the write-path hardening line — batch writes need
the same atomicity/stock discipline as single writes (all-or-nothing per
file, or explicit per-row error accounting; never silent partial posting).
Duplicate-upload protection (file hash → `source_id` uniqueness check) must
land with the feature, not after the first double-import incident.

---

## Brief 4 — Production tracking (ثبت تولید) — domain gap

**Question:** CLAUDE.md promises production tracking, but no such feature
exists — is it roadmap or aspiration?

**Evidence:**

- The promise: `CLAUDE.md:5-11` lists "Accounting" and "Production tracking"
  among the main business domains.
- The absence: content search for `daily_production|egg|تخم|مرغ|گله|production`
  over `src/**` returns only incidental hits — a carriage comment in
  `src/hooks/useUsers.ts:7`, a generation comment in
  `src/lib/excelServer.ts:143`, and the word "production" meaning production
  environment in `src/lib/supabase-admin.ts:13`. Zero production/egg/flock
  feature code: no types, no pages, no hooks, no RPC calls.
- The schema has no production entity either: the table list in
  `supabase/migrations/001_schema.sql:15-160` (`daily_vouchers`,
  `daily_voucher_lines`, `farm_feed_formulas`, `farm_halls`, `farm_items`,
  `farms`, `inputs`, `inventory_transactions`, `profiles`, `suppliers`,
  `user_activity_logs`) contains nothing for eggs, birds, or flocks.
- The natural slot exists: per-hall operation is already modeled —
  `farm_halls` table (`supabase/migrations/001_schema.sql:67`), `readFarmHalls`
  in the offline facade (`src/lib/offline/reads.ts:176`), hall configs in the
  daily sheet (`src/hooks/useDailySheet.ts:50`), and the per-hall sheet flow
  the operator already uses. A future `daily_production` entity keyed by
  `(farm_id, hall_id, date)` would mirror `daily_vouchers` the way
  `daily_voucher_lines` hangs off its voucher.

**Options:**

- A — Confirm as roadmap: spike a `daily_production` entity mirroring
  `daily_vouchers` (per-hall, per-day, same edit-window and submit discipline),
  then scope metrics (egg count, weight, mortality, feed conversion) with the
  maintainer. Cost M for the spike, L for the full domain. Risks: a second
  ledger-adjacent write path with its own reconciliation rules; scope creep
  into full flock management. Unlocks: the poultry-specific half of the
  product; per-hall production reporting.
- B — Declare aspiration and remove "Production tracking" (and the
  unimplemented "Accounting", same evidence class) from `CLAUDE.md:5-11`
  until resourced. Cost S. Risks: narrows the product story. Unlocks:
  documentation honesty; no phantom roadmap.
- C — Scope the full domain now (flock lifecycle, mortality, egg grading,
  feed conversion). Cost L+. Risks: designing without maintainer input on
  the metrics that actually matter to this farm; large unverified surface.
  Unlocks: nothing early.

**Recommendation:** ASK the maintainer: roadmap or aspiration — do not scope
further without that answer. If roadmap, the spike is a `daily_production`
table mirroring `daily_vouchers` on the `(farm_id, hall_id, date)` grain with
the same submit/window discipline, and nothing more until the maintainer
names the production metrics. If aspiration, remove the line from CLAUDE.md
and close the gap by deletion, same honesty rule as the offline brief.

**Prerequisites (blockers, stated honestly):** A production entity needs the
maintainer's metric list (what is counted daily: eggs, weight, mortality,
culls?) before any schema is drawn — guessing metrics bakes wrong grain into
the table. If it writes anything that touches stock (e.g. feed consumed per
production record), it inherits the write-path hardening line like sales and
import. Per-hall sheets are the integration point, so `farm_halls`
membership/RLS must cover the new entity from day one.
