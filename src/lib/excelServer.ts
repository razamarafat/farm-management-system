// =====================================================================
// src/lib/excelServer.ts
//
// Dual-mode Excel export service:
// 1. Tries server-side BFF export if VITE_BFF_URL is defined.
// 2. Automatically falls back to high-fidelity, zero-dependency client-side
//    OpenXML (.xlsx) generation via src/lib/xlsxClient.ts.
//
// This guarantees that in single-file standalone distribution (dist/index.html)
// or whenever the BFF service is offline/unreachable, Excel files are still
// generated cleanly, with Persian headers, right-to-left layout, proper column
// widths, number formats, and totals rows.
// =====================================================================

import { supabase } from '@/lib/supabase';
import { exportToXlsx, type XlsxColumn } from '@/lib/xlsxClient';
import { rpcError } from '@/utils/rpcError';

export type SupportedReportId =
  // 6 legacy ids
  | 'RPT_INVENTORY_VALUATION_SUMMARY'
  | 'RPT_INVENTORY_LEDGER'
  | 'RPT_CONSUMPTION_ANALYTICS'
  | 'RPT_INVENTORY_AGING'
  | 'RPT_PARETO_CLASSIFICATION'
  | 'RPT_SUPPLIERS'
  // 6 v3 ids
  | 'RPT_INVENTORY_STOCK'
  | 'RPT_CONSUMPTION_REPORT'
  | 'RPT_SALES_TRANSFERS'
  | 'RPT_PURCHASES'
  | 'RPT_PACKAGING'
  | 'RPT_REORDER_POINT';

export type ReportExportFilters = Record<string, unknown>;

export interface ServerExportError extends Error {
  status?: number;
  code?: string;
}

function makeError(message: string, status?: number, code?: string): ServerExportError {
  const err = new Error(message) as ServerExportError;
  err.status = status;
  err.code = code;
  return err;
}

interface ReportMeta {
  rpcName: string;
  sheetName: string;
  title: string;
  columns: XlsxColumn[];
  totalsRow?: boolean;
  mapParams: (filters: ReportExportFilters) => Record<string, unknown>;
}

const REPORT_REGISTRY: Record<string, ReportMeta> = {
  RPT_INVENTORY_STOCK: {
    rpcName: 'reporting_inventory_stock',
    sheetName: 'موجودی انبار',
    title: 'گزارش موجودی انبار',
    totalsRow: true,
    mapParams: (f) => ({
      p_as_of: f.asOf || f.date_to || new Date().toISOString().slice(0, 10),
      p_farm_id: f.farm_id || null,
      p_category: f.category || null,
      p_dead_stock_only: f.deadStockOnly === true,
    }),
    columns: [
      { key: 'farm_name', header: 'فارم', width: 18, align: 'right' },
      { key: 'item_name', header: 'کالا', width: 28, align: 'right' },
      { key: 'item_category', header: 'دسته', width: 12, align: 'center' },
      { key: 'item_unit', header: 'واحد', width: 10, align: 'center' },
      { key: 'on_hand_qty', header: 'موجودی', width: 14, align: 'left', numFmt: '#,##0.00' },
      { key: 'unit_cost', header: 'قیمت واحد (ریال)', width: 18, align: 'left', numFmt: '#,##0' },
      { key: 'value_rial', header: 'ارزش (ریال)', width: 22, align: 'left', numFmt: '#,##0' },
      { key: 'last_movement_date', header: 'آخرین حرکت', width: 14, align: 'center' },
      { key: 'days_since_last_movement', header: 'سن (روز)', width: 12, align: 'center' },
      { key: 'is_dead_stock', header: 'راکد', width: 10, align: 'center' },
    ],
  },

  RPT_CONSUMPTION_REPORT: {
    rpcName: 'reporting_consumption_report_v3',
    sheetName: 'گزارش مصرف',
    title: 'گزارش مصرف کالاها',
    totalsRow: true,
    mapParams: (f) => ({
      p_date_from: f.date_from,
      p_date_to: f.date_to,
      p_farm_id: f.farm_id || null,
      p_category: f.category || null,
      p_group_by: f.group_by || 'item',
      p_hall_ids: Array.isArray(f.hallIds) ? f.hallIds : [],
      p_formula_ids: Array.isArray(f.formulaIds) ? f.formulaIds : [],
    }),
    columns: [
      { key: 'group_label', header: 'گروه', width: 24, align: 'right' },
      { key: 'item_category', header: 'دسته', width: 12, align: 'center' },
      { key: 'hall_name', header: 'سالن', width: 18, align: 'right' },
      { key: 'formula_name', header: 'فرمول', width: 22, align: 'right' },
      { key: 'consumed_qty', header: 'مصرف', width: 14, align: 'left', numFmt: '#,##0.00' },
      { key: 'waste_qty', header: 'ضایعات', width: 14, align: 'left', numFmt: '#,##0.00' },
      { key: 'unit_price', header: 'قیمت واحد', width: 16, align: 'left', numFmt: '#,##0' },
      { key: 'rial_value', header: 'ارزش ریالی', width: 22, align: 'left', numFmt: '#,##0' },
      { key: 'closing_balance', header: 'مانده انبار', width: 14, align: 'left', numFmt: '#,##0.00' },
      { key: 'voucher_count', header: 'تعداد حواله', width: 12, align: 'center' },
    ],
  },

  RPT_SALES_TRANSFERS: {
    rpcName: 'reporting_sales_transfers_v3',
    sheetName: 'فروش و انتقالات',
    title: 'گزارش فروش و انتقال بین انبارها',
    totalsRow: true,
    mapParams: (f) => ({
      p_date_from: f.date_from,
      p_date_to: f.date_to,
      p_farm_id: f.farm_id || null,
      p_item_id: f.item_id || null,
      p_txn_type: ['sale', 'transfer_in', 'transfer_out'].includes(f.txn_type as string) ? f.txn_type : null,
    }),
    columns: [
      { key: 'txn_date', header: 'تاریخ', width: 14, align: 'center' },
      { key: 'txn_type', header: 'نوع', width: 14, align: 'center' },
      { key: 'source_farm', header: 'مبدأ', width: 18, align: 'right' },
      { key: 'dest_farm', header: 'مقصد', width: 18, align: 'right' },
      { key: 'item_name', header: 'کالا', width: 28, align: 'right' },
      { key: 'item_unit', header: 'واحد', width: 10, align: 'center' },
      { key: 'qty', header: 'مقدار', width: 14, align: 'left', numFmt: '#,##0.00' },
      { key: 'unit_price', header: 'قیمت واحد', width: 16, align: 'left', numFmt: '#,##0' },
      { key: 'amount', header: 'مبلغ', width: 20, align: 'left', numFmt: '#,##0' },
      { key: 'reference_no', header: 'مرجع', width: 18, align: 'center' },
    ],
  },

  RPT_PURCHASES: {
    rpcName: 'reporting_purchases_v3',
    sheetName: 'گزارش خریدها',
    title: 'گزارش خریدها',
    totalsRow: true,
    mapParams: (f) => ({
      p_date_from: f.date_from,
      p_date_to: f.date_to,
      p_farm_id: f.farm_id || null,
      p_supplier_id: f.supplier_id || null,
      p_item_id: f.item_id || null,
    }),
    columns: [
      { key: 'txn_date', header: 'تاریخ', width: 14, align: 'center' },
      { key: 'supplier_name', header: 'تأمین‌کننده', width: 24, align: 'right' },
      { key: 'item_name', header: 'کالا', width: 28, align: 'right' },
      { key: 'item_unit', header: 'واحد', width: 10, align: 'center' },
      { key: 'qty', header: 'مقدار', width: 14, align: 'left', numFmt: '#,##0.00' },
      { key: 'unit_price', header: 'قیمت واحد', width: 16, align: 'left', numFmt: '#,##0' },
      { key: 'total_amount', header: 'مبلغ کل', width: 22, align: 'left', numFmt: '#,##0' },
      { key: 'reference_no', header: 'مرجع/شماره سند', width: 18, align: 'center' },
    ],
  },

  RPT_PACKAGING: {
    rpcName: 'reporting_packaging_v3',
    sheetName: 'اقلام بسته‌بندی',
    title: 'گزارش اقلام بسته‌بندی',
    totalsRow: true,
    mapParams: (f) => ({
      p_date_from: f.date_from,
      p_date_to: f.date_to,
      p_farm_id: f.farm_id || null,
    }),
    columns: [
      { key: 'item_name', header: 'کالای بسته‌بندی', width: 28, align: 'right' },
      { key: 'item_unit', header: 'واحد', width: 10, align: 'center' },
      { key: 'consumed_qty', header: 'مصرف/خروج', width: 14, align: 'left', numFmt: '#,##0.00' },
      { key: 'rial_value', header: 'ارزش ریالی', width: 22, align: 'left', numFmt: '#,##0' },
      { key: 'closing_balance', header: 'مانده انبار', width: 14, align: 'left', numFmt: '#,##0.00' },
    ],
  },

  RPT_REORDER_POINT: {
    rpcName: 'reporting_reorder_point_v3',
    sheetName: 'نقطه سفارش کالا',
    title: 'نقطه سفارش کالا و کلاس‌بندی ABC',
    totalsRow: false,
    mapParams: (f) => ({
      p_farm_id: f.farm_id || null,
      p_basis: f.basis === 'quantity' ? 'quantity' : 'value',
      p_abc_class: ['A', 'B', 'C'].includes(f.abcClass as string) ? f.abcClass : null,
      p_reorder_needed_only: typeof f.reorderNeededOnly === 'boolean' ? f.reorderNeededOnly : null,
    }),
    columns: [
      { key: 'item_name', header: 'کالا', width: 28, align: 'right' },
      { key: 'farm_name', header: 'فارم', width: 18, align: 'right' },
      { key: 'item_unit', header: 'واحد', width: 10, align: 'center' },
      { key: 'on_hand_qty', header: 'موجودی فعلی', width: 14, align: 'left', numFmt: '#,##0.00' },
      { key: 'reorder_point', header: 'نقطه سفارش', width: 14, align: 'left', numFmt: '#,##0.00' },
      { key: 'avg_daily_consumption', header: 'مصرف روزانه', width: 14, align: 'left', numFmt: '#,##0.00' },
      { key: 'abc_class', header: 'کلاس ABC', width: 12, align: 'center' },
      { key: 'reorder_recommended', header: 'پیشنهاد سفارش', width: 16, align: 'center' },
    ],
  },

  RPT_SUPPLIERS: {
    rpcName: 'reporting_suppliers_list',
    sheetName: 'تامین‌کنندگان',
    title: 'لیست تامین‌کنندگان',
    totalsRow: true,
    mapParams: (f) => ({
      p_farm_id: f.farm_id || null,
      p_category: f.category || null,
      p_is_active: typeof f.is_active === 'boolean' ? f.is_active : null,
      p_search: f.search || null,
    }),
    columns: [
      { key: 'name', header: 'نام تأمین‌کننده', width: 28, align: 'right' },
      { key: 'status', header: 'وضعیت', width: 12, align: 'center' },
      { key: 'usage_count', header: 'تعداد خرید', width: 14, align: 'left', numFmt: '#,##0' },
      { key: 'total_purchases_rial', header: 'مجموع خرید (ریال)', width: 22, align: 'left', numFmt: '#,##0' },
      { key: 'last_purchase_date', header: 'آخرین خرید', width: 14, align: 'center' },
      { key: 'first_purchase_date', header: 'اولین خرید', width: 14, align: 'center' },
    ],
  },
};

/**
 * Triggers an Excel export. Tries server BFF when explicitly configured,
 * otherwise transparently generates native OpenXML .xlsx in the browser.
 */
export async function triggerServerExport(
  reportId: SupportedReportId,
  filters: ReportExportFilters,
): Promise<{ fileName: string; rowCount: number | null }> {
  const envBff = import.meta.env.VITE_BFF_URL as string | undefined;

  // Try server BFF only if explicitly configured
  if (envBff && !envBff.includes('localhost:3000')) {
    try {
      return await executeServerExport(reportId, filters, envBff);
    } catch (err) {
      console.warn('Server export failed, falling back to browser OpenXML generator:', err);
    }
  }

  // Seamless client-side OpenXML generator
  return await executeClientExport(reportId, filters);
}

async function executeServerExport(
  reportId: SupportedReportId,
  filters: ReportExportFilters,
  baseUrl: string,
): Promise<{ fileName: string; rowCount: number | null }> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (sessionError || !token) {
    throw makeError('برای دریافت خروجی اکسل ابتدا باید وارد حساب کاربری شوید.', 401, 'no_active_session');
  }

  const url = `${baseUrl.replace(/\/$/, '')}/api/export/${reportId}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(filters),
  });

  if (!response.ok) {
    throw makeError(`خطا در دریافت از سرور (${response.status})`, response.status);
  }

  const rowCountHeader = response.headers.get('X-Export-Row-Count');
  const contentDisposition = response.headers.get('Content-Disposition') ?? '';
  const fileName = parseFileName(contentDisposition) ?? deriveDefaultFileName(reportId);

  const blob = await response.blob();
  triggerBrowserDownload(blob, fileName);

  return {
    fileName,
    rowCount: rowCountHeader ? Number(rowCountHeader) : null,
  };
}

async function executeClientExport(
  reportId: SupportedReportId,
  filters: ReportExportFilters,
): Promise<{ fileName: string; rowCount: number | null }> {
  const meta = REPORT_REGISTRY[reportId];
  if (!meta) {
    // If not in registry, try default query
    throw makeError(`گزارش ${reportId} پشتیبانی نمی‌شود`, 404);
  }

  const rpcParams = meta.mapParams(filters);
  const { data, error } = await supabase.rpc(meta.rpcName, rpcParams);

  if (error) {
    console.error(`Export RPC failed for ${reportId}:`, error);
    throw makeError(rpcError(error) || 'خطا در دریافت داده‌های گزارش', 500);
  }

  const rows = (data || []) as Record<string, unknown>[];
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `${meta.sheetName.replace(/\s+/g, '_')}_${dateStr}.xlsx`;

  exportToXlsx({
    sheetName: meta.sheetName,
    title: meta.title,
    columns: meta.columns,
    rows,
    fileName,
    rightToLeft: true,
    totalsRow: meta.totalsRow ?? true,
  });

  return {
    fileName,
    rowCount: rows.length,
  };
}

function parseFileName(contentDisposition: string): string | null {
  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  return match ? match[1] : null;
}

function deriveDefaultFileName(reportId: string): string {
  const ts = new Date().toISOString().slice(0, 10);
  return `${reportId}_${ts}.xlsx`;
}

function triggerBrowserDownload(blob: Blob, fileName: string): void {
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
