# scripts/qa — Step A migration verification tooling

Verification harness for the offline-sync database migration
(`scripts/migrations/008_offline_sync.sql`). This is **verification tooling only** —
it never runs against the live database; all mutations happen on a disposable
local PostgreSQL copy.

## Files

- **`mig008-verify.mjs`** — the 15-check verification harness. Boots a disposable
  embedded PostgreSQL, applies migrations `001_schema` … `007_input_name_normalization`,
  loads a local copy of production data, applies `008_offline_sync.sql`, then runs a
  battery of checks covering: text PKs, `_modified`/`_deleted` columns + backfill,
  row-count preservation, FK integrity after the type casts, realtime publication
  membership, `_modified` triggers, UNIQUE enforcement, auto-generated text ids,
  the soft-delete revert path, and the `_deleted = false` filters in the two
  server-side readers (`rpc_initial_stock_exists`, `rpc_supplier_usage_count`).
  Exits 0 only when all 15 checks pass.
- **`prod-dump.mjs`** — READ-ONLY pull of production data via the Supabase
  Management API SQL endpoint (SELECT queries only). Writes the local SQL dump
  consumed by `mig008-verify.mjs`. Requires a `supabase-access-token` (or
  `SUPABASE_ACCESS_TOKEN`) in `.env`. The dump output is git-ignored — it is a
  copy of real production data and must never be committed.

## How to re-run

```bash
# 1. (one-time) regenerate the production data copy — read-only against prod
node scripts/qa/prod-dump.mjs

# 2. run the full verification battery (boots embedded postgres on port 5555)
node scripts/qa/mig008-verify.mjs
```

Prerequisites: `embedded-postgres` and `pg` — install with
`npm i -D embedded-postgres pg` if not already present. `embedded-postgres`
downloads native PostgreSQL binaries on first boot; the harness forces the `C`
locale + UTF-8 so `initdb` succeeds on Windows with a Persian locale.

## Safety notes

- `prod-dump.mjs` issues only `SELECT`/`COPY` queries against production — no writes.
- `mig008-verify.mjs` applies migrations and mutates data **only** inside the
  disposable `.qa-pgdata` instance it creates and tears down.
- Outputs to never commit: `.qa-pgdata/`, `_qa-prod-data.sql` (see `.gitignore`).
