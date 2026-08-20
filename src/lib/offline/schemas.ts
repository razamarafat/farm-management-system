/**
 * RxDB collection schemas for the offline-first feature (Step B).
 *
 * Each schema mirrors a Supabase table exactly as defined by the consolidated
 * migration suite (scripts/migrations/001_schema.sql + 008_offline_sync.sql).
 *
 * RxDB replication rules applied here:
 *   - primaryKey is a string (text PKs on the server; uuid PKs arrive as strings).
 *   - `_deleted` is declared so the supabase plugin's soft-delete mapping validates.
 *   - `_modified` is intentionally NOT declared — the plugin strips it on pull
 *     unless the schema declares it (we don't need it client-side; the plugin
 *     uses the server column only for its checkpoint).
 *   - Nullable columns are optional (not in `required`); the pull modifier in
 *     replication.ts strips `null` values because Supabase returns null for
 *     nullable columns, which RxDB validation would otherwise reject.
 */
import type { RxJsonSchema } from 'rxdb';

const idString = { type: 'string' as const, maxLength: 200 };
const str = { type: 'string' as const, maxLength: 200 };

// Document type interfaces for proper RxJsonSchema generics
export interface DailyVoucherDoc {
  id: string;
  farm_id: string;
  voucher_date: string;
  category: string;
  status: string;
  created_by?: string;
  submitted_by?: string;
  submitted_at?: string;
  locked_at?: string;
  reverted_at?: string;
  reverted_by?: string;
  created_at: string;
  updated_at: string;
  _deleted?: boolean;
}

export interface DailyVoucherLineDoc {
  id: string;
  voucher_id: string;
  item_id: string;
  formula_no?: string;
  mixer_count?: number;
  hall_numbers?: string;
  consumed_qty: number;
  waste_qty: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  hall_consumed?: Record<string, unknown>;
  formula_id?: string;
  adjustment_qty?: number;
  _deleted?: boolean;
}

export interface InventoryTransactionDoc {
  id: string;
  farm_id: string;
  item_id: string;
  txn_date: string;
  txn_ts: string;
  txn_type: string;
  qty_in: number;
  qty_out: number;
  unit_price: number;
  total_price: number;
  source_type?: string;
  source_id?: string;
  reference_no?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  attachment_url?: string;
  supplier_id?: string;
  _deleted?: boolean;
}

export interface FarmItemDoc {
  id: string;
  farm_id: string;
  category: string;
  name: string;
  unit: string;
  priority: number;
  reorder_point: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  manual_unit_price?: number;
  _deleted?: boolean;
}

export interface FarmHallDoc {
  id: string;
  farm_id: string;
  hall_number: number;
  name: string;
  is_active: boolean;
  created_at: string;
  _deleted?: boolean;
}

export interface FarmFeedFormulaDoc {
  id: string;
  farm_id: string;
  formula_no: number;
  name: string;
  mixer_weight: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  _deleted?: boolean;
}

export interface FarmFormulaItemDoc {
  id: string;
  formula_id: string;
  item_id: string;
  qty_per_mixer: number;
  created_at: string;
  _deleted?: boolean;
}

// ---------------------------------------------------------------------------
// Replicated (offline write): daily_vouchers, daily_voucher_lines,
// inventory_transactions
// ---------------------------------------------------------------------------

export const dailyVouchersSchema: RxJsonSchema<DailyVoucherDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: idString,
    farm_id: str,
    voucher_date: str,
    category: str,
    status: str,
    created_by: str,
    submitted_by: str,
    submitted_at: str,
    locked_at: str,
    reverted_at: str,
    reverted_by: str,
    created_at: str,
    updated_at: str,
    _deleted: { type: 'boolean' },
  },
  required: ['id', 'farm_id', 'voucher_date', 'category', 'status', 'created_at', 'updated_at'],
  indexes: ['farm_id', 'voucher_date', 'status'],
};

export const dailyVoucherLinesSchema: RxJsonSchema<DailyVoucherLineDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: idString,
    voucher_id: str,
    item_id: str,
    formula_no: str,
    mixer_count: { type: 'number' },
    hall_numbers: str,
    consumed_qty: { type: 'number' },
    waste_qty: { type: 'number' },
    notes: str,
    created_at: str,
    updated_at: str,
    hall_consumed: { type: 'object' },
    formula_id: str,
    adjustment_qty: { type: 'number' },
    _deleted: { type: 'boolean' },
  },
  required: ['id', 'voucher_id', 'item_id', 'consumed_qty', 'waste_qty', 'created_at', 'updated_at'],
  indexes: ['voucher_id', 'item_id'],
};

export const inventoryTransactionsSchema: RxJsonSchema<InventoryTransactionDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: idString,
    farm_id: str,
    item_id: str,
    txn_date: str,
    txn_ts: str,
    txn_type: str,
    qty_in: { type: 'number' },
    qty_out: { type: 'number' },
    unit_price: { type: 'number' },
    total_price: { type: 'number' },
    source_type: str,
    source_id: str,
    reference_no: str,
    notes: str,
    created_by: str,
    created_at: str,
    attachment_url: str,
    supplier_id: str,
    _deleted: { type: 'boolean' },
  },
  required: ['id', 'farm_id', 'item_id', 'txn_date', 'txn_ts', 'txn_type', 'qty_in', 'qty_out', 'created_at'],
  indexes: ['farm_id', 'item_id', 'txn_date'],
};

// ---------------------------------------------------------------------------
// Pull-only cache (offline read): farm_items, farm_halls, farm_feed_formulas,
// farm_formula_items
// ---------------------------------------------------------------------------

export const farmItemsSchema: RxJsonSchema<FarmItemDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: idString,
    farm_id: str,
    category: str,
    name: str,
    unit: str,
    priority: { type: 'number' },
    reorder_point: { type: 'number' },
    is_active: { type: 'boolean' },
    created_at: str,
    updated_at: str,
    manual_unit_price: { type: 'number' },
    _deleted: { type: 'boolean' },
  },
  required: ['id', 'farm_id', 'category', 'name', 'unit', 'priority', 'is_active', 'created_at', 'updated_at'],
  indexes: ['farm_id', 'category'],
};

export const farmHallsSchema: RxJsonSchema<FarmHallDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: idString,
    farm_id: str,
    hall_number: { type: 'number' },
    name: str,
    is_active: { type: 'boolean' },
    created_at: str,
    _deleted: { type: 'boolean' },
  },
  required: ['id', 'farm_id', 'hall_number', 'is_active', 'created_at'],
  indexes: ['farm_id'],
};

export const farmFeedFormulasSchema: RxJsonSchema<FarmFeedFormulaDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: idString,
    farm_id: str,
    formula_no: { type: 'number' },
    name: str,
    mixer_weight: { type: 'number' },
    is_active: { type: 'boolean' },
    created_at: str,
    updated_at: str,
    _deleted: { type: 'boolean' },
  },
  required: ['id', 'farm_id', 'formula_no', 'mixer_weight', 'is_active', 'created_at', 'updated_at'],
  indexes: ['farm_id'],
};

export const farmFormulaItemsSchema: RxJsonSchema<FarmFormulaItemDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: idString,
    formula_id: str,
    item_id: str,
    qty_per_mixer: { type: 'number' },
    created_at: str,
    _deleted: { type: 'boolean' },
  },
  required: ['id', 'formula_id', 'item_id', 'qty_per_mixer', 'created_at'],
  indexes: ['formula_id', 'item_id'],
};

/** All collections the offline DB registers, keyed by RxDB collection name. */
export const offlineCollections = {
  daily_vouchers: { schema: dailyVouchersSchema },
  daily_voucher_lines: { schema: dailyVoucherLinesSchema },
  inventory_transactions: { schema: inventoryTransactionsSchema },
  farm_items: { schema: farmItemsSchema },
  farm_halls: { schema: farmHallsSchema },
  farm_feed_formulas: { schema: farmFeedFormulasSchema },
  farm_formula_items: { schema: farmFormulaItemsSchema },
} as const;
