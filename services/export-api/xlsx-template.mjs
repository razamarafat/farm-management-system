// =====================================================================
// services/export-api/xlsx-template.mjs
//
// Morvarid-Farm — Excel Design System for the export service.
//
// Single source of truth for every .xlsx produced by Morvarid-Farm.
// Adopted by 5 reports (registry.mjs) and any future report. The
// server.mjs buildWorkbook path is now a thin caller of buildReportWorkbook.
//
// Spec (see docs/reports/excel-export-architecture.md §12):
//   1. Workbook metadata — creator + title + subject + company on
//      every .xlsx so corporate IT inventory sees Morvarid-Farm.
//   2. Two-row header band: title row merged across columns, then
//      a header row with wrapText. Bold white text on navy fill.
//   3. Zebra striping — alternating row tint. Right-aligned numerics,
//      centered text.
//   4. Number formats derived from a column-level type tag:
//        currency  → '#,##0" ریال"'  (Persian suffix)
//        qty       → '#,##0.##'
//        integer   → '#,##0'
//        percent   → '0.00%'
//        date      → 'yyyy-mm-dd'
//        plain     → default
//      Suffix-less types render raw; a column.type absent falls back
//      to legacy numeric-key heuristic.
//   5. Frozen pane — first 2 rows (title + header). AutoFilter on the
//      data range. Right-toLeft view for Persian sheets (registry sets).
//   6. Conditional formatting — Pareto ABC class coloring and Aging
//      dataBar on days_since_last_movement. Other reports get neither.
//   7. Totals row — sum formula on declared `totalsColumns` (registry
//      opts in per-report). Empty cells in totals row are blank; SUM
//      is the only formula (no AVERAGE, no COUNT here — kept
//      intentionally minimal per spec §4 "rectangular, consistent
//      formula regions, avoid one-off formulas").
//   8. Reconciliation — a footer line above the totals row when
//      `reconcileColumn` is declared. For the ledger this is the
//      running_balance cumulative difference (last - first row).
//      For valuation/aging it is the row count.
//   9. Dashboard Summary sheet — opt-in via opts.dashboard. Shows
//      workbook title, generated timestamp, filter snapshot, and
//      KPI block (row count + sum totals + ABC distribution for
//      Pareto). When included, becomes sheet 1; data sheet shifts
//      to sheet 2.
//  10. Font — Vazirmatn as the declared name. Excel falls back to a
//      system Persian font (Tahoma / B Nazanin) on machines without
//      Vazirmatn installed. Documented in README + §12. Body cells
//      also use Vazirmatn so layout col widths balance.
// =====================================================================

import ExcelJS from 'exceljs';

// ---------------------------------------------------------------------
// 1. Workbook metadata constants
// ---------------------------------------------------------------------
export const WORKBOOK_META = Object.freeze({
  creator:   'Morvarid-Farm',
  company:   'Morvarid-Farm',
  titlePrefix: 'گزارش — ',        // → «گزارش — گزارش ارزش موجودی»
});

// Sheet name pattern — workbooktitle → `Reports/{persian}`. We keep
// `Reports/` as the data-sheet prefix so multi-sheet workbooks (Dashboard
// + Reports/*) scan-group cleanly in Excel's sheet tab bar.
export const REPORTS_SHEET_PREFIX = 'گزارش — ';

// ---------------------------------------------------------------------
// 2. Color palette — BluBank-themed (matches src/components/ui/Tile).
// Persisted to dobj argb format for ExcelJS per-cell fills.
// ---------------------------------------------------------------------
const COLORS = Object.freeze({
  navy:        'FF1D3557',  // title row fill
  navyDark:    'FF264653',  // header row fill
  borderSoft:  'FFB7E4C7',  // body border tint
  borderHard:  'FFFFFFFF',  // header border tint (white on navy)
  rowTint:     'FFF7FFF7',  // zebra tinted row
  rowBase:     'FFFFFFFF',  // zebra base row
  totalsFill:  'FFE7F3E7',  // totals row tint (light mint)
  reconcileFill:'FFFFF7E0', // reconciliation row tint (light amber)
  lowStock:    'FFFFE8E8',  // soft peach warning fill (qty below threshold)
  balanceNeg:  'FFFCE3DC',  // soft red — running_balance < 0 warning
  paramsSubheaderFill: 'FF0E2A47', // parameters sub-header (matches dashboardTitle)
  paramsLabelFill:     'FFEAF3FA', // parameters label cell  (matches dashboardKpi)
  abcGreen:    'FFD4F4D2',  // ABC 'A' fill
  abcYellow:   'FFFFF1B5',  // ABC 'B' fill
  abcRed:      'FFFCD3CD',  // ABC 'C' fill
  dashboardTitle: 'FF0E2A47', // Dashboard Summary title cell
  dashboardKpi:   'FFEAF3FA', // KPI label cell tint
  dashboardKpiVal:'FF1D3557', // KPI value cell
});

// ---------------------------------------------------------------------
// 3. Number formats — registry + report column.type maps into one of these.
// ---------------------------------------------------------------------
export const NUMERIC_FORMATS = Object.freeze({
  currency: '#,##0" ریال"',
  qty:      '#,##0.##',
  integer:  '#,##0',
  percent:  '0.00%',
  date:     'yyyy-mm-dd',
  plain:    undefined,
});

// ---------------------------------------------------------------------
// 4. Column-type enum mirror (used by registry, defaults to 'plain').
// ---------------------------------------------------------------------
export const COLUMN_TYPES = Object.freeze({
  CURRENCY: 'currency',
  QTY:      'qty',
  INTEGER:  'integer',
  PERCENT:  'percent',
  DATE:     'date',
  PLAIN:    'plain',
});

// Legacy heuristic — numeric-looking column keys without an explicit
// type. Kept as fallback so existing reports keep working unchanged.
const NUMERIC_HINT_KEYS = new Set([
  'qty_in', 'qty_out', 'qty', 'quantity',
  'consumed_qty', 'waste_qty', 'total_qty',
  'voucher_count', 'on_hand_qty',
  'unit_cost', 'total_price', 'unit_price', 'value_rial',
  'basis_metric', 'share_pct', 'cumulative_share_pct',
  'period_qty', 'reorder_point', 'avg_daily_consumption',
  'prior_balance', 'running_balance', 'days_since_last_movement',
]);

const DATE_HINT_KEYS = new Set([
  'txn_date', 'last_movement_date', 'priced_on',
  'voucher_date', 'as_of_date',
]);

const PERCENT_HINT_KEYS = new Set([
  'share_pct', 'cumulative_share_pct',
]);

function classifyColumnLegacy(colKey) {
  // Currency first — the four known ہ-money keys (rial / unit-cost)
  // render with the Persian-suffix format. New reports should declare
  // `column.type = 'currency'` explicitly so this branch can retire.
  if (['unit_cost', 'unit_price', 'total_price', 'value_rial'].includes(colKey)) {
    return COLUMN_TYPES.CURRENCY;
  }
  if (DATE_HINT_KEYS.has(colKey))   return COLUMN_TYPES.DATE;
  if (PERCENT_HINT_KEYS.has(colKey)) return COLUMN_TYPES.PERCENT;
  if (NUMERIC_HINT_KEYS.has(colKey)) return COLUMN_TYPES.QTY;
  return COLUMN_TYPES.PLAIN;
}

function resolveColumnType(column) {
  if (column.type && NUMERIC_FORMATS[column.type] !== undefined) {
    return column.type;
  }
  return classifyColumnLegacy(column.key);
}

// ---------------------------------------------------------------------
// 5. Style atoms — reusable ExcelJS style fragments.
// ---------------------------------------------------------------------
const FONT = Object.freeze({
  title:    { name: 'Vazirmatn', size: 14, bold:  true, color: { argb: 'FFFFFFFF' } },
  header:   { name: 'Vazirmatn', size: 11, bold:  true, color: { argb: 'FFFFFFFF' } },
  body:     { name: 'Vazirmatn', size: 10, bold:  false, color: { argb: 'FF1F1F1F' } },
  totals:   { name: 'Vazirmatn', size: 10, bold:  true,  color: { argb: 'FF1D3557' } },
  recon:    { name: 'Vazirmatn', size: 9,  bold:  true,  color: { argb: 'FF7A5C00' }, italic: true },
  dash:     { name: 'Vazirmatn', size: 12, bold:  true, color: { argb: 'FFFFFFFF' } },
  // Parameters band — frozen top section on data sheets.
  paramsSubheader: { name: 'Vazirmatn', size: 12, bold: true,  color: { argb: 'FFFFFFFF' } },
  paramsLabel:     { name: 'Vazirmatn', size: 10, bold: true,  color: { argb: 'FF1D3557' } },
  paramsValue:     { name: 'Vazirmatn', size: 10, bold: false, color: { argb: 'FF1F1F1F' } },
});

const FONT_DASHBOARD = Object.freeze({
  title:    { name: 'Vazirmatn', size: 16, bold:  true, color: { argb: 'FFFFFFFF' } },
  kpiLabel: { name: 'Vazirmatn', size: 11, bold:  false, color: { argb: 'FF1D3557' } },
  kpiValue: { name: 'Vazirmatn', size: 14, bold:  true, color: { argb: 'FFFFFFFF' } },
  meta:     { name: 'Vazirmatn', size: 10, bold:  false, color: { argb: 'FF555555' } },
});

function bordersAround(colorArgb, style = 'thin') {
  return {
    top:    { style, color: { argb: colorArgb } },
    bottom: { style, color: { argb: colorArgb } },
    left:   { style, color: { argb: colorArgb } },
    right:  { style, color: { argb: colorArgb } },
  };
}

const ALIGN = Object.freeze({
  center:    { horizontal: 'center',    vertical: 'middle', wrapText: true  },
  centerRtl: { horizontal: 'center',    vertical: 'middle', wrapText: true,  readingOrder: 'rtl' },
  right:     { horizontal: 'right',     vertical: 'middle', wrapText: false, readingOrder: 'ltr' },
  left:      { horizontal: 'left',      vertical: 'middle', wrapText: false, readingOrder: 'ltr' },
});

// ---------------------------------------------------------------------
// 6. Cell value coercion — handles booleans (Persian), nulls, Dates.
// ---------------------------------------------------------------------
export function maybeFormat(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean')         return v ? 'بله' : 'خیر';
  if (typeof v === 'number')          return Number.isFinite(v) ? v : '';
  if (v instanceof Date)              return v.toISOString().slice(0, 10);
  return String(v);
}

function formatByType(v, type) {
  if (v === null || v === undefined) return '';
  if (type === COLUMN_TYPES.DATE) {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    // Pass through string dates — ExcelJS parses as date when numFmt set.
    return v;
  }
  return maybeFormat(v);
}

// ---------------------------------------------------------------------
// 7. applyNumberFormat / applyAlignment — apply per-cell style.
// ---------------------------------------------------------------------
export function applyNumberFormat(cell, type) {
  const fmt = NUMERIC_FORMATS[type];
  if (fmt !== undefined) cell.numFmt = fmt;
}

function applyAlignment(cell, type) {
  if (type === COLUMN_TYPES.CURRENCY || type === COLUMN_TYPES.QTY
      || type === COLUMN_TYPES.INTEGER || type === COLUMN_TYPES.PERCENT) {
    cell.alignment = ALIGN.right;
  } else if (type === COLUMN_TYPES.DATE) {
    cell.alignment = ALIGN.center;  // dates visually balanced
  } else {
    cell.alignment = ALIGN.centerRtl;
  }
}

// ---------------------------------------------------------------------
// 8. Header band — title row (merged) + column header row.
// ---------------------------------------------------------------------
function paintTitleRow(ws, columnsLength, titleText) {
  ws.mergeCells(1, 1, 1, columnsLength);
  const title = ws.getCell('A1');
  title.value = WORKBOOK_META.titlePrefix + titleText;
  title.font = FONT.title;
  title.fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy },
  };
  title.alignment = ALIGN.centerRtl;
  title.border = { bottom: { style: 'thin', color: { argb: COLORS.borderHard } } };
  ws.getRow(1).height = 30;
}

function paintHeaderRow(ws, columns, headerRowNumber) {
  const headerRow = ws.getRow(headerRowNumber);
  headerRow.values = columns.map((c) => c.header);
  headerRow.eachCell((cell) => {
    cell.font = FONT.header;
    cell.fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navyDark },
    };
    cell.alignment = ALIGN.centerRtl;
    cell.border = bordersAround(COLORS.borderHard);
  });
  ws.getRow(headerRowNumber).height = 26;
}

// ---------------------------------------------------------------------
// 8b. Parameters band — frozen top section on data sheets.
//
// Layout (when params.length > 0):
//   row 1: title (paintTitleRow)
//   row 2: 'پارامترها' sub-header (merged full-width)
//   rows 3..(2+m): m label/value pairs (label merged across ~27% cols,
//                  value merged across remaining ~73% cols)
//   row (3+m): spacer (height 6) — thin separator
//   row (4+m): column headers (paintHeaderRow)
//
// Returns the row index where the column header goes (4 + m). If
// params is empty, returns null so caller falls back to headerRowNum=2.
//
// Cells use shared FONT.params{Subheader,Label,Value} atoms + the
// dashboard-tile palette (paramsSubheaderFill/paramsLabelFill) so the
// styling is consistent with the Dashboard Summary block.
// ---------------------------------------------------------------------
function paintParametersBlock(ws, columnsLength, params) {
  if (!Array.isArray(params) || params.length === 0) return null;

  // Sub-header band — merged full-width across the data columns.
  ws.mergeCells(2, 1, 2, columnsLength);
  const sub = ws.getCell('A2');
  sub.value = 'پارامترها';
  sub.font = FONT.paramsSubheader;
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.paramsSubheaderFill } };
  sub.alignment = ALIGN.centerRtl;
  sub.border = { bottom: { style: 'thin', color: { argb: COLORS.borderHard } } };
  ws.getRow(2).height = 24;

  // Label / value split — 27% label cells, 73% value cells. Min 1 column
  // each so a single-column report still renders meaningfully (label takes
  // 1 column, value takes the rest).
  const labelCols = Math.max(1, Math.ceil(columnsLength * 0.27));
  const valueCols = Math.max(1, columnsLength - labelCols);

  params.forEach((p, i) => {
    const r = 3 + i;
    const row = ws.getRow(r);
    row.height = 20;
    // Label cells.
    ws.mergeCells(r, 1, r, labelCols);
    const a = row.getCell(1);
    a.value = p.label;
    a.font = FONT.paramsLabel;
    a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.paramsLabelFill } };
    a.alignment = ALIGN.centerRtl;
    a.border = bordersAround(COLORS.borderSoft);
    // Value cells.
    if (valueCols > 0) {
      ws.mergeCells(r, labelCols + 1, r, columnsLength);
      const b = row.getCell(labelCols + 1);
      b.value = p.value;
      b.font = FONT.paramsValue;
      b.alignment = ALIGN.left;
      b.border = bordersAround(COLORS.borderSoft);
    }
  });

  // Spacer row — narrow visual separator between params and headers.
  ws.getRow(3 + params.length).height = 6;

  return 3 + params.length + 1;  // header row index = m + 4
}

// ---------------------------------------------------------------------
// 9. Body rows — alternate tint, type-aware formatting, borders.
// ---------------------------------------------------------------------
function paintBodyRows(ws, columns, rows, firstDataRow) {
  const resolved = columns.map((c) => ({ col: c, type: resolveColumnType(c) }));

  rows.forEach((row, idx) => {
    const excelRowIdx = firstDataRow + idx;
    const excelRow = ws.getRow(excelRowIdx);
    excelRow.values = resolved.map(({ col, type }) =>
      maybeFormatForCell(row[col.key], type),
    );
    const tint = idx % 2 === 1 ? COLORS.rowTint : COLORS.rowBase;
    excelRow.eachCell((cell, colNumber) => {
      const { type } = resolved[colNumber - 1];
      cell.font = FONT.body;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tint } };
      cell.border = bordersAround(COLORS.borderSoft);
      applyAlignment(cell, type);
      applyNumberFormat(cell, type);
    });
    excelRow.height = 20;
  });
}

function maybeFormatForCell(v, type) {
  return formatByType(v, type);
}

// ---------------------------------------------------------------------
// 10. Totals + Reconciliation rows.
//
//   * `totalsColumns`: array of column keys to SUM over the data range.
//   * `reconcileColumn`: optional single column whose (last - first)
//     becomes the reconciliation delta. Spec §4 calls out "reconcile
//     checks" — for the ledger this is running_balance; for valuation
//     it's value_rial (final — first row is informational).
// ---------------------------------------------------------------------
function paintTotalsRow(ws, columns, totalsColumns, firstDataRow, lastDataRow) {
  if (!Array.isArray(totalsColumns) || totalsColumns.length === 0) return;
  const totalsRowIdx = lastDataRow + 1;
  const totalsRow = ws.getRow(totalsRowIdx);

  const totalsKeySet = new Set(totalsColumns);
  columns.forEach((col, idx) => {
    const colNumber = idx + 1;
    const cell = totalsRow.getCell(colNumber);
    if (idx === 0) {
      cell.value = 'جمع';
    } else if (totalsKeySet.has(col.key)) {
      const colLetter = ExcelJS.utils && ExcelJS.utils.encode_col
        ? ExcelJS.utils.encode_col(colNumber - 1)
        : columnNumberToLetters(colNumber);
      // TOTAL: SUM ="<colLetter><firstDataRow>:<colLetter><lastDataRow>"
      // Guard against < 1 numeric rows (SUM over empty range = 0).
      cell.value = {
        formula: `IF(${lastDataRow}>=${firstDataRow},SUM(${colLetter}${firstDataRow}:${colLetter}${lastDataRow}),0)`,
      };
    } else {
      cell.value = '';
    }
    cell.font = FONT.totals;
    cell.fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.totalsFill },
    };
    cell.border = bordersAround(COLORS.borderSoft);
    if (cell.value && typeof cell.value === 'object' && cell.value.formula) {
      const fmt = NUMERIC_FORMATS[resolveColumnType(col)];
      if (fmt !== undefined) cell.numFmt = fmt;
      cell.alignment = ALIGN.right;
    } else if (idx === 0) {
      cell.alignment = ALIGN.centerRtl;
    } else {
      cell.alignment = ALIGN.center;
      cell.font = { ...FONT.body };
    }
  });
  totalsRow.height = 22;
}

function columnNumberToLetters(num) {
  // 1-indexed column number → A, B, …, Z, AA, AB, …. ExcelJS does not
  // export `encode_col` from utils directly in v4, so use a small
  // inline encoder.
  let s = '';
  let n = num;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function paintReconciliationRow(ws, columns, reconcileSpec, firstDataRow, lastDataRow) {
  if (!reconcileSpec || !reconcileSpec.column) return null;
  const reconRowIdx = (lastDataRow || 0) + 2;  // immediately after totals row
  const reconRow = ws.getRow(reconRowIdx);

  const colIdx = columns.findIndex((c) => c.key === reconcileSpec.column);
  if (colIdx < 0) return null;

  columns.forEach((_, idx) => {
    const colNumber = idx + 1;
    const cell = reconRow.getCell(colNumber);
    if (idx === 0) {
      cell.value = reconcileSpec.label || 'کنترل';
    } else if (idx === colIdx) {
      const colLetter = columnNumberToLetters(colNumber);
      cell.value = {
        formula: `IF(OR(${firstDataRow}>${lastDataRow},ISBLANK(${colLetter}${firstDataRow})),"-",${colLetter}${lastDataRow}-${colLetter}${firstDataRow})`,
      };
      const fmt = NUMERIC_FORMATS[resolveColumnType(columns[colIdx])];
      if (fmt !== undefined) cell.numFmt = fmt;
      cell.alignment = ALIGN.right;
    } else {
      cell.value = '';
      cell.alignment = ALIGN.center;
    }
    cell.font = idx === 0 ? FONT.recon : { ...FONT.recon };
    cell.fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.reconcileFill },
    };
    cell.border = bordersAround(COLORS.borderSoft);
  });
  reconRow.height = 22;
  return reconRowIdx;
}

// ---------------------------------------------------------------------
// 11. Conditional formatting — Pareto ABC colors + aging dataBar.
// Spec §2 ("Conditional formatting equivalents"). ExcelJS supports
// type='cellIs', 'colorScale', 'dataBar', 'iconSet'. We stick to the
// cheapest two for v0.
// ---------------------------------------------------------------------
function applyConditionalFormatting(ws, columns, firstDataRow, lastDataRow, opts = {}) {
  const abcIdx = columns.findIndex((c) => c.key === 'abc_class');
  if (abcIdx >= 0 && lastDataRow >= firstDataRow) {
    const range = `${columnNumberToLetters(abcIdx + 1)}${firstDataRow}:${columnNumberToLetters(abcIdx + 1)}${lastDataRow}`;
    ws.addConditionalFormatting({
      ref: range,
      rules: [
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"A"'],
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLORS.abcGreen } } },
          priority: 1,
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"B"'],
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLORS.abcYellow } } },
          priority: 2,
        },
        {
          type: 'cellIs',
          operator: 'equal',
          formulae: ['"C"'],
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLORS.abcRed } } },
          priority: 3,
        },
      ],
    });
  }

  const ageIdx = columns.findIndex((c) => c.key === 'days_since_last_movement');
  if (ageIdx >= 0 && lastDataRow >= firstDataRow) {
    const range = `${columnNumberToLetters(ageIdx + 1)}${firstDataRow}:${columnNumberToLetters(ageIdx + 1)}${lastDataRow}`;
    ws.addConditionalFormatting({
      ref: range,
      rules: [
        {
          type: 'dataBar',
          // ExcelJS DatabarXform.render iterates `rule.cfvo` —
          // missing it crashes writeBuffer with
          // `Cannot read properties of undefined (reading 'forEach')`.
          cfvo: [
            { type: 'min' },
            { type: 'max' },
          ],
          color:     { argb: COLORS.navy },
          gradient:  true,
          showValue: true,
          priority:  1,
        },
      ],
    });
  }

  // Low-stock warning rule — soft peach/peach fill on rows where the
  // declared column ≤ threshold. Spec §3: "highlight low stock items
  // in a soft warning color if threshold is known". Operator-overridable
  // via body.low_stock_threshold; falls back to reportDef.lowStockThreshold.
  // Only applies when both column + threshold are present and finite.
  const lowStockSpec = opts.lowStock;
  if (
    lowStockSpec
    && typeof lowStockSpec.column === 'string'
    && Number.isFinite(lowStockSpec.threshold)
    && lowStockSpec.threshold >= 0
    && lastDataRow >= firstDataRow
  ) {
    const lowIdx = columns.findIndex((c) => c.key === lowStockSpec.column);
    if (lowIdx >= 0) {
      const range = `${columnNumberToLetters(lowIdx + 1)}${firstDataRow}:${columnNumberToLetters(lowIdx + 1)}${lastDataRow}`;
      ws.addConditionalFormatting({
        ref: range,
        rules: [
          {
            type: 'cellIs',
            operator: 'lessThanOrEqual',
            formulae: [String(lowStockSpec.threshold)],
            style: {
              fill: {
                type: 'pattern',
                pattern: 'solid',
                bgColor: { argb: COLORS.lowStock },
              },
            },
            priority: 4,
            stopIfTrue: false,
          },
        ],
      });
    }
  }

  // Low-balance warning rule — soft red on rows where running_balance < 0.
  // Spec §3: "Conditional highlight negative balance rows (soft red)".
  // Audit/traceability: mis-stocked rows (consumption outpaced purchases
  // and the cumulative dipped below zero) become visible without the
  // operator needing to recompute. Distinct color from positive ABC,
  // low-stock, and reconciliation tints so semantics don't collide.
  const lowBalanceSpec = opts.lowBalance;
  if (
    lowBalanceSpec
    && typeof lowBalanceSpec.column === 'string'
    && lastDataRow >= firstDataRow
  ) {
    const lowIdx = columns.findIndex((c) => c.key === lowBalanceSpec.column);
    if (lowIdx >= 0) {
      const range = `${columnNumberToLetters(lowIdx + 1)}${firstDataRow}:${columnNumberToLetters(lowIdx + 1)}${lastDataRow}`;
      ws.addConditionalFormatting({
        ref: range,
        rules: [
          {
            type: 'cellIs',
            operator: 'lessThan',
            formulae: ['0'],
            style: {
              fill: {
                type: 'pattern',
                pattern: 'solid',
                bgColor: { argb: COLORS.balanceNeg },
              },
            },
            priority: 5,
            stopIfTrue: false,
          },
        ],      });
    }
  }
}

// ---------------------------------------------------------------------
// 12. AutoFilter, freeze panes, RTL view — applied per worksheet.
// ---------------------------------------------------------------------
function applyLayout(ws, columnsLength, firstDataRow, lastDataRow, opts) {
  ws.views = [{
    state:        'frozen',
    xSplit:       0,
    ySplit:       firstDataRow - 1,
    rightToLeft:  opts.rtl !== false,
    showGridLines: true,
  }];
  if (lastDataRow >= firstDataRow) {
    ws.autoFilter = {
      from: { row: firstDataRow - 1, column: 1 },
      to:   { row: lastDataRow,        column: columnsLength },
    };
  }
}

function applyColumnWidths(ws, columns) {
  ws.columns = columns.map((c) => ({
    key:   c.key,
    width: typeof c.width === 'number' ? c.width : 14,
  }));
}

// ---------------------------------------------------------------------
// 13. Workbook-level metadata (ExcelJS Workbook properties).
// ---------------------------------------------------------------------
function setWorkbookMeta(wb, reportDef) {
  wb.creator   = WORKBOOK_META.creator;
  wb.company   = WORKBOOK_META.company;
  wb.created   = new Date();
  wb.modified  = new Date();
  wb.title     = reportDef.title;
  wb.subject   = reportDef.sheetName;
}

// ---------------------------------------------------------------------
// 14. Dashboard Summary sheet — opt-in via opts.dashboard=true.
//
// Layout:
//   Row 1 — title bar (merged).
//   Rows 3-7 — KPI block:
//     • Workbook title    (label + value)
//     • Generated at      (label + Persian-formatted timestamp)
//     • Report id / Persian name
//     • Filter snapshot   (date range, farm, category)
//   Rows 9+ — KPI numbers:
//     • Row count
//     • Total rows for currency/y columns (sum from data sheet → formula links)
//     • ABC distribution for Pareto
//   Specialty: the data values link back to the data sheet via
//   =Reports/<sheet>!<addr> formulas so the dashboard auto-updates if
//   the operator edits a numeric cell in the data tab.
// ---------------------------------------------------------------------
function addDashboardSheet(wb, reportDef, dataSheetName, rows, opts) {
  const ws = wb.addWorksheet('داشبورد', {
    views: [{ state: 'frozen', ySplit: 2, rightToLeft: true }],
  });

  // Title bar
  ws.mergeCells('A1:D1');
  const title = ws.getCell('A1');
  title.value = 'داشبورد خلاصه — ' + reportDef.title;
  title.font = FONT_DASHBOARD.title;
  title.fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.dashboardTitle },
  };
  title.alignment = ALIGN.centerRtl;
  title.border = { bottom: { style: 'thin', color: { argb: COLORS.borderHard } } };
  ws.getRow(1).height = 30;

  // Meta block
  const metaRows = [
    ['شناسه گزارش',            reportDef.id || reportDef.rpcName],
    ['نام برگه',                dataSheetName],
    ['تعداد ردیف',              String(rows.length)],
    ['تاریخ تولید',             new Date().toLocaleString('fa-IR')],
  ];
  metaRows.forEach(([label, value], i) => {
    const r = 3 + i;
    const a = ws.getCell(`A${r}`);
    const b = ws.getCell(`B${r}`);
    a.value = label;
    b.value = value;
    a.font = FONT_DASHBOARD.kpiLabel;
    b.font = FONT_DASHBOARD.meta;
    a.fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.dashboardKpi },
    };
    a.alignment = ALIGN.centerRtl;
    b.alignment = ALIGN.left;
    a.border = bordersAround(COLORS.borderSoft);
    b.border = bordersAround(COLORS.borderSoft);
    ws.getRow(r).height = 22;
  });

  // KPI numbers — link to data sheet via formulas.
  const firstDataRow = 3;                    // matches data sheet layout
  const lastDataRow = rows.length + 2;       // data sheet: title=1, header=2, data starts at 3
  const kpis = [];

  // 1) Always: row count.
  kpis.push({
    label: 'تعداد ردیف‌ها',
    formula: `COUNTA('${dataSheetName}'!A${firstDataRow}:A${lastDataRow})`,
  });

  // 2) Currency / qty totals — declared totalsColumns.
  if (Array.isArray(reportDef.totalsColumns)) {
    reportDef.totalsColumns.forEach((key) => {
      const idx = reportDef.columns.findIndex((c) => c.key === key);
      if (idx < 0) return;
      const colLetter = columnNumberToLetters(idx + 1);
      kpis.push({
        label: 'جمع ' + (reportDef.columns[idx].header || key),
        formula: `IF(${lastDataRow}>=${firstDataRow},SUM('${dataSheetName}'!${colLetter}${firstDataRow}:${colLetter}${lastDataRow}),0)`,
      });
    });
  }

  // 3) Pareto ABC counts.
  if (reportDef.id === 'RPT_PARETO_CLASSIFICATION') {
    const abcIdx = reportDef.columns.findIndex((c) => c.key === 'abc_class');
    if (abcIdx >= 0) {
      const colLetter = columnNumberToLetters(abcIdx + 1);
      ['A', 'B', 'C'].forEach((cls) => {
        kpis.push({
          label: `تعداد کلاس ${cls}`,
          formula: `COUNTIF('${dataSheetName}'!${colLetter}${firstDataRow}:${colLetter}${lastDataRow},"${cls}")`,
        });
      });
    }
  }

  // Render the KPI block.
  const kpiStartRow = 8;
  kpis.forEach((kpi, i) => {
    const r = kpiStartRow + i;
    const a = ws.getCell(`A${r}`);
    const b = ws.getCell(`B${r}`);
    a.value = kpi.label;
    b.value = { formula: kpi.formula };
    a.font = FONT_DASHBOARD.kpiLabel;
    b.font = FONT_DASHBOARD.kpiValue;
    a.fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.dashboardKpi },
    };
    b.fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.dashboardKpiVal },
    };
    a.alignment = ALIGN.centerRtl;
    b.alignment = ALIGN.right;
    a.border = bordersAround(COLORS.borderSoft);
    b.border = bordersAround(COLORS.borderSoft);
    ws.getRow(r).height = 24;
    b.numFmt = NUMERIC_FORMATS.integer;
  });

  applyColumnWidths(ws, [
    { key: 'label', width: 28 },
    { key: 'value', width: 26 },
    { key: 'extra1', width: 14 },
    { key: 'extra2', width: 14 },
  ]);

  // Optional Top-N block — shown when reportDef.topN is set.
  // Layout: sub-header (merged across topN.columns length) →
  //         column headers → N rows of direct cell-ref formulas
  //         pointing back at the (server-side sorted) data sheet.
  // Provides CEO "top 10 by value" view in Dashboard Summary form.
  if (reportDef.topN && Array.isArray(reportDef.topN.columns) && rows.length > 0) {
    const topCols = reportDef.topN.columns
      .map((k) => reportDef.columns.find((c) => c.key === k))
      .filter(Boolean);
    if (topCols.length > 0) {
      const N = Math.max(1, Math.min(reportDef.topN.n ?? 10, rows.length));
      const blockStart = kpiStartRow + kpis.length + 2; // blank spacer row
      // Sub-header band.
      ws.mergeCells(blockStart, 1, blockStart, topCols.length);
      const sub = ws.getCell(blockStart, 1);
      sub.value = reportDef.topN.label || `برترین ${N} مورد`;
      sub.font = FONT_DASHBOARD.title;
      sub.fill = {
        type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.dashboardTitle },
      };
      sub.alignment = ALIGN.centerRtl;
      sub.border = { bottom: { style: 'thin', color: { argb: COLORS.borderHard } } };
      ws.getRow(blockStart).height = 28;

      // Column headers row.
      const headerRowIdx = blockStart + 1;
      topCols.forEach((col, j) => {
        const cell = ws.getCell(headerRowIdx, j + 1);
        cell.value = col.header || col.key;
        cell.font = FONT.header;
        cell.fill = {
          type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navyDark },
        };
        cell.alignment = ALIGN.centerRtl;
        cell.border = bordersAround(COLORS.borderHard);
      });
      ws.getRow(headerRowIdx).height = 24;

      // N data rows — direct refs back to the data sheet.
      topCols.forEach((col, j) => {
        const colIdx = reportDef.columns.findIndex((c) => c.key === col.key);
        if (colIdx < 0) return;
        const colLetter = columnNumberToLetters(colIdx + 1);
        for (let i = 0; i < N; i++) {
          const dataRowNumber = firstDataRow + i;
          const cell = ws.getCell(headerRowIdx + 1 + i, j + 1);
          cell.value = {
            formula: `'${dataSheetName}'!${colLetter}${dataRowNumber}`,
          };
          cell.font = FONT.body;
          cell.alignment = (col.key === 'value_rial' || col.key === 'unit_cost')
            ? ALIGN.right
            : ALIGN.centerRtl;
          const type = resolveColumnType(col);
          const fmt = NUMERIC_FORMATS[type];
          if (fmt !== undefined) cell.numFmt = fmt;
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: i % 2 === 1 ? COLORS.rowTint : COLORS.rowBase },
          };
          cell.border = bordersAround(COLORS.borderSoft);
        }
      });
    }
  }
}

// ---------------------------------------------------------------------
// 15. Main entry — buildReportWorkbook.
//
//   reportDef.columns      (required) — Column[] with header + key + width
//   reportDef.title + sheetName
//   reportDef.totalsColumns?: string[]   — registry opts columns to SUM
//   reportDef.reconcileColumn?: { column: string, label?: string }
//   reportDef.id?: string                  — used in dashboard title
//   rows: Array<Record<string, unknown>>
//   opts.dashboard?: boolean               — prepend Dashboard Summary sheet
//
//   Returns Promise<Buffer> — .xlsx file body.
// ---------------------------------------------------------------------
export async function buildReportWorkbook(reportDef, rows, opts = {}) {
  if (opts.stream) {
    return buildReportWorkbookStreaming(reportDef, rows, opts);
  }

  const wb = new ExcelJS.Workbook();
  setWorkbookMeta(wb, reportDef);

  const dataSheetName = REPORTS_SHEET_PREFIX + reportDef.sheetName;
  const ws = wb.addWorksheet(dataSheetName);

  if (opts.dashboard) addDashboardSheet(wb, reportDef, dataSheetName, rows, opts);

  // Title row + dynamic header row offset from optional Parameters band.
  paintTitleRow(ws, reportDef.columns.length, reportDef.title);
  const headerRowNum = paintParametersBlock(ws, reportDef.columns.length, opts.parameters) || 2;
  paintHeaderRow(ws, reportDef.columns, headerRowNum);

  const firstDataRow = headerRowNum + 1;
  const lastDataRow  = rows.length + headerRowNum;

  if (rows.length > 0) {
    paintBodyRows(ws, reportDef.columns, rows, firstDataRow);
  }
  applyColumnWidths(ws, reportDef.columns);

  if (rows.length > 0) {
    paintTotalsRow(ws, reportDef.columns, reportDef.totalsColumns, firstDataRow, lastDataRow);
    paintReconciliationRow(
      ws, reportDef.columns, reportDef.reconcileColumn,
      firstDataRow, lastDataRow,
    );
    applyConditionalFormatting(
      ws, reportDef.columns, firstDataRow, lastDataRow,
      {
        lowStock: reportDef.lowStockColumn
          ? {
              column:   reportDef.lowStockColumn,
              threshold: opts.lowStockThreshold ?? reportDef.lowStockThreshold,
            }
          : null,
        lowBalance: reportDef.lowBalanceColumn
          ? { column: reportDef.lowBalanceColumn }
          : null,
      },
    );
  }

  // Layout: freeze + RTL + filter. ySplit = firstDataRow - 1 (title + header + params).
  applyLayout(ws, reportDef.columns.length, firstDataRow, lastDataRow, { rtl: true });

  return wb.xlsx.writeBuffer();
}

// ---------------------------------------------------------------------
// 14b. Multi-sheet workbook — pivot-ready raw + formula analysis.
//
// Triggered when reportDef.kind === 'multi-sheet'. The defining
// characteristic is TWO primary data sheets:
//   - Sheet 1 = "rawSheetName" (e.g. 'مصرف (خام)') — pure data, no
//     merged cells anywhere so Excel's Insert PivotTable works on
//     Ctrl+A. Row 1 IS the column header; no title bar.
//   - Sheet 2 = "analysisSheetName" (e.g. 'تحلیل') — title band +
//     rectangular SUMIFS blocks keyed by the single axis shared across
//     every p_group_by branch (item_category), plus waste_ratio +
//     variance_flag column.
//
// The dashboard sheet is intentionally NOT supported in multi-sheet
// mode — operators reading a 2-tab analytical export don't need the
// redundant KPI sheet that addDashboardSheet provides for single-sheet
// reports. If a future caller wants one, they can pass opts.dashboard
// and we'll honor it (the dashboard still links back to a named data
// sheet via the second sheet's name).
// ---------------------------------------------------------------------
export async function buildMultiReportWorkbook(reportDef, rows, opts = {}) {
  const wb = new ExcelJS.Workbook();
  setWorkbookMeta(wb, reportDef);

  const rawSheetName = reportDef.rawSheetName || 'خام';
  const analysisSheetName = reportDef.analysisSheetName || 'تحلیل';

  const rawWs = wb.addWorksheet(rawSheetName);
  paintPivotReadySheet(rawWs, reportDef.columns, rows);

  const analysisWs = wb.addWorksheet(analysisSheetName);
  paintAnalysisSheet(analysisWs, rawSheetName, reportDef, rows, opts);

  if (opts.dashboard) {
    addDashboardSheet(wb, reportDef, rawSheetName, rows, opts);
  }
  return wb.xlsx.writeBuffer();
}

// Pivot-ready raw sheet. NO merged cells anywhere so the user can
// Ctrl+A → Insert PivotTable without manual range selection. Row 1 is
// the column header (NO title row — avoids even a single-cell merge
// that would break the pivot's auto-range detection).
function paintPivotReadySheet(ws, columns, rows) {
  // Column header at row 1.
  const headerRow = ws.getRow(1);
  headerRow.values = columns.map((c) => c.header);
  headerRow.eachCell((cell) => {
    cell.font = FONT.header;
    cell.fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navyDark },
    };
    cell.alignment = ALIGN.centerRtl;
    cell.border = bordersAround(COLORS.borderHard);
  });
  ws.getRow(1).height = 26;
  // Body rows from row 2.
  if (rows.length > 0) {
    paintBodyRows(ws, columns, rows, 2);
  }
  applyColumnWidths(ws, columns);
  // Freeze just the header row. ySplit=1.
  ws.views = [{
    state:        'frozen',
    xSplit:       0,
    ySplit:       1,
    rightToLeft:  true,
    showGridLines: true,
  }];
  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to:   { row: rows.length + 1, column: columns.length },
    };
  }
}

// Analysis sheet — title row + ONE category-row per distinct item_category.
// Category-row layout is a rectangular SUMIFS block (one column per
// analysisColumns key, all formulas point at the raw sheet). The
// waste_ratio + variance_flag columns give operators an at-a-glance
// "which category is wasting too much" signal without having to
// recompute.
//   - Block starts at row 3 (row 1 = title / row 2 = column header).
//   - Categories are derived from the raw rows on the SERVER side in
//     server.mjs (opts.analysisRows) so this function just paints a
//     rectangular block — no client-side category discovery.
function paintAnalysisSheet(ws, rawSheetName, reportDef, rawRows, opts) {
  const analysisCols = Array.isArray(reportDef.analysisColumns)
    ? reportDef.analysisColumns
    : [];
  const formattedRows = Array.isArray(opts && opts.analysisRows)
    ? opts.analysisRows
    : [];
  // Title row.
  ws.mergeCells(1, 1, 1, analysisCols.length);
  const title = ws.getCell('A1');
  title.value = WORKBOOK_META.titlePrefix + (reportDef.title || '');
  title.font = FONT.title;
  title.fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy },
  };
  title.alignment = ALIGN.centerRtl;
  title.border = { bottom: { style: 'thin', color: { argb: COLORS.borderHard } } };
  ws.getRow(1).height = 30;

  if (formattedRows.length === 0) return;

  // Column header at row 2.
  const headerRow = ws.getRow(2);
  headerRow.values = analysisCols.map((c) => c.header);
  headerRow.eachCell((cell) => {
    cell.font = FONT.header;
    cell.fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navyDark },
    };
    cell.alignment = ALIGN.centerRtl;
    cell.border = bordersAround(COLORS.borderHard);
  });
  ws.getRow(2).height = 26;

  // Find raw-sheet column letters for the SUMIFS keys.
  const rawCatLetter = columnNumberToLetters(
    reportDef.columns.findIndex((c) => c.key === 'item_category') + 1,
  );
  const rawConsumedLetter = columnNumberToLetters(
    reportDef.columns.findIndex((c) => c.key === 'consumed_qty') + 1,
  );
  const rawWasteLetter = columnNumberToLetters(
    reportDef.columns.findIndex((c) => c.key === 'waste_qty') + 1,
  );
  const rawTotalLetter = columnNumberToLetters(
    reportDef.columns.findIndex((c) => c.key === 'total_qty') + 1,
  );
  const rawVoucherLetter = columnNumberToLetters(
    reportDef.columns.findIndex((c) => c.key === 'voucher_count') + 1,
  );
  // Raw data range — rows.length rows starting at row 2 (Column header row 1, body row 2..).
  const rawDataStart = 2;
  const rawDataEnd = rawRows.length + 1;
  const rawCatRange = `'${rawSheetName}'!$${rawCatLetter}$${rawDataStart}:$${rawCatLetter}$${rawDataEnd}`;
  const rawConsumedRange = `'${rawSheetName}'!$${rawConsumedLetter}$${rawDataStart}:$${rawConsumedLetter}$${rawDataEnd}`;
  const rawWasteRange = `'${rawSheetName}'!$${rawWasteLetter}$${rawDataStart}:$${rawWasteLetter}$${rawDataEnd}`;
  const rawTotalRange = `'${rawSheetName}'!$${rawTotalLetter}$${rawDataStart}:$${rawTotalLetter}$${rawDataEnd}`;
  const rawVoucherRange = `'${rawSheetName}'!$${rawVoucherLetter}$${rawDataStart}:$${rawVoucherLetter}$${rawDataEnd}`;

  // Rectangular SUMIFS block — one data row per category.
  const threshold = Number.isFinite(reportDef.varianceThreshold)
    ? reportDef.varianceThreshold
    : 0.15;
  formattedRows.forEach((fmtRow, idx) => {
    const r = 3 + idx;
    const row = ws.getRow(r);
    row.height = 20;
    const tint = idx % 2 === 1 ? COLORS.rowTint : COLORS.rowBase;
    analysisCols.forEach((col, j) => {
      const cell = row.getCell(j + 1);
      cell.font = FONT.body;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tint } };
      cell.border = bordersAround(COLORS.borderSoft);
      switch (col.key) {
        case 'category':
          cell.value = fmtRow.category;
          cell.alignment = ALIGN.centerRtl;
          break;
        case 'consumed_sum':
          cell.value = {
            formula: `SUMIFS(${rawConsumedRange},${rawCatRange},A${r})`,
          };
          cell.numFmt = NUMERIC_FORMATS.qty;
          cell.alignment = ALIGN.right;
          break;
        case 'waste_sum':
          cell.value = {
            formula: `SUMIFS(${rawWasteRange},${rawCatRange},A${r})`,
          };
          cell.numFmt = NUMERIC_FORMATS.qty;
          cell.alignment = ALIGN.right;
          break;
        case 'total_sum':
          cell.value = {
            formula: `SUMIFS(${rawTotalRange},${rawCatRange},A${r})`,
          };
          cell.numFmt = NUMERIC_FORMATS.qty;
          cell.alignment = ALIGN.right;
          break;
        case 'voucher_sum':
          cell.value = {
            formula: `SUMIFS(${rawVoucherRange},${rawCatRange},A${r})`,
          };
          cell.numFmt = NUMERIC_FORMATS.integer;
          cell.alignment = ALIGN.right;
          break;
        case 'waste_ratio': {
          // =IF(total_sum=0,0,waste_sum/total_sum) — guard zero-amount rows.
          const wLetter = columnNumberToLetters(analysisCols.findIndex((c) => c.key === 'waste_sum') + 1);
          const tLetter = columnNumberToLetters(analysisCols.findIndex((c) => c.key === 'total_sum') + 1);
          cell.value = {
            formula: `IF(${tLetter}${r}=0,0,${wLetter}${r}/${tLetter}${r})`,
          };
          cell.numFmt = NUMERIC_FORMATS.percent;
          cell.alignment = ALIGN.right;
          break;
        }
        case 'variance_flag': {
          const rLetter = columnNumberToLetters(analysisCols.findIndex((c) => c.key === 'waste_ratio') + 1);
          cell.value = {
            // Persian conventions — replace Latin "OK" with a Persian
            // marker so the rendered cell reads naturally inside an
            // RTL Persian sheet. "OK" → "بله" (yes); the warning
            // branch keeps its existing "⚠ " marker. (Audit Known
            // Limitations #6 followup — letter-substitution cosmetic
            // realigned with Persian conventions.)
            formula: `IF(${rLetter}${r}>${threshold},"⚠ ","بله")`,
          };
          cell.alignment = ALIGN.centerRtl;
          break;
        }
        default:
          cell.value = fmtRow[col.key];
          cell.alignment = ALIGN.centerRtl;
      }
    });
  });

  // Totals row + cross-sheet checksum (online-totals parity check).
  const totalsRowIdx = 3 + formattedRows.length;
  const totalsRow = ws.getRow(totalsRowIdx);
  totalsRow.height = 22;
  analysisCols.forEach((col, j) => {
    const cell = totalsRow.getCell(j + 1);
    cell.font = FONT.totals;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.totalsFill } };
    cell.border = bordersAround(COLORS.borderSoft);
    if (j === 0) {
      cell.value = 'جمع کل';
      cell.alignment = ALIGN.centerRtl;
      return;
    }
    if (['consumed_sum', 'waste_sum', 'total_sum', 'voucher_sum'].includes(col.key)) {
      const dataStart = 3;
      const dataEnd = 3 + formattedRows.length - 1;
      const letter = columnNumberToLetters(j + 1);
      const fmt = col.key === 'voucher_sum' ? NUMERIC_FORMATS.integer : NUMERIC_FORMATS.qty;
      cell.value = {
        formula: `IF(${dataEnd}>=${dataStart},SUM(${letter}${dataStart}:${letter}${dataEnd}),0)`,
      };
      cell.numFmt = fmt;
      cell.alignment = ALIGN.right;
    } else if (col.key === 'waste_ratio') {
      const wLetter = columnNumberToLetters(analysisCols.findIndex((c) => c.key === 'waste_sum') + 1);
      const tLetter = columnNumberToLetters(analysisCols.findIndex((c) => c.key === 'total_sum') + 1);
      cell.value = {
        formula: `IF(${tLetter}${totalsRowIdx}=0,0,${wLetter}${totalsRowIdx}/${tLetter}${totalsRowIdx})`,
      };
      cell.numFmt = NUMERIC_FORMATS.percent;
      cell.alignment = ALIGN.right;
    } else if (col.key === 'variance_flag') {
      // Overall variance verdict — if ANY per-category waste_ratio > threshold.
      const rLetter = columnNumberToLetters(analysisCols.findIndex((c) => c.key === 'waste_ratio') + 1);
      cell.value = {
        // Persian conventions — "OK" → "بله" (audit Known Limitations
        // #6 followup; see per-row variance_flag case above).
        formula: `IF(COUNTIF(${rLetter}${3}:${rLetter}${3 + formattedRows.length - 1},">"&${threshold})>0,"⚠ ","بله")`,
      };
      cell.alignment = ALIGN.centerRtl;
    } else {
      cell.value = '';
      cell.alignment = ALIGN.center;
    }
  });

  // Cross-sheet parity check row — SUMIFS-style invariant: the analysis-sheet
  // total for consumed/waste/total MUST equal the sum of the raw-sheet rows.
  // Surface as a verification cell so operators see parity directly. Cells
  // use the reconcileFill to flag if values drift.
  const parityRowIdx = totalsRowIdx + 2;
  const parityRow = ws.getRow(parityRowIdx);
  parityRow.height = 22;
  // First cell — label.
  const pLabel = parityRow.getCell(1);
  pLabel.value = 'کنترل برابری (تحلیل ↔ خام)';
  pLabel.font = FONT.recon;
  pLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.reconcileFill } };
  pLabel.border = bordersAround(COLORS.borderSoft);
  pLabel.alignment = ALIGN.centerRtl;
  // SUM-based parity for each sum column.
  ['consumed_sum', 'waste_sum', 'total_sum'].forEach((key) => {
    const colIdx = analysisCols.findIndex((c) => c.key === key);
    if (colIdx < 0) return;
    const aLetter = columnNumberToLetters(colIdx + 1);
    const rawSum = `SUM('${rawSheetName}'!${rawConsumedLetter.replace(rawConsumedLetter, key === 'consumed_sum' ? rawConsumedLetter : key === 'waste_sum' ? rawWasteLetter : rawTotalLetter)}${rawDataStart}:${key === 'consumed_sum' ? rawConsumedLetter : key === 'waste_sum' ? rawWasteLetter : rawTotalLetter}${rawDataEnd})`;
    const cell = parityRow.getCell(colIdx + 1);
    cell.value = {
      // Persian conventions — "OK" → "مطابق" (matching/parity). The
      // mismatch branch keeps its existing "⚠ عدم تطابق" Persian
      // marker. (Audit Known Limitations #6 followup.)
      formula: `IF(${aLetter}${totalsRowIdx}=${rawSum},"مطابق","⚠ عدم تطابق")`,
    };
    cell.font = FONT.body;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.reconcileFill } };
    cell.border = bordersAround(COLORS.borderSoft);
    cell.alignment = ALIGN.centerRtl;
  });
  // Other cells — empty / blank.
  analysisCols.forEach((col, j) => {
    if (['consumed_sum', 'waste_sum', 'total_sum'].includes(col.key)) return;
    if (j === 0) return; // label already set
    const cell = parityRow.getCell(j + 1);
    cell.value = '';
    cell.font = FONT.body;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.reconcileFill } };
    cell.border = bordersAround(COLORS.borderSoft);
    cell.alignment = ALIGN.center;
  });

  applyColumnWidths(ws, analysisCols);
  // Freeze title + header.
  ws.views = [{
    state:        'frozen',
    xSplit:       0,
    ySplit:       2,
    rightToLeft:  true,
    showGridLines: true,
  }];
  if (formattedRows.length > 0) {
    ws.autoFilter = {
      from: { row: 2, column: 1 },
      to:   { row: 2 + formattedRows.length, column: analysisCols.length },
    };
  }
}

// WorkbookWriter streaming path. Uses node:stream.PassThrough so the
// caller still sees a Buffer (matching the in-memory API). Activated
// when rows.length ≥ reportDef.streamingThreshold. Bounds peak memory
// on large multi-farm cross-item exports. WorkbookWriter's worksheets
// expose the same mergeCells / getCell / addConditionalFormatting /
// views / autoFilter APIs as regular Worksheets, so the same
// composition (paintTitleRow / paintParametersBlock / paintHeaderRow /
// paintBodyRows / applyConditionalFormatting / applyLayout) works
// uniformly on both paths.
async function buildReportWorkbookStreaming(reportDef, rows, opts = {}) {
  const { PassThrough } = await import('node:stream');
  const out = new PassThrough();
  const chunks = [];
  out.on('data', (c) => chunks.push(c));
  const finished = new Promise((resolve, reject) => {
    out.on('end', () => resolve(Buffer.concat(chunks)));
    out.on('error', reject);
  });

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter(out, {
    useStyles: true,
    useSharedStrings: true,
  });

  const dataSheetName = REPORTS_SHEET_PREFIX + reportDef.sheetName;
  const ws = wb.addWorksheet(dataSheetName);

  if (opts.dashboard) addDashboardSheet(wb, reportDef, dataSheetName, rows, opts);

  paintTitleRow(ws, reportDef.columns.length, reportDef.title);
  const headerRowNum = paintParametersBlock(ws, reportDef.columns.length, opts.parameters) || 2;
  paintHeaderRow(ws, reportDef.columns, headerRowNum);

  const firstDataRow = headerRowNum + 1;
  const lastDataRow  = rows.length + headerRowNum;

  if (rows.length > 0) {
    paintBodyRows(ws, reportDef.columns, rows, firstDataRow);
  }
  applyColumnWidths(ws, reportDef.columns);

  if (rows.length > 0) {
    paintTotalsRow(ws, reportDef.columns, reportDef.totalsColumns, firstDataRow, lastDataRow);
    paintReconciliationRow(
      ws, reportDef.columns, reportDef.reconcileColumn,
      firstDataRow, lastDataRow,
    );
    applyConditionalFormatting(
      ws, reportDef.columns, firstDataRow, lastDataRow,
      {
        lowStock: reportDef.lowStockColumn
          ? {
              column:   reportDef.lowStockColumn,
              threshold: opts.lowStockThreshold ?? reportDef.lowStockThreshold,
            }
          : null,
        lowBalance: reportDef.lowBalanceColumn
          ? { column: reportDef.lowBalanceColumn }
          : null,
      },
    );
  }

  applyLayout(ws, reportDef.columns.length, firstDataRow, lastDataRow, { rtl: true });

  await ws.commit();
  await wb.commit();
  return finished;
}

export const __testing = {
  COLUMN_TYPES,
  NUMERIC_FORMATS,
  WORKBOOK_META,
  COLORS,
  NOMINAL_HINTS: NUMERIC_HINT_KEYS,
  classifyColumnLegacy,
  resolveColumnType,
  maybeFormat,
  applyNumberFormat,
};
