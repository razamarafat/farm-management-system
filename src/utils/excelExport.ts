import * as XLSX from 'xlsx';
import { toPersianNumbers } from './persianNumbers';
import { formatJalaliDate } from './jalaliDate';

interface ExcelColumn {
  key: string;
  header: string;
  width?: number;
  render?: (value: any, row: any) => string;
}

interface ExcelOptions {
  fileName: string;
  sheetName?: string;
  title?: string;
  subtitle?: string;
  columns: ExcelColumn[];
  data: any[];
  RTL?: boolean;
}

const DEFAULT_COLORS = {
  headerText: 'FFFFFF',
  headerFontSize: 12,
  dataFontSize: 10,
  borderColor: 'B7E4C7', // Base green border for data rows
  alternateRowBg: 'F7FFF7', // Very Light Green for data rows
  infoBarBg: '0077b6', // Professional Blue for info bars
  infoBarText: 'FFFFFF',
};

const HEADER_PALETTE = [
  '1D3557', // Navy Blue
  '457B9D', // Steel Blue
  'E63946', // Red
  '2A9D8F', // Teal
  'F4A261', // Orange
  '606C38', // Moss Green
  '264653', // Deep Sea
];

export function exportToExcel(options: ExcelOptions) {
  const {
    fileName,
    sheetName = 'Sheet1',
    title,
    subtitle,
    columns,
    data,
    RTL = true,
  } = options;

  const ws = XLSX.utils.aoa_to_sheet([]);

  // Set RTL direction for the sheet - apply correct RTL settings
  if (RTL) {
    ws['!views'] = [{ RTL: true }];
  }

  let currentRow = 1;

  if (title || subtitle) {
    // Create title row - spanning all columns
    if (title) {
      const titleRow = Array(columns.length).fill(null).map((_, i) => {
        const cell: any = {
          t: 's',
          v: i === 0 ? title : '', // Only put title in first cell, others are filled cells
        };
        cell.s = {
          font: { bold: true, size: 14, color: { rgb: DEFAULT_COLORS.infoBarText }, name: 'Calibri' },
          fill: { fgColor: { rgb: DEFAULT_COLORS.infoBarBg } },
          alignment: {
            horizontal: 'center',
            vertical: 'center',
            wrapText: true,
            rtl: RTL, // Ensure RTL alignment
          },
          border: {
            bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
          },
        };
        return cell;
      });

      XLSX.utils.sheet_add_aoa(ws, [titleRow], { origin: `A${currentRow}` });
      currentRow++;
    }

    // Create subtitle row - spanning all columns
    if (subtitle) {
      const subtitleRow = Array(columns.length).fill(null).map((_, i) => {
        const cell: any = {
          t: 's',
          v: i === 0 ? subtitle : '', // Only put subtitle in first cell, others are filled cells
        };
        cell.s = {
          font: { size: 10, color: { rgb: DEFAULT_COLORS.infoBarText }, name: 'Calibri' },
          fill: { fgColor: { rgb: DEFAULT_COLORS.infoBarBg } },
          alignment: {
            horizontal: 'center',
            vertical: 'center',
            wrapText: true,
            rtl: RTL, // Ensure RTL alignment
          },
          border: {
            bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
          },
        };
        return cell;
      });

      XLSX.utils.sheet_add_aoa(ws, [subtitleRow], { origin: `A${currentRow}` });
      currentRow++;
    }
  }

  const headerRow = columns.map((col, index) => {
    // Cycle through palette to give each header a distinct color
    const bgCol = HEADER_PALETTE[index % HEADER_PALETTE.length];
    const cell: any = { t: 's', v: col.header };
    cell.s = {
      font: {
        bold: true,
        size: DEFAULT_COLORS.headerFontSize,
        color: { rgb: DEFAULT_COLORS.headerText },
        name: 'Calibri',
      },
      fill: { fgColor: { rgb: bgCol } },
      alignment: {
        horizontal: 'center',
        vertical: 'center',
        wrapText: true,
        rtl: RTL, // Ensure RTL alignment for header
      },
      border: {
        left: { style: 'thin', color: { rgb: 'FFFFFF' } },
        right: { style: 'thin', color: { rgb: 'FFFFFF' } },
        top: { style: 'thin', color: { rgb: 'FFFFFF' } },
        bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
      },
    };
    return cell;
  });

  XLSX.utils.sheet_add_aoa(ws, [headerRow], { origin: `A${currentRow}` });

  currentRow++;

  const dataRows = data.map((row, rowIndex) => {
    return columns.map((col) => {
      let value = row[col.key];

      if (col.render) {
        value = col.render(value, row);
      } else if (typeof value === 'number') {
        value = toPersianNumbers(value.toLocaleString());
      } else if (typeof value === 'string') {
        // value remains value
      } else if (value === null || value === undefined) {
        value = '';
      }

      const cell: any = { t: 's', v: String(value) };

      const isAlternate = rowIndex % 2 === 1;
      cell.s = {
        font: { size: DEFAULT_COLORS.dataFontSize, name: 'Calibri' },
        fill: isAlternate ? { fgColor: { rgb: DEFAULT_COLORS.alternateRowBg } } : {},
        alignment: {
          horizontal: 'center',
          vertical: 'center',
          wrapText: true,
          rtl: RTL, // Ensure RTL alignment for data
        },
        border: {
          left: { style: 'thin', color: { rgb: DEFAULT_COLORS.borderColor } },
          right: { style: 'thin', color: { rgb: DEFAULT_COLORS.borderColor } },
          top: { style: 'thin', color: { rgb: DEFAULT_COLORS.borderColor } },
          bottom: { style: 'thin', color: { rgb: DEFAULT_COLORS.borderColor } },
        },
      };

      return cell;
    });
  });

  XLSX.utils.sheet_add_aoa(ws, dataRows, { origin: `A${currentRow}` });

  const columnWidths = columns.map((col) => ({
    wch: col.width || 15,
  }));
  ws['!cols'] = columnWidths;

  // Set row heights for better visibility
  const rowHeights: any[] = [];
  let rowNum = 1;

  // Info bar rows (title and subtitle) - taller
  if (title) {
    rowHeights[rowNum - 1] = { hpt: 25, hidden: false }; // Title row height
    rowNum++;
  }
  if (subtitle) {
    rowHeights[rowNum - 1] = { hpt: 20, hidden: false }; // Subtitle row height
    rowNum++;
  }

  // Header row - taller for visibility
  rowHeights[rowNum - 1] = { hpt: 22, hidden: false };

  ws['!rows'] = rowHeights;

  const totalRows = data.length + (title || subtitle ? 2 : 1);
  const totalCols = columns.length;
  const range = XLSX.utils.decode_range(`A1:${XLSX.utils.encode_cell({ r: totalRows, c: totalCols - 1 })}`);
  ws['!ref'] = XLSX.utils.encode_range(range);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const timestamp = new Date().toISOString().slice(0, 10);
  const fileNameWithDate = `${fileName}_${timestamp}.xlsx`;

  XLSX.writeFile(wb, fileNameWithDate);
}

export function exportInventoryTransactionsToExcel(data: any[], fileName: string = 'inventory_transactions') {
  const columns: ExcelColumn[] = [
    { key: 'row', header: 'ردیف', width: 8 },
    { key: 'item_name', header: 'نام کالا', width: 25 },
    { key: 'category', header: 'دسته', width: 12 },
    { key: 'unit', header: 'واحد', width: 10 },
    { key: 'txn_type', header: 'نوع تراکنش', width: 15 },
    { key: 'qty_in', header: 'ورودی', width: 12 },
    { key: 'qty_out', header: 'خروجی', width: 12 },
    { key: 'balance', header: 'مانده', width: 12 },
    { key: 'txn_date', header: 'تاریخ', width: 12 },
    { key: 'reference_no', header: 'شماره مرجع', width: 15 },
    { key: 'notes', header: 'توضیحات', width: 30 },
  ];

  const txnTypeMap: Record<string, string> = {
    purchase: 'خرید',
    transfer_in: 'انتقال ورودی',
    transfer_out: 'انتقال خروجی',
    consumption: 'مصرف',
    waste: 'ضایعات',
    initial: 'موجودی اولیه',
    adjustment: 'تعدیل',
  };

  const categoryMap: Record<string, string> = {
    feed: 'نهاده',
    packaging: 'بسته‌بندی',
  };

  const formattedData = data.map((row, index) => ({
    row: toPersianNumbers(index + 1),
    item_name: row.item?.name || row.item_name || '-',
    category: categoryMap[row.item?.category] || row.category || '-',
    unit: row.item?.unit || row.unit || '-',
    txn_type: txnTypeMap[row.txn_type] || row.txn_type || '-',
    qty_in: row.qty_in > 0 ? toPersianNumbers(row.qty_in.toLocaleString()) : '-',
    qty_out: row.qty_out > 0 ? toPersianNumbers(row.qty_out.toLocaleString()) : '-',
    balance: toPersianNumbers(row.balance?.toLocaleString() || '0'),
    txn_date: formatJalaliDate(row.txn_date),
    reference_no: row.reference_no || '-',
    notes: row.notes || '-',
  }));

  exportToExcel({
    fileName,
    sheetName: 'تراکنش‌های انبار',
    title: 'گزارش تراکنش‌های انبار',
    subtitle: `تاریخ گزارش: ${formatJalaliDate(new Date().toISOString())}`,
    columns,
    data: formattedData,
    RTL: true,
  });
}

export function exportDailySheetToExcel(data: any[], fileName: string = 'daily_sheet') {
  const columns: ExcelColumn[] = [
    { key: 'row', header: 'ردیف', width: 8 },
    { key: 'item_name', header: 'نام کالا', width: 25 },
    { key: 'unit', header: 'واحد', width: 10 },
    { key: 'opening_balance', header: 'موجودی اولیه', width: 15 },
    { key: 'received', header: 'دریافتی', width: 12 },
    { key: 'consumption', header: 'مصرف', width: 12 },
    { key: 'waste', header: 'ضایعات', width: 12 },
    { key: 'closing_balance', header: 'موجودی نهایی', width: 15 },
  ];

  const formattedData = data.map((row, index) => ({
    row: toPersianNumbers(index + 1),
    item_name: row.item_name || '-',
    unit: row.unit || '-',
    opening_balance: toPersianNumbers((row.opening_balance || 0).toLocaleString()),
    received: toPersianNumbers((row.received || 0).toLocaleString()),
    consumption: toPersianNumbers((row.consumption || 0).toLocaleString()),
    waste: toPersianNumbers((row.waste || 0).toLocaleString()),
    closing_balance: toPersianNumbers((row.closing_balance || 0).toLocaleString()),
  }));

  exportToExcel({
    fileName,
    sheetName: 'حواله مصرف',
    title: 'گزارش حواله مصرف روزانه',
    subtitle: `تاریخ گزارش: ${formatJalaliDate(new Date().toISOString())}`,
    columns,
    data: formattedData,
    RTL: true,
  });
}

export function exportPurchasesToExcel(data: any[], fileName: string = 'purchases') {
  const columns: ExcelColumn[] = [
    { key: 'row', header: 'ردیف', width: 8 },
    { key: 'date', header: 'تاریخ', width: 12 },
    { key: 'item_name', header: 'نام کالا', width: 25 },
    { key: 'type', header: 'نوع', width: 15 },
    { key: 'quantity', header: 'مقدار', width: 12 },
    { key: 'unit_price', header: 'قیمت واحد', width: 15 },
    { key: 'total_price', header: 'قیمت کل', width: 15 },
    { key: 'supplier', header: 'تأمین‌کننده', width: 20 },
    { key: 'reference_no', header: 'شماره فاکتور', width: 15 },
    { key: 'notes', header: 'توضیحات', width: 30 },
  ];

  const typeMap: Record<string, string> = {
    purchase: 'خرید',
    transfer_in: 'انتقال ورودی',
    transfer_out: 'انتقال خروجی',
  };

  const formattedData = data.map((row, index) => ({
    row: toPersianNumbers(index + 1),
    date: formatJalaliDate(row.date || row.txn_date),
    item_name: row.item_name || '-',
    type: typeMap[row.type] || row.type || '-',
    quantity: toPersianNumbers((row.qty || row.quantity || 0).toLocaleString()),
    unit_price: row.unit_price ? toPersianNumbers(row.unit_price.toLocaleString()) : '-',
    total_price: row.total_price ? toPersianNumbers(row.total_price.toLocaleString()) : '-',
    supplier: row.supplier_name || '-',
    reference_no: row.reference_no || '-',
    notes: row.notes || '-',
  }));

  exportToExcel({
    fileName,
    sheetName: 'خرید و انتقال',
    title: 'گزارش خرید و انتقال',
    subtitle: `تاریخ گزارش: ${formatJalaliDate(new Date().toISOString())}`,
    columns,
    data: formattedData,
    RTL: true,
  });
}

export function exportStockBalanceToExcel(data: any[], fileName: string = 'stock_balance') {
  const columns: ExcelColumn[] = [
    { key: 'row', header: 'ردیف', width: 8 },
    { key: 'item_name', header: 'نام کالا', width: 25 },
    { key: 'category', header: 'دسته', width: 12 },
    { key: 'unit', header: 'واحد', width: 10 },
    { key: 'initial_qty', header: 'موجودی اولیه', width: 15 },
    { key: 'total_in', header: 'کل ورودی', width: 12 },
    { key: 'total_out', header: 'کل خروجی', width: 12 },
    { key: 'balance', header: 'موجودی فعلی', width: 15 },
    { key: 'status', header: 'وضعیت', width: 12 },
  ];

  const categoryMap: Record<string, string> = {
    feed: 'نهاده',
    packaging: 'بسته‌بندی',
  };

  const formattedData = data.map((row, index) => {
    let status = 'موجود';
    if (row.balance <= 0) status = 'تمام شده';
    else if (row.balance <= row.reorder_point) status = 'نقطه سفارش';

    return {
      row: toPersianNumbers(index + 1),
      item_name: row.item_name || '-',
      category: categoryMap[row.item_category] || row.category || '-',
      unit: row.item_unit || row.unit || '-',
      initial_qty: row.has_initial ? toPersianNumbers(row.initial_qty?.toLocaleString() || '0') : '-',
      total_in: toPersianNumbers((row.total_in || 0).toLocaleString()),
      total_out: toPersianNumbers((row.total_out || 0).toLocaleString()),
      balance: toPersianNumbers((row.balance || 0).toLocaleString()),
      status,
    };
  });

  exportToExcel({
    fileName,
    sheetName: 'موجودی انبار',
    title: 'گزارش موجودی انبار',
    subtitle: `تاریخ گزارش: ${formatJalaliDate(new Date().toISOString())}`,
    columns,
    data: formattedData,
    RTL: true,
  });
}

export function exportSuppliersToExcel(data: any[], fileName: string = 'suppliers') {
  const columns: ExcelColumn[] = [
    { key: 'row', header: 'ردیف', width: 8 },
    { key: 'name', header: 'نام تأمین‌کننده', width: 40 },
    { key: 'status', header: 'وضعیت', width: 12 },
    { key: 'created_at', header: 'تاریخ ایجاد', width: 15 },
  ];

  const formattedData = data.map((row, index) => ({
    row: toPersianNumbers(index + 1),
    name: row.name || '-',
    status: row.is_active ? 'فعال' : 'غیرفعال',
    created_at: formatJalaliDate(row.created_at),
  }));

  exportToExcel({
    fileName,
    sheetName: 'تأمین‌کنندگان',
    title: 'گزارش تأمین‌کنندگان',
    subtitle: `تاریخ گزارش: ${formatJalaliDate(new Date().toISOString())}`,
    columns,
    data: formattedData,
    RTL: true,
  });
}
