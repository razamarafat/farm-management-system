import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = process.cwd();
const requireFromExportApi = createRequire(resolve(root, 'services/export-api/package.json'));
const ExcelJS = requireFromExportApi('exceljs');
const envText = readFileSync(resolve(root, '.env'), 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx), line.slice(idx + 1)];
    }),
);

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
const username = env.VITE_ADMIN_USERNAME;
const password = env.VITE_ADMIN_PASSWORD;
const bffUrl = process.env.BFF_URL || 'http://127.0.0.1:3000';
const evidenceDir = resolve(root, 'backups', `live-export-e2e-${new Date().toISOString().replace(/[:.]/g, '-')}`);
mkdirSync(evidenceDir, { recursive: true });

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.auth.signInWithPassword({
  email: `${username.toLowerCase().trim()}@morvarid.local`,
  password,
});

if (error || !data?.session?.access_token) {
  console.error(`[live-export-e2e] sign-in failed: ${error?.message ?? 'missing session'}`);
  process.exit(2);
}

const token = data.session.access_token;

const reports = [
  ['RPT_INVENTORY_VALUATION_SUMMARY', { date_to: '2026-07-07', farm_id: null, category: 'feed' }],
  ['RPT_INVENTORY_LEDGER', { date_from: '2026-02-24', date_to: '2026-02-26', farm_id: null, item_id: null, category: 'feed', txnTypes: null }],
  ['RPT_CONSUMPTION_ANALYTICS', { date_from: '2026-02-24', date_to: '2026-02-26', farm_id: null, category: 'feed', group_by: 'item' }],
  ['RPT_INVENTORY_AGING', { date_to: '2026-07-07', farm_id: null, category: 'feed', dead_stock_days: 90 }],
  ['RPT_PARETO_CLASSIFICATION', { date_from: '2026-02-24', date_to: '2026-02-26', farm_id: null, category: 'feed', basis: 'value' }],
  ['RPT_SUPPLIERS', { search: null, is_active: null }],
];

let pass = 0;
let fail = 0;
const results = [];

for (const [reportId, filters] of reports) {
  try {
    const res = await fetch(`${bffUrl}/api/export/${reportId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(filters),
    });
    const contentType = res.headers.get('content-type') ?? '';
    const rowCount = res.headers.get('x-export-row-count');
    const disposition = res.headers.get('content-disposition') ?? '';
    const bytes = Buffer.from(await res.arrayBuffer());
    const outFile = resolve(evidenceDir, `${reportId}.xlsx`);
    if (res.ok) writeFileSync(outFile, bytes);

    let workbookOk = false;
    let worksheets = [];
    if (res.ok && bytes.length > 0) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(bytes);
      worksheets = workbook.worksheets.map((ws) => ({ name: ws.name, rows: ws.rowCount, columns: ws.columnCount }));
      workbookOk = workbook.worksheets.length > 0;
    }

    const ok = res.status === 200
      && contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      && bytes.length > 1024
      && workbookOk;

    if (ok) pass += 1;
    else fail += 1;

    results.push({
      reportId,
      status: res.status,
      contentType,
      rowCount: rowCount == null ? null : Number(rowCount),
      bytes: bytes.length,
      contentDisposition: disposition.replace(/filename\*=UTF-8''[^;]+/i, 'filename*=UTF-8\'\'<redacted>'),
      workbookOk,
      worksheets,
      evidenceFile: res.ok ? outFile : null,
      filters,
      ok,
    });
  } catch (e) {
    fail += 1;
    results.push({ reportId, error: e instanceof Error ? e.message : String(e), ok: false });
  }
}

const summary = { pass, fail, evidenceDir, results };
writeFileSync(resolve(evidenceDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (fail > 0) process.exit(1);
