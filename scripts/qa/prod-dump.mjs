// _qa-prod-dump.mjs — READ-ONLY pull of production data via Management API SQL endpoint.
// Emits INSERT statements (all values quoted as text; Postgres casts implicitly).
// Output: scripts/qa/_qa-prod-data.sql
import { readFileSync, writeFileSync } from 'fs';

const env = {};
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const TOKEN = env['supabase-access-token'] || env['SUPABASE_ACCESS_TOKEN'];
const REF =
  env['VITE_SUPABASE_URL']?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ||
  'bjrzrmbqwalzqolvzioq';
const API = 'https://api.supabase.com';

if (!TOKEN) {
  console.error('No supabase-access-token in .env');
  process.exit(1);
}

async function sql(q) {
  const r = await fetch(`${API}/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 500)}`);
  const body = await r.json();
  const rows = Array.isArray(body) ? body[0]?.result ?? body : body.result ?? [];
  return rows;
}

const TABLES = [
  'inputs',
  'suppliers',
  'farms',
  'profiles',
  'farm_halls',
  'farm_feed_formulas',
  'farm_formula_items',
  'farm_items',
  'daily_vouchers',
  'daily_voucher_lines',
  'inventory_transactions',
  'user_activity_logs',
];

function quote(v) {
  if (v === null || v === undefined) return 'NULL';
  let s;
  if (typeof v === 'object') s = JSON.stringify(v);
  else if (typeof v === 'boolean') s = v ? 'true' : 'false';
  else s = String(v);
  return `'${s.replace(/'/g, "''")}'`;
}

const out = [];
out.push('-- Production data copy (read-only pull, ' + new Date().toISOString() + ')');
out.push('BEGIN;');
let total = 0;
for (const t of TABLES) {
  let cols;
  try {
    cols = await sql(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${t}' ORDER BY ordinal_position`
    );
  } catch (e) {
    console.error(`SKIP ${t}: ${e.message}`);
    continue;
  }
  const names = cols.map((c) => c.column_name);
  if (!names.length) {
    console.error(`SKIP ${t}: no columns`);
    continue;
  }
  const rows = await sql(`SELECT * FROM public.${t} ORDER BY 1`);
  console.log(`${t}: ${rows.length} rows`);
  total += rows.length;
  if (!rows.length) continue;
  const colList = names.map((n) => `"${n}"`).join(', ');
  const values = rows.map((r) => `(${names.map((n) => quote(r[n])).join(', ')})`);
  // chunk to stay under any statement-size limit
  for (let i = 0; i < values.length; i += 50) {
    out.push(`INSERT INTO public.${t} (${colList}) VALUES\n  ${values.slice(i, i + 50).join(',\n  ')};`);
  }
}
out.push('COMMIT;');
writeFileSync('scripts/qa/_qa-prod-data.sql', out.join('\n') + '\n');
console.log(`--- total ${total} rows written to scripts/qa/_qa-prod-data.sql`);
