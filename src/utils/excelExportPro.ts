// excelExportPro.ts - Re-exports from excelExport for backward compatibility
// Previously used exceljs which was removed. Now uses xlsx (the same as excelExport.ts).
export {
  exportToExcel as exportToExcelPro,
  exportInventoryTransactionsToExcel,
  exportDailySheetToExcel,
  exportPurchasesToExcel,
  exportStockBalanceToExcel,
  exportSuppliersToExcel,
} from './excelExport';
