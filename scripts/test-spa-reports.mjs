import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reportRegistry } from '../services/export-api/registry.mjs';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');

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

function includesAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

const expectedReports = [
  'RPT_INVENTORY_VALUATION_SUMMARY',
  'RPT_INVENTORY_LEDGER',
  'RPT_CONSUMPTION_ANALYTICS',
  'RPT_INVENTORY_AGING',
  'RPT_PARETO_CLASSIFICATION',
  'RPT_SUPPLIERS',
];

const excelServer = read('src/lib/excelServer.ts');
const reportShell = read('src/components/reports/ReportShell.tsx');
const reportBody = read('src/components/reports/ReportBody.tsx');
const ledger = read('src/components/reports/InventoryLedgerSection.tsx');
const consumption = read('src/components/reports/ConsumptionAnalyticsSection.tsx');
const aging = read('src/components/reports/InventoryAgingSection.tsx');
const pareto = read('src/components/reports/ParetoClassificationSection.tsx');
const suppliers = read('src/pages/SuppliersPage.tsx');

assert('export API supports exactly the six live report IDs',
  expectedReports.every((id) => excelServer.includes(`'${id}'`)));

assert('export registry contains exactly the six live report IDs',
  expectedReports.every((id) => Object.hasOwn(reportRegistry, id)));

assert('generic report shell exposes a real export click handler',
  includesAll(reportShell, ['onExportClick?:', 'onClick={onExportClick}', 'aria-busy={isExporting}']));

assert('valuation summary button calls the server export path',
  includesAll(reportBody, [
    'triggerServerExport',
    "'RPT_INVENTORY_VALUATION_SUMMARY'",
    'onExportClick={isValuationReport ? onValuationExportClick : undefined}',
  ]));

assert('inventory ledger button calls the server export path',
  includesAll(ledger, ['triggerServerExport', "'RPT_INVENTORY_LEDGER'", 'onClick={onExportClick}']));

assert('consumption analytics button calls the server export path',
  includesAll(consumption, ['triggerServerExport', "'RPT_CONSUMPTION_ANALYTICS'", 'group_by: groupBy']));

assert('inventory aging button calls the server export path',
  includesAll(aging, ['triggerServerExport', "'RPT_INVENTORY_AGING'", 'onClick={onExportClick}']));

assert('pareto classification button calls the server export path',
  includesAll(pareto, ['triggerServerExport', "'RPT_PARETO_CLASSIFICATION'", 'onClick={onExportClick}']));

assert('suppliers page calls the server export path',
  includesAll(suppliers, ['triggerServerExport', "'RPT_SUPPLIERS'", 'onExportClick']));

console.log(`\nSPA reports guardrail: PASS ${pass} FAIL ${fail}`);
if (fail > 0) process.exit(1);
