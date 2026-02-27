// Inventory Types

export type TransactionType = 
  | 'initial'      // موجودی اولیه
  | 'purchase'     // خرید
  | 'consumption'  // مصرف
  | 'waste'        // ضایعات
  | 'transfer_in'  // انتقال ورودی
  | 'transfer_out' // انتقال خروجی
  | 'adjustment';  // تعدیل

export interface InventoryTransaction {
  id: string;
  farm_id: string;
  item_id: string;
  txn_date: string;
  txn_ts: string;
  txn_type: TransactionType;
  qty_in: number;
  qty_out: number;
  unit_price?: number | null;
  total_price?: number | null;
  source_type?: string | null;
  source_id?: string | null;
  reference_no?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  // Joined fields
  item?: {
    id: string;
    name: string;
    unit: string;
    category: string;
  };
  creator?: {
    first_name: string;
    last_name: string;
  };
}

export interface StockBalance {
  farm_id: string;
  item_id: string;
  item_name: string;
  item_unit: string;
  item_category: string;
  balance: number;
  total_in: number;
  total_out: number;
  has_initial: boolean;
  initial_qty: number;
  last_transaction_at?: string;
  reorder_point: number;
}

export interface InventoryFilters {
  search: string;
  item_id: string | 'all';
  txn_type: TransactionType | 'all';
  date_from: string;
  date_to: string;
  category: 'feed' | 'packaging' | 'all';
}

export interface InitialStockInput {
  item_id: string;
  quantity: number;
  txn_date: string;
  notes?: string;
}

export interface PurchaseInput {
  item_id: string;
  quantity: number;
  unit_price?: number;
  txn_date: string;
  reference_no?: string;
  notes?: string;
}

export interface TransferInput {
  item_id: string;
  quantity: number;
  to_farm_id?: string;
  from_farm_id?: string;
  txn_date: string;
  notes?: string;
}

export interface AdjustmentInput {
  item_id: string;
  quantity: number; // positive for increase, negative for decrease
  txn_date: string;
  notes: string; // required for adjustment
}

export const TXN_TYPE_LABELS: Record<TransactionType, string> = {
  initial: 'موجودی اولیه',
  purchase: 'خرید',
  consumption: 'مصرف',
  waste: 'ضایعات',
  transfer_in: 'انتقال ورودی',
  transfer_out: 'انتقال خروجی',
  adjustment: 'تعدیل',
};

export const TXN_TYPE_COLORS: Record<TransactionType, { bg: string; text: string; icon: string }> = {
  initial: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', icon: 'Archive' },
  purchase: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', icon: 'Plus' },
  consumption: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', icon: 'Minus' },
  waste: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', icon: 'Trash2' },
  transfer_in: { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-400', icon: 'ArrowDownLeft' },
  transfer_out: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', icon: 'ArrowUpRight' },
  adjustment: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', icon: 'RefreshCw' },
};
