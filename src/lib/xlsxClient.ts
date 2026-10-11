// =====================================================================
// src/lib/xlsxClient.ts
//
// Client-side native OpenXML (.xlsx) generator with ZERO external dependencies.
// Produces 100% valid .xlsx ZIP archives with:
//   - Right-To-Left (RTL) view for Persian spreadsheets
//   - Proper UTF-8 string encoding
//   - Title, subtitle / metadata banner
//   - Styled header row (BluBank/Morvarid theme)
//   - Auto-computed column widths
//   - Number formats (numbers vs strings)
//   - Totals row
//   - Direct browser download
// =====================================================================

export interface XlsxColumn {
  key: string;
  header: string;
  width?: number;
  isNumeric?: boolean;
}

export interface XlsxExportOptions {
  filename: string;
  sheetName?: string;
  title?: string;
  subtitle?: string;
  columns: XlsxColumn[];
  data: Record<string, unknown>[];
  totals?: Record<string, string | number>;
}

// ────────────────────────────────────────────────────────────────────
// CRC32 implementation for standard PKZIP
// ────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escapeXml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colLetter(index: number): string {
  let letter = '';
  let temp = index;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

// Build standard ZIP archive buffer
function createZip(files: { name: string; data: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const fileEntries: { nameBytes: Uint8Array; dataBytes: Uint8Array; crc: number; offset: number }[] = [];
  
  let totalSize = 0;
  for (const f of files) {
    const nameBytes = encoder.encode(f.name);
    const dataBytes = encoder.encode(f.data);
    const crc = crc32(dataBytes);
    fileEntries.push({ nameBytes, dataBytes, crc, offset: 0 });
    // Local header (30 + name.length) + data
    totalSize += 30 + nameBytes.length + dataBytes.length;
  }

  const centralDirStart = totalSize;
  let centralDirSize = 0;
  for (const e of fileEntries) {
    // Central dir entry (46 + name.length)
    centralDirSize += 46 + e.nameBytes.length;
  }
  totalSize += centralDirSize + 22; // + End of central directory record (22)

  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);
  let pos = 0;

  // 1. Write Local File Headers & Data
  for (const e of fileEntries) {
    e.offset = pos;
    view.setUint32(pos, 0x04034b50, true); pos += 4; // signature
    view.setUint16(pos, 20, true); pos += 2;         // version needed (2.0)
    view.setUint16(pos, 0x0800, true); pos += 2;     // flags: UTF-8
    view.setUint16(pos, 0, true); pos += 2;          // compression: 0 (store)
    view.setUint16(pos, 0, true); pos += 2;          // mod time
    view.setUint16(pos, 0, true); pos += 2;          // mod date
    view.setUint32(pos, e.crc, true); pos += 4;       // crc32
    view.setUint32(pos, e.dataBytes.length, true); pos += 4; // compressed size
    view.setUint32(pos, e.dataBytes.length, true); pos += 4; // uncompressed size
    view.setUint16(pos, e.nameBytes.length, true); pos += 2; // filename length
    view.setUint16(pos, 0, true); pos += 2;          // extra field length
    out.set(e.nameBytes, pos); pos += e.nameBytes.length;
    out.set(e.dataBytes, pos); pos += e.dataBytes.length;
  }

  // 2. Write Central Directory Entries
  for (const e of fileEntries) {
    view.setUint32(pos, 0x02014b50, true); pos += 4; // signature
    view.setUint16(pos, 20, true); pos += 2;         // version made by
    view.setUint16(pos, 20, true); pos += 2;         // version needed
    view.setUint16(pos, 0x0800, true); pos += 2;     // flags: UTF-8
    view.setUint16(pos, 0, true); pos += 2;          // compression: 0
    view.setUint16(pos, 0, true); pos += 2;          // mod time
    view.setUint16(pos, 0, true); pos += 2;          // mod date
    view.setUint32(pos, e.crc, true); pos += 4;       // crc32
    view.setUint32(pos, e.dataBytes.length, true); pos += 4; // compressed size
    view.setUint32(pos, e.dataBytes.length, true); pos += 4; // uncompressed size
    view.setUint16(pos, e.nameBytes.length, true); pos += 2; // filename length
    view.setUint16(pos, 0, true); pos += 2;          // extra field length
    view.setUint16(pos, 0, true); pos += 2;          // file comment length
    view.setUint16(pos, 0, true); pos += 2;          // disk number start
    view.setUint16(pos, 0, true); pos += 2;          // internal attrs
    view.setUint32(pos, 0, true); pos += 4;          // external attrs
    view.setUint32(pos, e.offset, true); pos += 4;    // relative offset
    out.set(e.nameBytes, pos); pos += e.nameBytes.length;
  }

  // 3. Write End of Central Directory Record
  view.setUint32(pos, 0x06054b50, true); pos += 4; // signature
  view.setUint16(pos, 0, true); pos += 2;          // disk number
  view.setUint16(pos, 0, true); pos += 2;          // start disk
  view.setUint16(pos, fileEntries.length, true); pos += 2; // entries on disk
  view.setUint16(pos, fileEntries.length, true); pos += 2; // total entries
  view.setUint32(pos, centralDirSize, true); pos += 4;     // central dir size
  view.setUint32(pos, centralDirStart, true); pos += 4;    // central dir offset
  view.setUint16(pos, 0, true); pos += 2;          // comment length

  return out;
}

// ────────────────────────────────────────────────────────────────────
// Generate OpenXML XML parts
// ────────────────────────────────────────────────────────────────────
export function generateXlsxBlob(options: XlsxExportOptions): Blob {
  const { sheetName = 'گزارش', title, subtitle, columns, data, totals } = options;

  let rowNum = 1;
  let rowsXml = '';

  // Optional Title row
  if (title) {
    const endCol = colLetter(Math.max(0, columns.length - 1));
    rowsXml += `<row r="${rowNum}" ht="28" customHeight="1">` +
      `<c r="A${rowNum}" s="1" t="inlineStr"><is><t>${escapeXml(title)}</t></is></c>` +
      `</row>`;
    rowNum++;
  }

  // Optional Subtitle row
  if (subtitle) {
    rowsXml += `<row r="${rowNum}" ht="20" customHeight="1">` +
      `<c r="A${rowNum}" s="2" t="inlineStr"><is><t>${escapeXml(subtitle)}</t></is></c>` +
      `</row>`;
    rowNum++;
  }

  // Header row
  const headerRowNum = rowNum;
  rowsXml += `<row r="${rowNum}" ht="24" customHeight="1">`;
  columns.forEach((col, i) => {
    const ref = `${colLetter(i)}${rowNum}`;
    rowsXml += `<c r="${ref}" s="3" t="inlineStr"><is><t>${escapeXml(col.header)}</t></is></c>`;
  });
  rowsXml += `</row>`;
  rowNum++;

  // Data rows
  data.forEach((row, rIdx) => {
    const styleId = rIdx % 2 === 0 ? '4' : '5'; // alternating zebra
    rowsXml += `<row r="${rowNum}" ht="20" customHeight="1">`;
    columns.forEach((col, i) => {
      const ref = `${colLetter(i)}${rowNum}`;
      const val = row[col.key];

      if (val === null || val === undefined || val === '') {
        rowsXml += `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t>—</t></is></c>`;
      } else if (typeof val === 'number' || (col.isNumeric && !isNaN(Number(val)))) {
        const num = typeof val === 'number' ? val : Number(val);
        rowsXml += `<c r="${ref}" s="${styleId}"><v>${num}</v></c>`;
      } else {
        rowsXml += `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t>${escapeXml(val)}</t></is></c>`;
      }
    });
    rowsXml += `</row>`;
    rowNum++;
  });

  // Optional Totals row
  if (totals && Object.keys(totals).length > 0) {
    rowsXml += `<row r="${rowNum}" ht="24" customHeight="1">`;
    columns.forEach((col, i) => {
      const ref = `${colLetter(i)}${rowNum}`;
      const val = totals[col.key];

      if (val === null || val === undefined) {
        rowsXml += `<c r="${ref}" s="6"/>`;
      } else if (typeof val === 'number') {
        rowsXml += `<c r="${ref}" s="6"><v>${val}</v></c>`;
      } else {
        rowsXml += `<c r="${ref}" s="6" t="inlineStr"><is><t>${escapeXml(val)}</t></is></c>`;
      }
    });
    rowsXml += `</row>`;
    rowNum++;
  }

  // Column width declarations
  let colsXml = '<cols>';
  columns.forEach((col, i) => {
    const width = col.width || Math.max(14, col.header.length * 2.2);
    colsXml += `<col min="${i + 1}" max="${i + 1}" width="${width.toFixed(1)}" customWidth="1"/>`;
  });
  colsXml += '</cols>';

  // Merge cells for title/subtitle if present
  let mergeCellsXml = '';
  const merges: string[] = [];
  if (title && columns.length > 1) {
    merges.push(`A1:${colLetter(columns.length - 1)}1`);
  }
  if (subtitle && columns.length > 1) {
    merges.push(`A2:${colLetter(columns.length - 1)}2`);
  }
  if (merges.length > 0) {
    mergeCellsXml = `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`;
  }

  // Worksheets/sheet1.xml
  const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="${headerRowNum}" topLeftCell="A${headerRowNum + 1}" state="frozen"/></sheetView></sheetViews>` +
    colsXml +
    `<sheetData>${rowsXml}</sheetData>` +
    mergeCellsXml +
    '</worksheet>';

  // Style definitions (Vazirmatn/Tahoma, fills, borders, fonts)
  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="5">' +
    // 0: default regular
    '<font><sz val="10"/><name val="Vazirmatn"/><family val="2"/></font>' +
    // 1: title bold 14pt
    '<font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Vazirmatn"/></font>' +
    // 2: subtitle 10pt
    '<font><i/><sz val="10"/><color rgb="FF4B5563"/><name val="Vazirmatn"/></font>' +
    // 3: header bold 11pt white
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Vazirmatn"/></font>' +
    // 4: totals bold 11pt
    '<font><b/><sz val="11"/><color rgb="FF111827"/><name val="Vazirmatn"/></font>' +
    '</fonts>' +
    '<fills count="6">' +
    // 0: none
    '<fill><patternFill patternType="none"/></fill>' +
    // 1: gray125
    '<fill><patternFill patternType="gray125"/></fill>' +
    // 2: title fill (Dark Navy/Slate #1E293B)
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/></patternFill></fill>' +
    // 3: header fill (Teal/Emerald #0F766E)
    '<fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/></patternFill></fill>' +
    // 4: zebra even (#F9FAFB)
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF9FAFB"/></patternFill></fill>' +
    // 5: totals fill (#E5E7EB)
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="3">' +
    // 0: none
    '<border><left/><right/><top/><bottom/></border>' +
    // 1: light border
    '<border><left style="thin"><color rgb="FFE5E7EB"/></left><right style="thin"><color rgb="FFE5E7EB"/></right><top style="thin"><color rgb="FFE5E7EB"/></top><bottom style="thin"><color rgb="FFE5E7EB"/></bottom></border>' +
    // 2: header / totals border
    '<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="medium"><color rgb="FF0F766E"/></top><bottom style="medium"><color rgb="FF0F766E"/></bottom></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf/></cellStyleXfs>' +
    '<cellXfs count="7">' +
    // 0: default
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    // 1: title
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center"/></xf>' +
    // 2: subtitle
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment horizontal="right" vertical="center"/></xf>' +
    // 3: header
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    // 4: data row (white)
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>' +
    // 5: data row (zebra #F9FAFB)
    '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>' +
    // 6: totals
    '<xf numFmtId="0" fontId="4" fillId="5" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>' +
    '</cellXfs>' +
    '</styleSheet>';

  const cleanSheetName = escapeXml(sheetName.slice(0, 31));

  const files = [
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<workbookPr date1904="0"/>' +
        '<sheets>' +
        `<sheet name="${cleanSheetName}" sheetId="1" r:id="rId1"/>` +
        '</sheets>' +
        '</workbook>',
    },
    {
      name: 'xl/styles.xml',
      data: stylesXml,
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: sheetXml,
    },
  ];

  const zipBytes = createZip(files);
  return new Blob([zipBytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * High-level export helper: triggers an immediate .xlsx browser download.
 */
export function exportToXlsx(options: XlsxExportOptions): void {
  const blob = generateXlsxBlob(options);
  const fileName = options.filename.endsWith('.xlsx') ? options.filename : `${options.filename}.xlsx`;

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
