// mig009-verify.mjs — verification harness for 009_offline_cache_tables.sql.
// Boots a disposable local PostgreSQL (embedded-postgres), applies migrations 001-009
// against a copy of real production data, then runs the 009 battery: structural checks
// (text PKs, _modified/_deleted), coordinated FK casts (no orphans, constraints re-added),
// RLS recreation, triggers/indexes/publication, and a full regression sweep of every
// RPC/reporting function that reads the four cached tables.
// Read-only against the cloud; all mutations happen on the local copy.
import EmbeddedPostgres from 'embedded-postgres';
import { readFileSync, appendFileSync, rmSync } from 'fs';

process.env.LC_ALL = 'C';
process.env.LANG = 'C';
process.env.LC_CTYPE = 'C';
rmSync('scripts/qa/.qa-pgdata', { recursive: true, force: true });

const DATA_DIR = 'scripts/qa/.qa-pgdata';
const MIG_DIR = 'scripts/migrations';
const MIGRATIONS = ['001_schema.sql', '002_functions.sql', '003_triggers.sql', '004_policies.sql', '005_grants.sql', '006_atomic_revert.sql', '007_input_name_normalization.sql'];
const MIGRATION_008 = '008_offline_sync.sql';
const MIGRATION_009 = '009_offline_cache_tables.sql';
const PROD_DATA = 'scripts/qa/_qa-prod-data.sql';
const LOG = 'scripts/qa/_qa-mig009.log';

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: 'postgres',
  password: 'postgres',
  port: 5555,
  persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

const results = [];
function log(line) {
  console.log(line);
  try { appendFileSync(LOG, line + '\n'); } catch {}
}
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function main() {
  log('=== booting embedded postgres ===');
  await pg.initialise();
  await pg.start();

  const { Client } = await import('pg');
  const client = new Client({
    host: '127.0.0.1', port: 5555, user: 'postgres', password: 'postgres', database: 'postgres',
    connectionTimeoutMillis: 10000, statement_timeout: 120000, query_timeout: 120000,
  });
  let connected = false;
  for (const pw of ['postgres', '']) {
    client.password = pw;
    try { await client.connect(); connected = true; log('connected'); break; }
    catch (e) { log('connect attempt failed: ' + e.message.slice(0, 120)); }
  }
  if (!connected) { log('FATAL: could not connect'); process.exit(2); }
  await client.query(`SET search_path = public, extensions;`);
  const q = async (sql, params) => (await client.query(sql, params)).rows;

  console.log('\n=== pre-migration stubs (roles / auth schema / extensions / publication) ===');
  await q(`CREATE SCHEMA IF NOT EXISTS extensions;`);
  await q(`CREATE SCHEMA IF NOT EXISTS auth;`);
  await q(`CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);`);
  await q(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
           AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
  await q(`CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
           AS $$ SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text $$;`);
  for (const r of ['anon', 'authenticated', 'service_role']) {
    await q(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${r}')
             THEN CREATE ROLE ${r} NOLOGIN; END IF; END $$;`);
  }
  await q(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_publication WHERE pubname='supabase_realtime') THEN CREATE PUBLICATION supabase_realtime; END IF; END $$;`);
  console.log('stubs OK');

  console.log('\n=== applying migrations 001-007 ===');
  for (const m of MIGRATIONS) {
    try {
      await q(readFileSync(`${MIG_DIR}/${m}`, 'utf8'));
    } catch (e) {
      console.error(`FAILED ${m}: ${e.message.slice(0, 400)}`);
      process.exit(1);
    }
  }

  log('\n=== loading production data copy ===');
  try {
    await q(`SET session_replication_role = replica;`);
    await q(readFileSync(PROD_DATA, 'utf8'));
    await q(`INSERT INTO auth.users SELECT id FROM public.profiles ON CONFLICT (id) DO NOTHING;`);
    await q(`SET session_replication_role = DEFAULT;`);
  } catch (e) {
    log(`FAILED loading prod data: ${e.message.slice(0, 400)}`);
    process.exit(1);
  }

  console.log('\n=== applying 008 then 009 ===');
  try {
    await q(readFileSync(`${MIG_DIR}/${MIGRATION_008}`, 'utf8'));
    console.log('008 applied cleanly');
  } catch (e) {
    console.error(`FAILED 008: ${e.message.slice(0, 600)}`);
    process.exit(1);
  }
  try {
    await q(readFileSync(`${MIG_DIR}/${MIGRATION_009}`, 'utf8'));
    console.log('009 applied cleanly');
  } catch (e) {
    console.error(`FAILED 009: ${e.message.slice(0, 600)}`);
    process.exit(1);
  }

  console.log('\n=== verification battery ===');

  // 1. PK types are text on all 4 cached tables
  const pkTypes = await q(`SELECT table_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND column_name='id'
      AND table_name IN ('farm_items','farm_halls','farm_feed_formulas','farm_formula_items')
    ORDER BY table_name`);
  check('4 cached tables: PKs converted to text', pkTypes.length === 4 && pkTypes.every((r) => r.data_type === 'text'),
    pkTypes.map((r) => `${r.table_name}=${r.data_type}`).join(', '));

  // 2. _modified/_deleted columns exist on all 4
  const cols = await q(`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND column_name IN ('_modified','_deleted')
      AND table_name IN ('farm_items','farm_halls','farm_feed_formulas','farm_formula_items')
    ORDER BY table_name, column_name`);
  check('_modified/_deleted on all 4 cached tables', cols.length === 8,
    cols.map((r) => `${r.table_name}.${r.column_name}`).join(', '));

  // 3. defaults + backfill clean (no null _modified, no _deleted on load)
  const backfill = await q(`SELECT
      (SELECT count(*) FROM farm_items WHERE _deleted OR _modified IS NULL) AS fi,
      (SELECT count(*) FROM farm_halls WHERE _deleted OR _modified IS NULL) AS h,
      (SELECT count(*) FROM farm_feed_formulas WHERE _deleted OR _modified IS NULL) AS ff,
      (SELECT count(*) FROM farm_formula_items WHERE _deleted OR _modified IS NULL) AS ffi`);
  const b = backfill[0];
  check('backfill clean (no _deleted, no null _modified)', Object.values(b).every((v) => Number(v) === 0),
    JSON.stringify(b));

  // 4. row counts preserved through the cast (4 cached + 2 FK-side tables)
  const before = await q(`SELECT
      (SELECT count(*) FROM farm_items) fi, (SELECT count(*) FROM farm_halls) h,
      (SELECT count(*) FROM farm_feed_formulas) ff, (SELECT count(*) FROM farm_formula_items) ffi,
      (SELECT count(*) FROM daily_voucher_lines) l, (SELECT count(*) FROM inventory_transactions) t`);
  const expectCounts = { fi: 62, h: 10, ff: 1, ffi: 15, l: 45, t: 61 };
  const numCounts = Object.fromEntries(Object.entries(before[0]).map(([k, v]) => [k, Number(v)]));
  const countOk = Object.keys(expectCounts).every((k) => numCounts[k] === expectCounts[k]);
  check('row counts preserved (62/10/1/15/45/61)', countOk, JSON.stringify(numCounts));

  // 5. FK integrity: no orphaned FK rows on the 4 coordinated FKs
  const orphans = await q(`SELECT
      (SELECT count(*) FROM daily_voucher_lines l LEFT JOIN farm_items fi ON fi.id = l.item_id WHERE fi.id IS NULL) AS l,
      (SELECT count(*) FROM inventory_transactions t LEFT JOIN farm_items fi ON fi.id = t.item_id WHERE fi.id IS NULL) AS t,
      (SELECT count(*) FROM farm_formula_items i LEFT JOIN farm_items fi ON fi.id = i.item_id WHERE fi.id IS NULL) AS ffi_i,
      (SELECT count(*) FROM farm_formula_items i LEFT JOIN farm_feed_formulas f ON f.id = i.formula_id WHERE f.id IS NULL) AS ffi_f`);
  check('no orphan FK rows after coordinated cast', Object.values(orphans[0]).every((v) => Number(v) === 0),
    JSON.stringify(orphans[0]));

  // 6. FK constraints re-added with matching (text = text) types
  const fks = await q(`SELECT c.conname, a.attname, a.atttypid::regtype::text AS coltype
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conname IN ('daily_voucher_lines_item_id_fkey','inventory_transactions_item_id_fkey',
                        'farm_formula_items_formula_id_fkey','farm_formula_items_item_id_fkey')
    ORDER BY c.conname`);
  check('all 4 FK constraints re-added with text columns',
    fks.length === 4 && fks.every((r) => r.coltype === 'text'),
    fks.map((r) => `${r.conname}.${r.attname}=${r.coltype}`).join(', '));

  // 7. RLS policies recreated on the 4 tables (11 total)
  const pols = await q(`SELECT tablename, count(*) AS n FROM pg_policies
    WHERE tablename IN ('farm_items','farm_halls','farm_feed_formulas','farm_formula_items')
    GROUP BY tablename ORDER BY tablename`);
  const polTotal = pols.reduce((s, r) => s + Number(r.n), 0);
  check('all 11 RLS policies recreated', polTotal === 11,
    pols.map((r) => `${r.tablename}=${r.n}`).join(', ') + ` total=${polTotal}`);

  // 8. _modified trigger fires on the cached tables
  const trigV = (await q(`SELECT id FROM farm_items LIMIT 1`))[0];
  const m0 = (await q(`SELECT _modified::text AS m FROM farm_items WHERE id=$1`, [trigV.id]))[0].m;
  await q(`UPDATE farm_items SET name = name WHERE id=$1`, [trigV.id]);
  const m1 = (await q(`SELECT _modified::text AS m FROM farm_items WHERE id=$1`, [trigV.id]))[0].m;
  check('_modified trigger fires on farm_items update', m1 > m0, `before=${m0} after=${m1}`);

  // 9. filter indexes present
  const idx = await q(`SELECT indexname FROM pg_indexes WHERE schemaname='public'
    AND indexname LIKE 'idx_%_offline_modified' AND tablename IN
    ('farm_items','farm_halls','farm_feed_formulas','farm_formula_items') ORDER BY indexname`);
  check('4 _modified indexes present', idx.length === 4, idx.map((r) => r.indexname).join(', '));

  // 10. realtime publication now includes all 7 enrolled tables
  const pub = await q(`SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY tablename`);
  const pubNames = pub.map((r) => r.tablename);
  check('all 7 tables in supabase_realtime publication',
    ['daily_vouchers','daily_voucher_lines','inventory_transactions','farm_items','farm_halls','farm_feed_formulas','farm_formula_items'].every((t) => pubNames.includes(t)),
    pubNames.join(', '));

  // 11. FK-side column types are text
  const sideTypes = await q(`SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND ((table_name='daily_voucher_lines' AND column_name='item_id')
      OR (table_name='inventory_transactions' AND column_name='item_id')) ORDER BY table_name`);
  check('FK-side columns (lines.item_id, txns.item_id) are text',
    sideTypes.length === 2 && sideTypes.every((r) => r.data_type === 'text'),
    sideTypes.map((r) => `${r.table_name}.${r.column_name}=${r.data_type}`).join(', '));

  // ---------- 12. function regression battery ----------
  console.log('\n=== reporting function regression battery ===');
  const admin = (await q(`SELECT id FROM profiles WHERE role='admin' AND is_active ORDER BY created_at LIMIT 1`))[0];
  if (!admin) { log('FATAL: no admin profile in copy'); process.exit(2); }
  const item = (await q(`SELECT id, farm_id FROM farm_items WHERE is_active ORDER BY id LIMIT 1`))[0];
  const hall = (await q(`SELECT id FROM farm_halls LIMIT 1`))[0];
  const formula = (await q(`SELECT id FROM farm_feed_formulas LIMIT 1`))[0];
  const wide = ['2020-01-01', '2035-12-31'];
  const wideArgs = `'${wide[0]}','${wide[1]}'`;

  const runFn = async (name, call) => {
    try {
      const rows = await q(`SELECT * FROM public.${call} LIMIT 5`);
      check(name, true, `rows=${rows.length}`);
    } catch (e) {
      check(name, false, e.message.slice(0, 200));
    }
  };
  await runFn('reporting_get_item_unit_price (text item id)',
    `reporting_get_item_unit_price('${item.id}', '${item.farm_id}', CURRENT_DATE)`);
  await runFn('reporting_inventory_balance_as_of',
    `reporting_inventory_balance_as_of(CURRENT_DATE)`);
  await runFn('reporting_inventory_ledger',
    `reporting_inventory_ledger(NULL, '${item.id}')`);
  await runFn('reporting_inventory_stock',
    `reporting_inventory_stock(CURRENT_DATE)`);
  await runFn('reporting_consumption_report_v3 day', `reporting_consumption_report_v3(${wideArgs}, NULL, NULL, 'day')`);
  await runFn('reporting_consumption_report_v3 item', `reporting_consumption_report_v3(${wideArgs}, NULL, NULL, 'item')`);
  await runFn('reporting_consumption_report_v3 hall (text[] ids)',
    `reporting_consumption_report_v3(${wideArgs}, NULL, NULL, 'hall', ARRAY['${hall.id}']::text[])`);
  await runFn('reporting_consumption_report_v3 formula (text[] ids)',
    `reporting_consumption_report_v3(${wideArgs}, NULL, NULL, 'formula', ARRAY[]::text[], ARRAY['${formula.id}']::text[])`);
  await runFn('reporting_consumption_summary formula', `reporting_consumption_summary(${wideArgs}, NULL, NULL, 'formula')`);
  await runFn('reporting_packaging_v3', `reporting_packaging_v3(${wideArgs})`);
  await runFn('reporting_pareto_classification', `reporting_pareto_classification(${wideArgs})`);
  await runFn('reporting_purchases_v3', `reporting_purchases_v3(${wideArgs}, NULL, NULL, '${item.id}')`);
  await runFn('reporting_reorder_point_v3', `reporting_reorder_point_v3()`);
  await runFn('reporting_sales_transfers_v3', `reporting_sales_transfers_v3(${wideArgs}, NULL, '${item.id}')`);
  await runFn('rpc_initial_stock_exists (text item id)',
    `rpc_initial_stock_exists('${item.farm_id}', '${item.id}')`);

  // ---------- 13. RPC write-path battery (with admin JWT claim) ----------
  console.log('\n=== RPC write-path regression battery ===');
  await q(`SET request.jwt.claim.sub = '${admin.id}'`);
  await q(`SET request.jwt.claim.role = 'authenticated'`);

  // pick a draft voucher + a same-farm item not already on the voucher
  const voucher = (await q(`SELECT id, farm_id, voucher_date FROM daily_vouchers WHERE status='draft' LIMIT 1`))[0];
  let lineItem = null;
  if (voucher) {
    const cand = await q(`SELECT fi.id FROM farm_items fi
      WHERE fi.farm_id = $1 AND fi.is_active
        AND NOT EXISTS (SELECT 1 FROM daily_voucher_lines l WHERE l.voucher_id=$2 AND l.item_id=fi.id)
      LIMIT 1`, [voucher.farm_id, voucher.id]);
    lineItem = cand[0] || (await q(`SELECT id FROM farm_items WHERE farm_id=$1 AND is_active LIMIT 1`, [voucher.farm_id]))[0];
  }
  if (voucher && lineItem) {
    let lineId = null;
    try {
      const r = await q(`SELECT public.rpc_upsert_voucher_line($1,$2,NULL,1,NULL,1,0,NULL,'{}'::jsonb,NULL) AS id`,
        [voucher.id, lineItem.id]);
      lineId = r[0].id;
      const line = (await q(`SELECT item_id, consumed_qty, _deleted FROM daily_voucher_lines WHERE id=$1`, [lineId]))[0];
      check('rpc_upsert_voucher_line inserts line with text item_id',
        line && line.item_id === lineItem.id && Number(line.consumed_qty) === 1 && line._deleted === false,
        JSON.stringify(line));
    } catch (e) {
      check('rpc_upsert_voucher_line inserts line with text item_id', false, e.message.slice(0, 200));
    }
    try {
      const r = await q(`SELECT public.save_daily_sheet($1, $2::jsonb) AS res`,
        [voucher.id, JSON.stringify([{ item_id: lineItem.id, consumed_qty: 2, waste_qty: 0, mixer_count: 1 }])]);
      const line = (await q(`SELECT consumed_qty FROM daily_voucher_lines WHERE voucher_id=$1 AND item_id=$2`, [voucher.id, lineItem.id]))[0];
      check('save_daily_sheet upserts line (jsonb text item id)', r[0].res.success === true && Number(line.consumed_qty) === 2,
        JSON.stringify(r[0].res) + ` consumed=${line.consumed_qty}`);
    } catch (e) {
      check('save_daily_sheet upserts line (jsonb text item id)', false, e.message.slice(0, 200));
    }
    // full submit: fabricate stock so the qty>0 txn-insert path fires
    try {
      await q(`INSERT INTO inventory_transactions (farm_id, item_id, txn_date, txn_type, qty_in, qty_out, source_type, notes)
        VALUES ($1,$2,CURRENT_DATE,'purchase',1000,0,'qa-009-synth','synthetic stock for submit test')`,
        [voucher.farm_id, lineItem.id]);
      const res = (await q(`SELECT public.submit_daily_voucher($1,$2,$3,$4::jsonb) AS r`,
        [voucher.id, voucher.farm_id, voucher.voucher_date,
         JSON.stringify([{ item_id: lineItem.id, consumed_qty: 1, waste_qty: 0 }])]))[0].r;
      const txns = await q(`SELECT item_id, qty_out, source_type, source_id, _deleted
        FROM inventory_transactions WHERE source_type='daily_voucher' AND source_id=$1 AND _deleted=false`, [voucher.id]);
      const st = (await q(`SELECT status FROM daily_vouchers WHERE id=$1`, [voucher.id]))[0].status;
      check('submit_daily_voucher OK (text item ids end-to-end)',
        res.success === true && txns.length === 1 && txns[0].item_id === lineItem.id && Number(txns[0].qty_out) === 1 && st === 'submitted',
        JSON.stringify(res) + ` txns=${JSON.stringify(txns)} status=${st}`);
    } catch (e) {
      check('submit_daily_voucher OK (text item ids end-to-end)', false, e.message.slice(0, 200));
    }
    // revert (soft-delete) resets to draft + cleans the submit's txn rows
    try {
      const rv = (await q(`SELECT public.revert_daily_voucher($1) AS r`, [voucher.id]))[0].r;
      const st = (await q(`SELECT status FROM daily_vouchers WHERE id=$1`, [voucher.id]))[0].status;
      check('revert after text-id submit returns to draft', rv.success === true && st === 'draft', JSON.stringify(rv) + ` status=${st}`);
    } catch (e) {
      check('revert after text-id submit returns to draft', false, e.message.slice(0, 200));
    }
    // cleanup: hard-remove test artifacts (line + synthetic + submit txns)
    await q(`DELETE FROM daily_voucher_lines WHERE voucher_id=$1`, [voucher.id]);
    await q(`DELETE FROM inventory_transactions WHERE source_type='qa-009-synth'`);
    await q(`DELETE FROM inventory_transactions WHERE source_type='daily_voucher' AND source_id=$1`, [voucher.id]);
  } else {
    check('RPC write-path battery', false, `draft voucher=${!!voucher} lineItem=${!!lineItem}`);
  }

  // rpc_create_inventory_txn with text item id
  try {
    const r = await q(`SELECT public.rpc_create_inventory_txn($1,$2,CURRENT_DATE,'adjustment',0,5,0,'qa-009','qa 009 txn',NULL,'qa-009-synth',NULL) AS id`,
      [item.farm_id, item.id]);
    const txn = (await q(`SELECT item_id, txn_type, _deleted FROM inventory_transactions WHERE id=$1`, [r[0].id]))[0];
    check('rpc_create_inventory_txn creates txn with text item id',
      txn && txn.item_id === item.id && txn._deleted === false, JSON.stringify(txn));
    await q(`DELETE FROM inventory_transactions WHERE source_type='qa-009-synth'`);
  } catch (e) {
    check('rpc_create_inventory_txn creates txn with text item id', false, e.message.slice(0, 200));
  }

  console.log('\n=== summary ===');
  const fails = results.filter((r) => !r.ok);
  console.log(`${results.length - fails.length}/${results.length} checks passed`);
  if (fails.length) {
    console.log('FAILURES:');
    fails.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
  }

  log('');
  log('=== summary ===');
  log(`${results.length - fails.length}/${results.length} checks passed`);
  if (fails.length) {
    log('FAILURES:');
    fails.forEach((f) => log(`  - ${f.name}: ${f.detail}`));
  }
  log('HARNESS_DONE exit=' + (fails.length ? 1 : 0));
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  log('FATAL: ' + e.message);
  process.exit(2);
});
