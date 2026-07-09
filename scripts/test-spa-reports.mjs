// =====================================================================
// scripts/test-spa-reports.mjs
//
// Pass 1 of Reports-menu redesign (docs/reports/reports-menu-redesign.md):
// asserts the SPA surface lines up with the new 6-report catalog and that
// every legacy reference (deleted sections, deleted hooks, deleted report
// IDs, removed InventoryLedgerSection) is gone.
//
// Signals it catches:
//   - reportRegistry missing or extra IDs in services/export-api/registry.mjs
//   - any source file under src/ still references a deleted report ID
//   - any source file still references a deleted hook
//   - any of the 6 new section stubs is missing or renders the wrong title
//
// Exit codes: 0 = all PASS, 1 = at least one FAIL with readable message.
// =====================================================================

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { reportRegistry } from '../services/export-api/registry.mjs';

const root = process.cwd();
const read = (p) => readFileSync(resolve(root, p), 'utf8');

let pass = 0;
let fail = 0;

function assert(name, condition) {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
    return;
  }
  fail += 1;
  console.error(`FAIL ${name}`);
}

// ---------------------------------------------------------------------
// The authoritative 6-report set — matches REPORT_CATALOG in
// src/types/report.types.ts and the BFF registry.
// ---------------------------------------------------------------------
const expectedReportIds = [
  'RPT_INVENTORY_STOCK',
  'RPT_CONSUMPTION_REPORT',
  'RPT_SALES_TRANSFERS',
  'RPT_PURCHASES',
  'RPT_PACKAGING',
  'RPT_REORDER_POINT',
];

// Catalogue row titles from REPORT_CATALOG. These Persian substrings are
// the exact user-visible label that should render in the section's
// <UnderDevelopment … reportName={...} /> during Pass 1.
const sectionTitles = {
  InventoryStockSection:    'موجودی انبار',
  ConsumptionReportSection: 'گزارش مصرف',
  SalesTransfersSection:    'گزارش فروش و انتقال بین انبارها',
  PurchasesSection:         'گزارش خریدها',
  PackagingSection:         'گزارش اقلام بسته‌بندی',
  ReorderPointSection:      'نقطه سفارش کالا',
};

// IDs and hooks that were retired in the deletion sweep. If any of
// these appear in source files, this is a Phase-2 §5 violation.
const deletedReportIds = [
  'RPT_INVENTORY_VALUATION_SUMMARY',
  'RPT_INVENTORY_LEDGER',
  'RPT_CONSUMPTION_ANALYTICS',
  'RPT_INVENTORY_AGING',
  'RPT_PARETO_CLASSIFICATION',
  // RPT_SUPPLIERS intentionally lives on /admin/suppliers and was never
  // part of the Reports menu — its registry entry is unmoved.
];
const deletedHooks = [
  'useInventoryAging',
  'useInventoryValuationSummary',
  'useParetoClassification',
  'useConsumptionSummary',
  'useInventoryLedgerReport', // cross-item ledger hook — only used by the
                              //   deleted InventoryLedgerSection.
];
const deletedSectionFiles = [
  'InventoryLedgerSection.tsx',
  'InventoryValuationSummarySection.tsx',
  'InventoryAgingSection.tsx',
  'ParetoClassificationSection.tsx',
  'ConsumptionAnalyticsSection.tsx',
];

// ---------------------------------------------------------------------
// Validate registry: exactly the 6 expected IDs, nothing else.
// ---------------------------------------------------------------------
assert(
  'export registry contains exactly the 6 expected report IDs',
  expectedReportIds.every((id) => Object.hasOwn(reportRegistry, id))
    && Object.keys(reportRegistry).length === expectedReportIds.length,
);

// ---------------------------------------------------------------------
// Validate that ReportBody.tsx routes only the 6 new IDs.
// ---------------------------------------------------------------------
const reportBody = read('src/components/reports/ReportBody.tsx');
const reportTypes = read('src/types/report.types.ts');

assert(
  'REPORT_CATALOG in src/types/report.types.ts has exactly 6 entries',
  (reportTypes.match(/id: '/g) ?? []).length === 6,
);
assert(
  'REPORT_CATALOG includes each of the 6 new IDs',
  expectedReportIds.every((id) => reportTypes.includes(`'${id}'`)),
);
assert(
  'ReportBody imports all 6 new section components',
  expectedReportIds.length >= 1 && [
    'InventoryStockSection',
    'ConsumptionReportSection',
    'SalesTransfersSection',
    'PurchasesSection',
    'PackagingSection',
    'ReorderPointSection',
  ].every((name) => reportBody.includes(name)),
);

// ---------------------------------------------------------------------
// Validate that none of the 6 new section stub files is missing.
// ---------------------------------------------------------------------
for (const [file, expectedTitle] of Object.entries(sectionTitles)) {
  const text = read(`src/components/reports/${file}.tsx`);
  assert(
    `${file} renders the expected Persian title "${expectedTitle}"`,
    text.includes(`reportName="${expectedTitle}"`),
  );
}

// ---------------------------------------------------------------------
// Validate that every deleted ID AND file is gone from the source tree.
// ---------------------------------------------------------------------
assert(
  'no deleted report ID is referenced in src/types/report.types.ts',
  !deletedReportIds.some((id) => reportTypes.includes(id)),
);
assert(
  'no deleted report ID is referenced in src/components/reports/ReportBody.tsx',
  !deletedReportIds.some((id) => reportBody.includes(id)),
);

const sourceRoots = [
  'src/components/reports/',
  'src/hooks/',
  'src/pages/',
  'src/components/',
  'src/types/',
];
const allHits = [];
for (const rootDir of sourceRoots) {
  for (const file of walkTsFiles(rootDir)) {
    const content = read(file);
    for (const id of deletedReportIds) {
      if (content.includes(id)) {
        allHits.push({ file, id, kind: 'report-id' });
      }
    }
    for (const h of deletedHooks) {
      // Identifier boundary match (import / call / type / property).
      const re = new RegExp(`\\b${h}\\b`);
      if (re.test(content)) {
        allHits.push({ file, id: h, kind: 'hook' });
      }
    }
  }
}
assert(
  'no orphaned reference to a deleted report ID or hook anywhere in src/',
  allHits.length === 0,
);
if (allHits.length > 0) {
  console.error('Orphan hits (sample, first 10):');
  allHits.slice(0, 10).forEach((h) => console.error(`  ${h.file} — ${h.id} [${h.kind}]`));
}

// ---------------------------------------------------------------------
// Validate that deleted section FILES are gone from the disk.
// ---------------------------------------------------------------------
const sectionsDir = resolve(root, 'src/components/reports');
const sectionsPresent = existsSync(sectionsDir)
  ? readdirSync(sectionsDir)
  : [];
for (const gone of deletedSectionFiles) {
  assert(
    `${gone} is removed from src/components/reports/`,
    !sectionsPresent.includes(gone),
  );
}

// ---------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------
console.log(`\nSPA reports guardrail: PASS ${pass} FAIL ${fail}`);
if (fail > 0) process.exit(1);

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
/**
 * Walks a directory tree under `dirRel` and yields files with a `.ts` or
 * `.tsx` extension as POSIX relative paths from the project root. Skips
 * any directory whose name starts with a dot (e.g. `.vite`, `.cache`).
 */
function* walkTsFiles(dirRel) {
  const abs = resolve(root, dirRel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (!st.isDirectory()) return;
  for (const ent of readdirSync(abs, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const childRel = join(dirRel, ent.name);
    if (ent.isDirectory()) {
      yield* walkTsFiles(childRel);
    } else if (ent.isFile() && /\.(ts|tsx)$/.test(ent.name)) {
      // Normalise to POSIX-style slashes for stable output.
      yield childRel.split('\\').join('/');
    }
  }
}
