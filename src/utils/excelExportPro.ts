import ExcelJS from 'exceljs';
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
}

// Color palette for header columns - distinct colors
const HEADER_COLORS = [
  'FF1D3557', // Navy Blue
  'FF457B9D', // Steel Blue
  'FFE63946', // Red
  'FF2A9D8F', // Teal
  'FFF4A261', // Orange
  'FF606C38', // Moss Green
  'FF264653', // Deep Sea
  'FFA1662F', // Burnt Orange
  'FF6A4C93', // Purple
  'FF1B4965', // Dark Cyan
];

// Color scheme
const COLORS = {
  infoBarBg: 'FF0077B6',    // Professional Blue
  infoBarText: 'FFFFFFFF',  // White
  headerText: 'FFFFFFFF',   // White
  alternateRowBg: 'FFF7FFF7', // Light green
  border: 'FFB7E4C7',       // Green border
};

export async function exportToExcelPro(options: ExcelOptions) {
  const {
    fileName,
    sheetName = 'Sheet1',
    title,
    subtitle,
    columns,
    data,
  } = options;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  
  // Set RTL mode
  worksheet.views = [{ rightToLeft: true }];

  // Set column widths
  columns.forEach((col) => {
    const columnIndex = columns.indexOf(col) + 1;
    worksheet.getColumn(columnIndex).width = col.width || 15;
  });

  let currentRow = 1;

  // Add title row if provided
  if (title) {
    const titleRow = worksheet.getRow(currentRow);
    
    // Merge cells across all columns for title
    worksheet.mergeCells(currentRow, 1, currentRow, columns.length);
    
    const titleCell = titleRow.getCell(1);
    titleCell.value = title;
    titleCell.font = {
      bold: true,
      size: 14,
      color: { argb: COLORS.infoBarText },
      name: 'Calibri',
    };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.infoBarBg },
    };
    titleCell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    } as any;
    
    // Apply border to all cells in merged range
    for (let i = 1; i <= columns.length; i++) {
      const cell = titleRow.getCell(i);
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.infoBarBg },
      } as any;
    }
    
    titleRow.height = 25;
    currentRow++;
  }

  // Add subtitle row if provided
  if (subtitle) {
    const subtitleRow = worksheet.getRow(currentRow);
    
    // Merge cells across all columns for subtitle
    worksheet.mergeCells(currentRow, 1, currentRow, columns.length);
    
    const subtitleCell = subtitleRow.getCell(1);
    subtitleCell.value = subtitle;
    subtitleCell.font = {
      size: 10,
      color: { argb: COLORS.infoBarText },
      name: 'Calibri',
    };
    subtitleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.infoBarBg },
    };
    subtitleCell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    } as any;
    
    // Apply fill to all cells in merged range
    for (let i = 1; i <= columns.length; i++) {
      const cell = subtitleRow.getCell(i);
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.infoBarBg },
      } as any;
    }
    
    subtitleRow.height = 20;
    currentRow++;
  }

  // Add header row with distinct colors for each column
  const headerRow = worksheet.getRow(currentRow);
  columns.forEach((col, index) => {
    const cell = headerRow.getCell(index + 1);
    const colorIndex = index % HEADER_COLORS.length;
    const headerColor = HEADER_COLORS[colorIndex];
    
    cell.value = col.header;
    cell.font = {
      bold: true,
      size: 12,
      color: { argb: COLORS.headerText },
      name: 'Calibri',
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: headerColor },
    } as any;
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    } as any;
    cell.border = {
      left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    };
  });
  headerRow.height = 22;
  currentRow++;

  // Add data rows
  data.forEach((rowData, rowIndex) => {
    const row = worksheet.getRow(currentRow + rowIndex);
    
    columns.forEach((col, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      let value = rowData[col.key];

      // Format the value
      if (col.render) {
        value = col.render(value, rowData);
      } else if (typeof value === 'number') {
        value = toPersianNumbers(value.toLocaleString());
      } else if (value === null || value === undefined) {
        value = '';
      }

      cell.value = String(value);
      
      // Apply alternating row colors
      const isAlternate = rowIndex % 2 === 1;
      
      cell.font = {
        size: 10,
        name: 'Calibri',
      };
      
      if (isAlternate) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.alternateRowBg },
        } as any;
      }
      
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      } as any;
      
      cell.border = {
        left: { style: 'thin', color: { argb: COLORS.border } },
        right: { style: 'thin', color: { argb: COLORS.border } },
        top: { style: 'thin', color: { argb: COLORS.border } },
        bottom: { style: 'thin', color: { argb: COLORS.border } },
      };
    });
    
    row.height = 18;
  });

  // Generate file
  const timestamp = new Date().toISOString().slice(0, 10);
  const fileNameWithDate = `${fileName}_${timestamp}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();
  
  // Use browser's download functionality
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileNameWithDate;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export async function exportInventoryTransactionsToExcel(data: any[], fileName: string = 'inventory_transactions') {
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

  await exportToExcelPro({
    fileName,
    sheetName: 'تراکنش‌های انبار',
    title: 'گزارش تراکنش‌های انبار',
    subtitle: `تاریخ گزارش: ${formatJalaliDate(new Date().toISOString())}`,
    columns,
    data: formattedData,
  });
}

export async function exportDailySheetToExcel(data: any[], fileName: string = 'daily_sheet') {
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

  await exportToExcelPro({
    fileName,
    sheetName: 'حواله مصرف',
    title: 'گزارش حواله مصرف روزانه',
    subtitle: `تاریخ گزارش: ${formatJalaliDate(new Date().toISOString())}`,
    columns,
    data: formattedData,
  });
}

export async function exportPurchasesToExcel(data: any[], fileName: string = 'purchases') {
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

  await exportToExcelPro({
    fileName,
    sheetName: 'خرید و انتقال',
    title: 'گزارش خرید و انتقال',
    subtitle: `تاریخ گزارش: ${formatJalaliDate(new Date().toISOString())}`,
    columns,
    data: formattedData,
  });
}

export async function exportStockBalanceToExcel(data: any[], fileName: string = 'stock_balance') {
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

  await exportToExcelPro({
    fileName,
    sheetName: 'موجودی انبار',
    title: 'گزارش موجودی انبار',
    subtitle: `تاریخ گزارش: ${formatJalaliDate(new Date().toISOString())}`,
    columns,
    data: formattedData,
  });
}

export async function exportSuppliersToExcel(data: any[], fileName: string = 'suppliers') {
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

  await exportToExcelPro({
    fileName,
    sheetName: 'تأمین‌کنندگان',
    title: 'گزارش تأمین‌کنندگان',
    subtitle: `تاریخ گزارش: ${formatJalaliDate(new Date().toISOString())}`,
    columns,
    data: formattedData,
  });
}
