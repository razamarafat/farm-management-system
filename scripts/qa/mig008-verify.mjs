// _qa-mig008-verify.mjs — Step A verification harness.
// Boots a disposable local PostgreSQL (embedded-postgres), applies migrations 001-007,
// loads a copy of real production data, applies 008_offline_sync.sql, then runs a
// battery of checks. Read-only against the cloud; all mutations happen on the local copy.
import EmbeddedPostgres from 'embedded-postgres';
import { readFileSync, appendFileSync, rmSync } from 'fs';

// initdb on this machine defaults to the Persian_Iran.1252 locale which has no
// text-search config; force the C locale so initdb succeeds.
process.env.LC_ALL = 'C';
process.env.LANG = 'C';
process.env.LC_CTYPE = 'C';
// disposable data dir — clear any stale initdb from a previous run
rmSync('scripts/qa/.qa-pgdata', { recursive: true, force: true });

const DATA_DIR = 'scripts/qa/.qa-pgdata';
const MIG_DIR = 'scripts/migrations';
const MIGRATIONS = ['001_schema.sql', '002_functions.sql', '003_triggers.sql', '004_policies.sql', '005_grants.sql', '006_atomic_revert.sql', '007_input_name_normalization.sql'];
const MIGRATION_008 = '008_offline_sync.sql';
const PROD_DATA = 'scripts/qa/_qa-prod-data.sql';
const LOG = 'scripts/qa/_qa-mig008.log';

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: 'postgres',
  password: 'postgres',
  port: 5555,
  persistent: false,
  // Force UTF8 + C locale: the OS locale (Persian_Iran.1252) would otherwise make
  // initdb pick WIN1252, which cannot store the UTF-8 Persian text in the migrations.
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
  log('postgres up on port 5555');

  // Raw pg.Client with explicit timeouts (embedded-postgres getPgClient gives less control).
  const { Client } = await import('pg');
  const client = new Client({
    host: '127.0.0.1', port: 5555, user: 'postgres', password: 'postgres', database: 'postgres',
    connectionTimeoutMillis: 10000, statement_timeout: 120000, query_timeout: 120000,
  });
  let connected = false;
  for (const pw of ['postgres', '']) {
    client.password = pw;
    try { await client.connect(); connected = true; log('connected (pw=' + (pw ? 'set' : 'none') + ')'); break; }
    catch (e) { log('connect attempt failed: ' + e.message.slice(0, 120)); }
  }
  if (!connected) { log('FATAL: could not connect'); process.exit(2); }
  // uuid-ossp/pgcrypto install into the `extensions` schema (Supabase convention);
  // put it on the search_path so unqualified uuid_generate_v4() in table defaults resolves.
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
      console.log(`applied ${m}`);
    } catch (e) {
      console.error(`FAILED ${m}: ${e.message.slice(0, 400)}`);
      process.exit(1);
    }
  }

  log('\n=== loading production data copy ===');
  try {
    // Bypass FK triggers during load (as pg_restore does), then backfill auth.users
    // from the loaded profiles so created_by FKs are satisfied.
    await q(`SET session_replication_role = replica;`);
    await q(readFileSync(PROD_DATA, 'utf8'));
    // Backfill auth.users inside the replica block so the on_auth_user_created trigger
    // (which reads raw_user_meta_data, absent from the stub) does not fire.
    await q(`INSERT INTO auth.users SELECT id FROM public.profiles ON CONFLICT (id) DO NOTHING;`);
    await q(`SET session_replication_role = DEFAULT;`);
    log('prod data loaded (auth.users backfilled)');
  } catch (e) {
    log(`FAILED loading prod data: ${e.message.slice(0, 400)}`);
    process.exit(1);
  }

  console.log('\n=== applying 008_offline_sync.sql ===');
  try {
    await q(readFileSync(`${MIG_DIR}/${MIGRATION_008}`, 'utf8'));
    console.log('008 applied cleanly');
  } catch (e) {
    console.error(`FAILED 008: ${e.message.slice(0, 600)}`);
    process.exit(1);
  }

  console.log('\n=== verification battery ===');

  // 1. PK types are text
  const pkTypes = await q(`SELECT table_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND column_name='id'
      AND table_name IN ('daily_vouchers','daily_voucher_lines','inventory_transactions')
    ORDER BY table_name`);
  const pkOk = pkTypes.length === 3 && pkTypes.every((r) => r.data_type === 'text');
  check('PKs converted to text', pkOk, pkTypes.map((r) => `${r.table_name}=${r.data_type}`).join(', '));

  // 2. _modified/_deleted columns exist + backfilled
  const cols = await q(`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND column_name IN ('_modified','_deleted')
      AND table_name IN ('daily_vouchers','daily_voucher_lines','inventory_transactions')
    ORDER BY table_name, column_name`);
  check('_modified/_deleted on all 3 tables', cols.length === 6, cols.map((r) => `${r.table_name}.${r.column_name}`).join(', '));
  const backfill = await q(`SELECT
      (SELECT count(*) FROM daily_vouchers WHERE _deleted) AS v_del,
      (SELECT count(*) FROM daily_vouchers WHERE _modified IS NULL) AS v_mnull,
      (SELECT count(*) FROM daily_voucher_lines WHERE _deleted) AS l_del,
      (SELECT count(*) FROM daily_voucher_lines WHERE _modified IS NULL) AS l_mnull,
      (SELECT count(*) FROM inventory_transactions WHERE _deleted) AS t_del,
      (SELECT count(*) FROM inventory_transactions WHERE _modified IS NULL) AS t_mnull`);
  const b = backfill[0];
  const nb = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Number(v)]));
  check('backfill clean (no _deleted, no null _modified)', nb.v_del === 0 && nb.v_mnull === 0 && nb.l_del === 0 && nb.l_mnull === 0 && nb.t_del === 0 && nb.t_mnull === 0,
    JSON.stringify(nb));

  // 3. row counts match production baseline
  const counts = await q(`SELECT
      (SELECT count(*) FROM daily_vouchers) v, (SELECT count(*) FROM daily_voucher_lines) l,
      (SELECT count(*) FROM inventory_transactions) t, (SELECT count(*) FROM farm_items) fi,
      (SELECT count(*) FROM farm_halls) h, (SELECT count(*) FROM inputs) i,
      (SELECT count(*) FROM farms) f, (SELECT count(*) FROM profiles) p,
      (SELECT count(*) FROM suppliers) s, (SELECT count(*) FROM farm_feed_formulas) ff,
      (SELECT count(*) FROM farm_formula_items) ffi, (SELECT count(*) FROM user_activity_logs) ual`);
  const c = counts[0];
  const expect = { v: 13, l: 45, t: 61, fi: 62, h: 10, i: 32, f: 2, p: 3, s: 1, ff: 1, ffi: 15, ual: 5 };
  const countOk = Object.keys(expect).every((k) => Number(c[k]) === expect[k]);
  check('row counts preserved', countOk, JSON.stringify(c));

  // 4. FK integrity
  const orphans = await q(`SELECT
      (SELECT count(*) FROM daily_voucher_lines l LEFT JOIN daily_vouchers v ON v.id=l.voucher_id WHERE v.id IS NULL) AS lines,
      (SELECT count(*) FROM inventory_transactions t LEFT JOIN farm_items fi ON fi.id=t.item_id WHERE fi.id IS NULL) AS txns`);
  check('no orphan FK rows after cast', Number(orphans[0].lines) === 0 && Number(orphans[0].txns) === 0, JSON.stringify(orphans[0]));

  // 5. realtime publication membership
  const pub = await q(`SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY tablename`);
  const pubNames = pub.map((r) => r.tablename);
  check('3 tables in supabase_realtime publication',
    ['daily_vouchers', 'daily_voucher_lines', 'inventory_transactions'].every((t) => pubNames.includes(t)),
    pubNames.join(', '));

  // 6. _modified trigger fires on UPDATE (compare before/after _modified on a real column)
  const trigV = (await q(`SELECT id FROM daily_vouchers LIMIT 1`))[0];
  const m0 = (await q(`SELECT _modified::text AS m FROM daily_vouchers WHERE id=$1`, [trigV.id]))[0].m;
  await q(`UPDATE daily_vouchers SET category=category WHERE id=$1`, [trigV.id]);
  const m1 = (await q(`SELECT _modified::text AS m FROM daily_vouchers WHERE id=$1`, [trigV.id]))[0].m;
  check('_modified trigger fires on update', m1 > m0, `before=${m0} after=${m1}`);

  // 7. UNIQUE(farm_id, voucher_date, category) still enforced
  let dupErr = null;
  try {
    await q(`INSERT INTO daily_vouchers (farm_id, voucher_date, category)
             SELECT farm_id, voucher_date, category FROM daily_vouchers LIMIT 1`);
  } catch (e) {
    dupErr = e.message;
  }
  check('UNIQUE constraint still enforced', !!dupErr && /duplicate key/i.test(dupErr));

  // 8. new INSERT auto-generates text id (uuid default casts to text)
  // NOTE: the prior run used category 'qa-auto-id', which is NOT a member of
  // item_category_enum ('feed','packaging') — the INSERT threw and id stayed null.
  // Use a valid enum value and include created_by (admin) for realism.
  let insErr = null;
  let newId = null;
  const qaAdmin = (await q(`SELECT id FROM profiles WHERE role='admin' AND is_active ORDER BY created_at LIMIT 1`))[0];
  try {
    const ins = await q(`INSERT INTO daily_vouchers (farm_id, voucher_date, category, created_by)
        SELECT f.id, CURRENT_DATE, 'feed', $1 FROM farms f LIMIT 1 RETURNING id`, [qaAdmin?.id ?? null]);
    newId = ins[0].id;
    await q(`DELETE FROM daily_vouchers WHERE id=$1`, [newId]);
  } catch (e) {
    insErr = e.message;
  }
  check('new insert auto-generates text id', !insErr && typeof newId === 'string', `id=${newId}`);

  // 9. soft-delete revert end-to-end (real submitted voucher from prod copy)
  const sub = (await q(`SELECT id, farm_id FROM daily_vouchers WHERE status='submitted' LIMIT 1`))[0];
  const admin = (await q(`SELECT id FROM profiles WHERE role='admin' AND is_active ORDER BY created_at LIMIT 1`))[0];
  if (sub && admin) {
    // The prod-copy submitted voucher is stale (submitted_at > 24h ago), so a
    // revert correctly auto-locks it (VOUCHER_LOCKED). Refresh submitted_at to
    // NOW() so this run exercises the revert SUCCESS path (soft-delete txn rows
    // + reset to draft), then restore it afterwards so the copy stays faithful.
    const origSubmittedAt = (await q(`SELECT submitted_at::text AS s FROM daily_vouchers WHERE id=$1`, [sub.id]))[0].s;
    await q(`UPDATE daily_vouchers SET submitted_at = NOW() WHERE id=$1`, [sub.id]);
    const txnCount = (await q(`SELECT count(*)::int AS n FROM inventory_transactions
        WHERE source_type='daily_voucher' AND source_id::text=$1`, [sub.id]))[0].n;
    await q(`SET request.jwt.claim.sub = '${admin.id}'`);
    const rv = (await q(`SELECT public.revert_daily_voucher($1) AS r`, [sub.id]))[0].r;
    const after = await q(`SELECT
        (SELECT count(*) FROM inventory_transactions WHERE source_type='daily_voucher' AND source_id::text=$1 AND _deleted=true) AS soft,
        (SELECT count(*) FROM inventory_transactions WHERE source_type='daily_voucher' AND source_id::text=$1 AND _deleted=false) AS live,
        (SELECT status FROM daily_vouchers WHERE id=$1) AS status`, [sub.id]);
    check('revert_daily_voucher returns OK', rv.success === true && rv.code === 'OK', JSON.stringify(rv));
    check('revert soft-deletes txn rows (not hard-delete)', Number(after[0].soft) === txnCount && Number(after[0].live) === 0,
      `soft=${after[0].soft} live=${after[0].live} expected soft=${txnCount}`);
    check('voucher reset to draft', after[0].status === 'draft', `status=${after[0].status}`);
    // restore the voucher so the copy stays usable (incl. original submitted_at)
    await q(`UPDATE daily_vouchers SET status='submitted', submitted_at=$1::timestamptz WHERE id=$2`, [origSubmittedAt, sub.id]);
    await q(`UPDATE inventory_transactions SET _deleted=false WHERE source_type='daily_voucher' AND source_id::text=$1`, [sub.id]);
  } else {
    check('revert test skipped', false, `submitted voucher=${!!sub} admin=${!!admin}`);
  }

  // 10. section-8 fix: readers exclude soft-deleted rows
  // The prod copy has no eligible supplier txn (previous run skipped this check);
  // fabricate a synthetic eligible purchase row so the reader filter is exercised.
  // Satisfies has_movement (qty_in>0), positive_qty, and the supplier FK.
  await q(`INSERT INTO inventory_transactions (farm_id, item_id, txn_date, txn_type, qty_in, qty_out, supplier_id, source_type, notes)
      SELECT t.farm_id, t.item_id, CURRENT_DATE, 'purchase', 10, 0, s.id, 'qa-supplier-test', 'qa synthetic eligible supplier txn'
      FROM (SELECT id FROM suppliers WHERE is_active LIMIT 1) s
      CROSS JOIN (SELECT farm_id, item_id FROM inventory_transactions LIMIT 1) t`);
  const sup = (await q(`SELECT supplier_id FROM inventory_transactions WHERE supplier_id IS NOT NULL AND txn_type NOT IN ('consumption','waste','transfer_out') AND _deleted=false LIMIT 1`))[0];
  if (sup) {
    const before = (await q(`SELECT public.rpc_supplier_usage_count($1) AS n`, [sup.supplier_id]))[0].n;
    const victim = (await q(`SELECT id FROM inventory_transactions WHERE supplier_id=$1 AND txn_type NOT IN ('consumption','waste','transfer_out') AND _deleted=false LIMIT 1`, [sup.supplier_id]))[0];
    await q(`UPDATE inventory_transactions SET _deleted=true WHERE id=$1`, [victim.id]);
    const after = (await q(`SELECT public.rpc_supplier_usage_count($1) AS n`, [sup.supplier_id]))[0].n;
    await q(`UPDATE inventory_transactions SET _deleted=false WHERE id=$1`, [victim.id]);
    check('rpc_supplier_usage_count excludes soft-deleted', Number(after) === Number(before) - 1, `before=${before} after=${after}`);
  } else {
    check('rpc_supplier_usage_count test skipped', false, 'no eligible supplier txn');
  }
  const init = (await q(`SELECT item_id, farm_id FROM inventory_transactions WHERE txn_type='initial' AND _deleted=false LIMIT 1`))[0];
  if (init) {
    const be = (await q(`SELECT public.rpc_initial_stock_exists($1,$2) AS e`, [init.farm_id, init.item_id]))[0].e;
    await q(`UPDATE inventory_transactions SET _deleted=true WHERE txn_type='initial' AND item_id=$1 AND farm_id=$2`, [init.item_id, init.farm_id]);
    const af = (await q(`SELECT public.rpc_initial_stock_exists($1,$2) AS e`, [init.farm_id, init.item_id]))[0].e;
    await q(`UPDATE inventory_transactions SET _deleted=false WHERE txn_type='initial' AND item_id=$1 AND farm_id=$2`, [init.item_id, init.farm_id]);
    check('rpc_initial_stock_exists excludes soft-deleted', be === true && af === false, `before=${be} after=${af}`);
  } else {
    check('rpc_initial_stock_exists test skipped', false, 'no initial txn');
  }

  // 11. a reporting reader runs cleanly against the migrated data
  try {
    const r = await q(`SELECT public.reporting_inventory_stock() LIMIT 1`);
    check('reporting_inventory_stock runs', true, `rows=${r.length}`);
  } catch (e) {
    check('reporting_inventory_stock runs', false, e.message.slice(0, 200));
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
  // Exit directly; the async-exit-hook tears down postgres. Avoids a hang at pg.stop().
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  log('FATAL: ' + e.message);
  process.exit(2);
});
