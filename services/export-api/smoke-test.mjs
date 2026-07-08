// =====================================================================
// services/export-api/smoke-test.mjs
//
// End-to-end smoke test — assumes a running server (npm start) on
// http://localhost:${PORT:-3000}. Default report is
// RPT_INVENTORY_LEDGER (operator-accessible) so the smoke test runs
// against any role's JWT; supervisors/admins can override SMOKE_REPORT
// to test valuation / aging / pareto reports.
//
// Run: TEST_JWT=eyJhbG... node smoke-test.mjs
// or:  TEST_JWT=... SMOKE_REPORT=RPT_PARETO_CLASSIFICATION node smoke-test.mjs
// =====================================================================

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.EXPORT_API_HOST || `http://localhost:${PORT}`;
const TOKEN = process.env.TEST_JWT;
// Default to RPT_INVENTORY_LEDGER (operator-accessible) so any role's
// JWT can run the smoke test without first swapping to admin. Override
// SMOKE_REPORT to exercise supervisor/admin-only reports like the
// valuation summary / aging / pareto.
const REPORT = process.env.SMOKE_REPORT || 'RPT_INVENTORY_LEDGER';

if (!TOKEN) {
  console.error('[smoke-test] TEST_JWT env var is required.');
  console.error('  export TEST_JWT=eyJhbG... ; node smoke-test.mjs');
  process.exit(2);
}

const today = new Date().toISOString().slice(0, 10);
const url = `${HOST}/api/export/${REPORT}`;
const body = JSON.stringify({
  date_to: today,
  // Leave farm_id + category empty to test scope-wide path.
});

console.log(`[smoke-test] POST ${url}`);
console.log(`[smoke-test] body=${body}`);

const t0 = Date.now();
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body).toString(),
  },
  body,
});
const elapsed = Date.now() - t0;
if (!res.ok) {
  const text = await res.text();
  console.error(`[smoke-test] HTTP ${res.status} (${elapsed} ms): ${text}`);
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
const xlsxMagic = buf.subarray(0, 4).toString('binary');
const MIN_BYTES = 4_000; // A workbook with at least the title row + styles is ~4KB.

if (xlsxMagic !== 'PK\x03\x04') {
  console.error(
    `[smoke-test] FAILED — response does not start with the ZIP/XLSX magic ` +
    `bytes "PK\\x03\\x04" (got ${JSON.stringify(xlsxMagic.slice(0, 2))}). ` +
    `Probably got HTML or JSON back, not .xlsx.`,
  );
  process.exit(1);
}
if (buf.length < MIN_BYTES) {
  console.error(
    `[smoke-test] FAILED — buffer is suspiciously small (${buf.length} bytes).`,
  );
  process.exit(1);
}

const outPath = path.resolve('./smoke-output.xlsx');
await writeFile(outPath, buf);
console.log(`[smoke-test] PASS — wrote ${buf.length} bytes to ${outPath} (${elapsed} ms).`);
console.log(`[smoke-test] X-Export-Row-Count: ${res.headers.get('X-Export-Row-Count')}`);
console.log(`[smoke-test] Content-Type: ${res.headers.get('Content-Type')}`);
