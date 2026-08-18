#!/usr/bin/env node
/**
 * QA: RxDB <-> Supabase replication round-trip (Step B gate).
 *
 * Verifies the core offline claim against a LOCAL Supabase stack:
 *   1. WRITE — a doc inserted into an RxDB collection is pushed to the
 *      server (visible via PostgREST with server-assigned _modified and
 *      _deleted=false).
 *   2. READ  — a FRESH RxDB instance (no local knowledge of the doc)
 *      pulls it back from the server using the SAME replication config
 *      (24h queryBuilder filter, null-stripping modifier) and the doc is
 *      present locally.
 *   3. CACHED — the 4 pull-only tables (farm_items, farm_halls,
 *      farm_feed_formulas, farm_formula_items; migration 009) are seeded
 *      server-side and pulled into a fresh RxDB instance.
 *   4. CLEANUP — test rows are removed so the local stack stays clean.
 *
 * Storage note: this runs in Node, which has no IndexedDB, so it uses
 * RxDB's memory storage. The storage engine is not under test — the
 * replication protocol (push/pull over PostgREST) is. The schema and
 * replication options below intentionally mirror src/lib/offline/* so
 * this test exercises the exact production configuration.
 *
 * Prerequisites:
 *   - Local Supabase stack running (see scripts/qa/README.md):
 *     `cd .qa-supabase/supabase && npx supabase start`
 *   - Env: SUPABASE_URL (default http://127.0.0.1:52760)
 *          SUPABASE_SERVICE_KEY (service-role JWT of the local stack,
 *          from `npx supabase status -o env`)
 *
 * Run:  SUPABASE_SERVICE_KEY="..." node scripts/qa/replication-roundtrip.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { createRxDatabase, addRxPlugin } from 'rxdb/plugins/core';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { replicateSupabase } from 'rxdb/plugins/replication-supabase';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';

addRxPlugin(RxDBDevModePlugin); // full error messages in this QA script
// dev-mode requires a schema validator on the storage
const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });

const URL = process.env.SUPABASE_URL || 'http://127.0.0.1:52760';
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
if (!KEY) {
  console.error('FAIL: SUPABASE_SERVICE_KEY env var is required (local stack service-role JWT).');
  process.exit(1);
}

// --- mirror of src/lib/offline/schemas.ts ---
// _modified is intentionally NOT declared: the plugin strips it on pull
// and the server owns it on push.
const str = { type: 'string', maxLength: 200 };
const num = { type: 'number' };
const bool = { type: 'boolean' };
const dailyVouchersSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 200 },
    farm_id: str,
    voucher_date: str,
    category: str,
    status: str,
    created_by: str,
    submitted_by: str,
    submitted_at: str,
    locked_at: str,
    reverted_at: str,
    reverted_by: str,
    created_at: str,
    updated_at: str,
    _deleted: bool,
  },
  required: ['id', 'farm_id', 'voucher_date', 'category', 'status', 'created_at', 'updated_at'],
  indexes: ['farm_id', 'voucher_date', 'status'],
};
const farmItemsSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 200 },
    farm_id: str,
    category: str,
    name: str,
    unit: str,
    priority: num,
    reorder_point: num,
    is_active: bool,
    created_at: str,
    updated_at: str,
    manual_unit_price: num,
    _deleted: bool,
  },
  required: ['id', 'farm_id', 'category', 'name', 'unit', 'priority', 'is_active', 'created_at', 'updated_at'],
  indexes: ['farm_id', 'category'],
};
const farmHallsSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 200 },
    farm_id: str,
    hall_number: num,
    name: str,
    is_active: bool,
    created_at: str,
    _deleted: bool,
  },
  required: ['id', 'farm_id', 'hall_number', 'is_active', 'created_at'],
  indexes: ['farm_id'],
};
const farmFeedFormulasSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 200 },
    farm_id: str,
    formula_no: num,
    name: str,
    mixer_weight: num,
    is_active: bool,
    created_at: str,
    updated_at: str,
    _deleted: bool,
  },
  required: ['id', 'farm_id', 'formula_no', 'mixer_weight', 'is_active', 'created_at', 'updated_at'],
  indexes: ['farm_id'],
};
const farmFormulaItemsSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 200 },
    formula_id: str,
    item_id: str,
    qty_per_mixer: num,
    created_at: str,
    _deleted: bool,
  },
  required: ['id', 'formula_id', 'item_id', 'qty_per_mixer', 'created_at'],
  indexes: ['formula_id', 'item_id'],
};

// --- mirror of src/lib/offline/replication.ts ---
function windowStartDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function stripNulls(doc) {
  for (const k of Object.keys(doc)) {
    if (doc[k] === null) delete doc[k];
  }
  return doc;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const client = createClient(URL, KEY);

async function main() {
  const runId = Date.now();
  console.log(`Round-trip run ${runId} against ${URL}`);

  // ---------- seed a farm (daily_vouchers.farm_id FK -> farms.id) ----------
  const { data: farm, error: farmErr } = await client
    .from('farms')
    .insert({ name: 'QA Roundtrip Farm', code: `QA-RT-${runId}` })
    .select()
    .single();
  if (farmErr) throw new Error(`seed farm failed: ${JSON.stringify(farmErr)}`);
  const farmId = farm.id;
  console.log(`  seeded farm ${farmId}`);

  const docId = `qa-rt-${runId}`;
  let writerDb, writerState, readerDb, readerState, cacheDb, cacheStates = [];
  try {

  const today = new Date().toISOString().slice(0, 10);
  const doc = {
    id: docId,
    farm_id: farmId,
    voucher_date: today,
    category: 'feed',
    status: 'draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // ---------- 1. WRITE: push through RxDB ----------
  writerDb = await createRxDatabase({
    name: `qa-rt-writer-${runId}`,
    storage,
    ignoreDuplicate: true,
  });
  await writerDb.addCollections({ daily_vouchers: { schema: dailyVouchersSchema } });
  writerState = replicateSupabase({
    tableName: 'daily_vouchers',
    client,
    collection: writerDb.daily_vouchers,
    replicationIdentifier: `qa-rt-writer-${runId}`,
    live: false,
    pull: {
      batchSize: 50,
      modifier: stripNulls,
      queryBuilder: ({ query }) =>
        query.or(`status.eq.draft,voucher_date.gte.${windowStartDate()}`),
    },
    push: { batchSize: 50 },
  });

  await writerDb.daily_vouchers.insert(doc);
  console.log('  inserted doc into RxDB (writer); waiting for push...');

  // poll PostgREST until the row lands (push is asynchronous)
  let serverRow = null;
  for (let i = 0; i < 50 && !serverRow; i++) {
    await sleep(300);
    const { data } = await client.from('daily_vouchers').select('*').eq('id', docId);
    if (data && data.length) serverRow = data[0];
  }
  check('push: doc reached the server', !!serverRow, serverRow ? undefined : 'never visible via PostgREST');
  if (serverRow) {
    check('push: _deleted=false on server', serverRow._deleted === false, `got ${serverRow._deleted}`);
    check('push: _modified assigned server-side', !!serverRow._modified, 'missing');
    check('push: fields intact', serverRow.farm_id === farmId && serverRow.category === 'feed' && serverRow.status === 'draft');
  }

  // ---------- 2. READ: pull into a fresh RxDB instance ----------
  readerDb = await createRxDatabase({
    name: `qa-rt-reader-${runId}`,
    storage,
    ignoreDuplicate: true,
  });
  await readerDb.addCollections({ daily_vouchers: { schema: dailyVouchersSchema } });
  readerState = replicateSupabase({
    tableName: 'daily_vouchers',
    client,
    collection: readerDb.daily_vouchers,
    replicationIdentifier: `qa-rt-reader-${runId}`,
    live: false,
    pull: {
      batchSize: 50,
      modifier: stripNulls,
      queryBuilder: ({ query }) =>
        query.or(`status.eq.draft,voucher_date.gte.${windowStartDate()}`),
    },
  });
  await readerState.awaitInitialReplication();
  const found = await readerDb.daily_vouchers.findOne(docId).exec();
  check('read: doc pulled back into fresh RxDB', !!found, found ? undefined : 'absent after initial pull');
  if (found) {
    const json = found.toJSON();
    check('read: fields intact', json.status === 'draft' && json.farm_id === farmId && json.category === 'feed');
    check('read: _modified not leaked into local doc', !('_modified' in json), 'schema does not declare it');
  }

  // ---------- 2b. CACHED TABLES: seed server-side, pull into fresh RxDB ----------
  const nowIso = new Date().toISOString();
  const { data: item, error: itemErr } = await client
    .from('farm_items')
    .insert({ farm_id: farmId, category: 'feed', name: `QA Item ${runId}`, unit: 'کیلوگرم', priority: 100, is_active: true, created_at: nowIso, updated_at: nowIso })
    .select()
    .single();
  if (itemErr) throw new Error(`seed item failed: ${JSON.stringify(itemErr)}`);
  const { data: hall, error: hallErr } = await client
    .from('farm_halls')
    .insert({ farm_id: farmId, hall_number: 999, name: 'QA Hall', is_active: true, created_at: nowIso })
    .select()
    .single();
  if (hallErr) throw new Error(`seed hall failed: ${JSON.stringify(hallErr)}`);
  const { data: formula, error: formulaErr } = await client
    .from('farm_feed_formulas')
    .insert({ farm_id: farmId, formula_no: 999, name: 'QA Formula', mixer_weight: 3000, is_active: true, created_at: nowIso, updated_at: nowIso })
    .select()
    .single();
  if (formulaErr) throw new Error(`seed formula failed: ${JSON.stringify(formulaErr)}`);
  const { data: formulaItem, error: fiErr } = await client
    .from('farm_formula_items')
    .insert({ formula_id: formula.id, item_id: item.id, qty_per_mixer: 1.5, created_at: nowIso })
    .select()
    .single();
  if (fiErr) throw new Error(`seed formula_item failed: ${JSON.stringify(fiErr)}`);
  console.log('  seeded 4 cached-table rows (server-generated text ids)');

  cacheDb = await createRxDatabase({
    name: `qa-rt-cache-${runId}`,
    storage,
    ignoreDuplicate: true,
  });
  await cacheDb.addCollections({
    farm_items: { schema: farmItemsSchema },
    farm_halls: { schema: farmHallsSchema },
    farm_feed_formulas: { schema: farmFeedFormulasSchema },
    farm_formula_items: { schema: farmFormulaItemsSchema },
  });
  for (const tableName of ['farm_items', 'farm_halls', 'farm_feed_formulas', 'farm_formula_items']) {
    cacheStates.push(replicateSupabase({
      tableName,
      client,
      collection: cacheDb[tableName],
      replicationIdentifier: `qa-rt-cache-${runId}-${tableName}`,
      live: false,
      pull: { batchSize: 50, modifier: stripNulls },
    }));
  }
  for (const s of cacheStates) await s.awaitInitialReplication();

  const cacheChecks = [
    ['farm_items', item.id, (d) => d.name === `QA Item ${runId}` && d.category === 'feed' && d.is_active === true],
    ['farm_halls', hall.id, (d) => d.name === 'QA Hall' && d.hall_number === 999 && d.is_active === true],
    ['farm_feed_formulas', formula.id, (d) => d.name === 'QA Formula' && d.formula_no === 999 && d.mixer_weight === 3000],
    ['farm_formula_items', formulaItem.id, (d) => d.formula_id === formula.id && d.item_id === item.id && d.qty_per_mixer === 1.5],
  ];
  for (const [table, id, fieldFn] of cacheChecks) {
    const doc = await cacheDb[table].findOne(id).exec();
    check(`cache: ${table} pulled back into fresh RxDB`, !!doc, doc ? undefined : 'absent after initial pull');
    if (doc) {
      const json = doc.toJSON();
      check(`cache: ${table} fields intact`, fieldFn(json), JSON.stringify(json));
      check(`cache: ${table} _modified not leaked`, !('_modified' in json), 'schema does not declare it');
    }
  }

  } finally {
    // ---------- 3. CLEANUP (always runs, even on failure) ----------
    try {
      await writerState.cancel();
      await readerState.cancel();
      for (const s of cacheStates) await s.cancel();
      await writerDb.close();
      await readerDb.close();
      if (cacheDb) await cacheDb.close();
    } catch (e) {
      console.warn('  cleanup warning (replication/DB teardown):', e.message || e);
    }
  // remove test vouchers + farms by marker pattern (id/code prefixes)
  const { data: testFarms } = await client
    .from('farms')
    .select('id')
    .like('code', 'QA-RT-%');
  if (testFarms && testFarms.length) {
    const ids = testFarms.map((f) => f.id);
    await client.from('daily_vouchers').delete().in('farm_id', ids);
    await client.from('farms').delete().in('id', ids);
  }
  const { count } = await client
    .from('daily_vouchers')
    .select('id', { count: 'exact', head: true })
    .eq('id', docId);
    check('cleanup: test rows removed', count === 0, `count=${count}`);
    console.log('  cleaned up test rows + DBs');
  }

  console.log(failures === 0 ? '\nROUND-TRIP OK — write+read through RxDB replication works' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('ROUND-TRIP ERROR:', err);
  process.exit(1);
});
