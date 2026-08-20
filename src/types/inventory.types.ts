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
  initial: { bg: 'bg-[color-mix(in_srgb,var(--c-accent)_16%,transparent)]', text: 'text-[var(--c-accent)]', icon: 'Archive' },
  purchase: { bg: 'bg-[color-mix(in_srgb,var(--c-success)_16%,transparent)]', text: 'text-[var(--c-success)]', icon: 'Plus' },
  consumption: { bg: 'bg-[color-mix(in_srgb,var(--c-info)_16%,transparent)]', text: 'text-[var(--c-info)]', icon: 'Minus' },
  waste: { bg: 'bg-[color-mix(in_srgb,var(--c-destructive)_16%,transparent)]', text: 'text-[var(--c-error)]', icon: 'Trash2' },
  transfer_in: { bg: 'bg-[#EEF3ED] dark:bg-[#1A2E22]', text: 'text-[#3A7D5C] dark:text-[#5EB880]', icon: 'ArrowDownLeft' },
  transfer_out: { bg: 'bg-[color-mix(in_srgb,var(--c-warning)_16%,transparent)]', text: 'text-[var(--c-warning)]', icon: 'ArrowUpRight' },
  adjustment: { bg: 'bg-[color-mix(in_srgb,var(--c-secondary)_16%,transparent)]', text: 'text-[var(--c-secondary)]', icon: 'RefreshCw' },
};
