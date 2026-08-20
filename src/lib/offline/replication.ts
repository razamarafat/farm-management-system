/**
 * Supabase ↔ RxDB replication wiring (Step B).
 *
 * Uses the official RxDB Supabase Replication Plugin (`replicateSupabase`).
 *
 * Enrollment (per the approved architecture):
 *   - Replicated (offline write + read): daily_vouchers, daily_voucher_lines,
 *     inventory_transactions  -> pull + push, live.
 *   - Pull-only cache (offline read): farm_items, farm_halls,
 *     farm_feed_formulas, farm_formula_items -> pull only.
 *
 * Server-side 24h retention window (filtered server-side, NOT pulled-then-
 * trimmed): drafts are kept regardless of age; everything else is limited to
 * the last 24h. Implemented via `pull.queryBuilder`. Note: PostgREST's `or`
 * does NOT accept embedded-resource dotted paths (PGRST100), so the
 * daily_voucher_lines window is expressed with an embedded-resource filter
 * (see its queryBuilder below) rather than an `or()` across the join.
 *
 * Conflict resolution: server/online always wins (the plugin's default).
 *
 * The 4 cached tables require migration 009 (text PKs + _modified + _deleted)
 * — applied and verified (see scripts/qa/mig009-verify.mjs).
 */
import type { RxDatabase, RxCollection } from 'rxdb';
import { replicateSupabase } from 'rxdb/plugins/replication-supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Yesterday's date as YYYY-MM-DD — the start of the 24h retention window. */
function windowStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Map Supabase `null` -> undefined: RxDB rejects null for optional fields. */
function stripNulls<T extends Record<string, unknown>>(doc: T): T {
  for (const k of Object.keys(doc)) {
    if (doc[k] === null) delete doc[k];
  }
  return doc;
}

/**
 * stripNulls + drop the embedded to-one object. PostgREST requires the joined
 * resource to be present in `select` before it will apply an embedded-resource
 * filter, so the response carries a nested `daily_vouchers` object that must
 * not be written into the RxDB document.
 */
function stripVoucherEmbed<T extends Record<string, unknown>>(doc: T): T {
  const out = stripNulls(doc);
  delete (out as Record<string, unknown>).daily_vouchers;
  return out;
}

interface ReplicateTableOptions {
  tableName: string;
  collection: RxCollection;
  replicationIdentifier: string;
  /** pull-only cache (no push) */
  pullOnly?: boolean;
  /** extra server-side filter applied via queryBuilder */
  queryBuilder?: NonNullable<Parameters<typeof replicateSupabase>[0]['pull']>['queryBuilder'];
  /** per-row pull transform; defaults to stripNulls */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modifier?: (docData: any) => any;
}

function replicateTable(client: SupabaseClient, opts: ReplicateTableOptions) {
  const pull = {
    batchSize: 50,
    modifier: opts.modifier ?? stripNulls,
    ...(opts.queryBuilder ? { queryBuilder: opts.queryBuilder } : {}),
  };
  const state = replicateSupabase({
    tableName: opts.tableName,
    client,
    collection: opts.collection,
    replicationIdentifier: opts.replicationIdentifier,
    live: true,
    pull,
    ...(opts.pullOnly ? {} : { push: { batchSize: 50 } }),
  });
  // Log replication errors without crashing the app.
  state.error$.subscribe((err) => {
    console.error(`[offline] replication error (${opts.tableName})`, err);
  });
  return state;
}

/**
 * Start replication for every offline collection. Resilient: a table whose
 * server schema is not yet ready (e.g. cached tables before migration 009)
 * logs and is skipped rather than breaking the whole offline layer.
 */
export function startOfflineReplication(db: RxDatabase, client: SupabaseClient): void {
  // --- replicated (offline write) ---
  replicateTable(client, {
    tableName: 'daily_vouchers',
    collection: db.daily_vouchers,
    replicationIdentifier: 'daily_vouchers-supabase',
    queryBuilder: ({ query }) =>
      // drafts kept regardless of age; non-drafts only within the 24h window
      query.or(`status.eq.draft,voucher_date.gte.${windowStartDate()}`),
  });
  replicateTable(client, {
    tableName: 'daily_voucher_lines',
    collection: db.daily_voucher_lines,
    replicationIdentifier: 'daily_voucher_lines-supabase',
    modifier: stripVoucherEmbed,
    // PostgREST's `or`/`and` logical operators do NOT accept embedded-resource
    // dotted paths (PGRST100), so "draft OR within-window" cannot be expressed
    // as one `or()` across the join. Filter by the parent voucher's date (24h
    // window) via the embedded-resource filter instead; lines of draft vouchers
    // older than 24h are an accepted gap pending a denormalized
    // voucher_date/status column (migration 010).
    queryBuilder: ({ query }) =>
      query
        .select('*, daily_vouchers!inner(voucher_date,status)')
        .gte('daily_vouchers.voucher_date', windowStartDate()),
  });
  replicateTable(client, {
    tableName: 'inventory_transactions',
    collection: db.inventory_transactions,
    replicationIdentifier: 'inventory_transactions-supabase',
    queryBuilder: ({ query }) =>
      query.or(`txn_date.gte.${windowStartDate()}`),
  });

  // --- pull-only cache (offline read); requires migration 009 ---
  replicateTable(client, {
    tableName: 'farm_items',
    collection: db.farm_items,
    replicationIdentifier: 'farm_items-supabase',
    pullOnly: true,
  });
  replicateTable(client, {
    tableName: 'farm_halls',
    collection: db.farm_halls,
    replicationIdentifier: 'farm_halls-supabase',
    pullOnly: true,
  });
  replicateTable(client, {
    tableName: 'farm_feed_formulas',
    collection: db.farm_feed_formulas,
    replicationIdentifier: 'farm_feed_formulas-supabase',
    pullOnly: true,
  });
  replicateTable(client, {
    tableName: 'farm_formula_items',
    collection: db.farm_formula_items,
    replicationIdentifier: 'farm_formula_items-supabase',
    pullOnly: true,
  });
}
