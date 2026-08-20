# Plan 009: Write the decision briefs for the four open product-direction calls

> **Executor instructions**: Follow this plan step by step. This plan produces
> a DOCUMENT, not code — you will read source files and write one markdown
> file. Do not modify any source file. If anything in the "STOP conditions"
> section occurs, stop and report. Your reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f3395fe..HEAD -- src/components/reports/SalesTransfersSection.tsx src/hooks/useOfflineSync.ts src/lib/offlineStorage.ts scripts/migrations/020_reporting_sales_transfers_scope.sql`
> Cosmetic drift in SalesTransfersSection (report-section refactor) is
> expected; the header comment block (lines 1-10) is what matters. If the
> header comment is gone: STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (DIRECTION-01, -04, -05/06 spike halves)
- **Planned at**: commit `f3395fe`, 2026-07-20

## Why this matters

Four direction findings need a maintainer decision before any code should be
written: the sales entry screen (whose downstream report/RPC/export pipeline
already ships), the fate of the fully-built-but-unwired offline stack, Excel
import for opening balances, and the production-tracking domain gap. Writing
the options down — with repo evidence, costs, and a recommendation each —
turns "someday" ambiguity into four answerable questions. Per the audit
playbook, direction plans are design/spike plans: strategy belongs to the
maintainer; this document is the advisor's grounded options.

## Current state (evidence to cite in the briefs — verify each while writing)

1. **Sales entry** — `src/components/reports/SalesTransfersSection.tsx:4-10`
   states verbatim that the `sale` txn_type doesn't exist and the entry screen
   is "a Phase-2 product feature that hasn't landed";
   `scripts/migrations/020_reporting_sales_transfers_scope.sql` already
   includes `'sale'` in the report's universe with `customer_name` stubbed
   NULL; `src/types/inventory.types.ts:3-10` TxnType lacks `'sale'`;
   AGENTS.md RULE 3 note: "`sale` is not a current enum value — see RULE 4."
   The suppliers table/page is the template for a customers side.
2. **Offline stack** — `src/lib/offlineStorage.ts`, `src/hooks/useOfflineSync.ts`,
   zero importers; `vite-plugin-pwa` in `package.json:42` but absent from
   `vite.config.ts`; README claims PWA/offline. The queued-change shape in
   `offlineStorage.ts` predates the current voucher RPCs — check whether its
   payload matches `save_daily_sheet`'s contract and record the answer.
3. **Excel import** — `services/export-api/` exports ~9 report types; no
   import path exists anywhere; opening balances are keyed one item at a time
   (`InitialStockInput`, `src/types/inventory.types.ts:66-71`); AGENTS.md
   RULE 1 (no fabricated data) raises the validation bar; ledger columns
   `source_type`/`source_id` (`src/types/inventory.types.ts:23-24`) can tag
   an import batch for reversibility.
4. **Production tracking** — CLAUDE.md names "Production tracking" and
   "Accounting" as domains; grep `src/` for production/egg/تولید feature code
   → nothing; `farm_halls` exists and daily sheets are per-hall, so a
   `daily_production` entity would slot into established patterns.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Evidence greps | `grep -rn "useOfflineSync" src/` etc. | as described above |

No build/typecheck needed — this plan writes documentation only.

## Scope

**In scope**:
- `docs/direction/decision-briefs.md` (create; create the directory)

**Out of scope**:
- ANY source, config, or migration change.
- Deleting the offline modules (that's a decision the brief argues, not takes).

## Git workflow

- Shared advisor branch; one commit, e.g.
  `docs(direction): decision briefs for sales, offline, import, production`.
- No dist rebuild (no src change). Do NOT push.

## Steps

### Step 1: Verify the evidence

Open each file listed in "Current state" and confirm the claims. For the
offline stack, additionally answer: does `offlineStorage`'s queued payload
shape match any current RPC contract? (Read `src/hooks/useOfflineSync.ts`
fully; note the RPC it calls and whether that RPC exists in
`scripts/migrations/`.)

**Verify**: you can quote each file:line in the briefs.

### Step 2: Write `docs/direction/decision-briefs.md`

Structure — for EACH of the four decisions:

- **Question** (one sentence the maintainer can answer with a word).
- **Evidence** (file:line quotes from Step 1).
- **Option A / Option B (/ C)** with: what it costs (coarse S/M/L), what it
  risks, what it unlocks.
- **Recommendation** with one paragraph of reasoning.
- **Prerequisites** — name blocking work honestly (e.g. both sales entry and
  Excel import write to the ledger, so they inherit any open write-path
  hardening work; the offline queue must not be wired before write
  idempotency exists).

Recommendations to argue (advisor's positions — the executor writes them out,
the maintainer decides):

1. Sales entry: **build it** as the next feature-sized investment — decide
   customer modeling first (recommend: `customers` table mirroring
   `suppliers`); sequence AFTER write-path hardening.
2. Offline stack: **decide now, default delete** — an honest online-only app
   beats a fake offline one; re-introduce later behind idempotency keys if
   field demand proves out. Correct the README's PWA claims in the same PR.
3. Excel import: **defer, then scope to initial-stock only** with dry-run
   preview and batch tagging via `source_type='excel_import'`.
4. Production tracking: **ask the maintainer** whether the CLAUDE.md domain
   list is roadmap or aspiration; if roadmap, spike a `daily_production`
   table mirroring `daily_vouchers`. Do not scope further from this evidence.

Write in English with Persian terms where they name UI surfaces (matching
docs/ conventions — see `docs/audit-handoff.md` for tone).

**Verify**: the file exists, contains four briefs, each with Question /
Evidence / Options / Recommendation / Prerequisites.

### Step 3: Commit

One commit; only the new doc file.

**Verify**: `git show --stat HEAD` → exactly `docs/direction/decision-briefs.md`.

## Test plan

Not applicable (documentation). The review gate is the reviewer reading the
briefs against the evidence.

## Done criteria

- [ ] `docs/direction/decision-briefs.md` exists with all four briefs
- [ ] Every claim carries a file:line the reviewer can open
- [ ] The offline brief answers the payload-vs-RPC-contract question with
      evidence, not speculation
- [ ] No file outside `docs/direction/` was created or modified

## STOP conditions

- The SalesTransfersSection header comment or the offline modules are gone
  (something landed since the audit — the briefs would be stale on arrival).
- Any brief would require asserting a fact you could not verify in the repo.

## Maintenance notes

- Each brief, once decided, becomes the seed of its own implementation plan
  (a future `/improve plan <description>` invocation).
- The briefs deliberately do NOT restate open backend work beyond naming it a
  prerequisite class — sequencing detail lives with those items' own tracking.
