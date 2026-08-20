/**
 * Read facade for the offline-first feature (Step B, read path).
 *
 * Every read the daily-sheet and inventory hooks perform goes through here.
 * When online it runs the exact same Supabase query as before (identical
 * behavior — no regression); when offline it answers from the RxDB local
 * collections (the 24h replicated window + the cached reference tables).
 *
 * Local reads always exclude soft-deleted rows (_deleted = true), which the
 * replication plugin pulls so deletions propagate to offline clients.
 */
import { supabase } from '@/lib/supabase';
import { checkSupabaseReachability } from '@/lib/supabaseReachability';
import { getOfflineDb } from './db';
import type { Database } from '@/types/database.types';

type FarmItemRow = Database['public']['Tables']['farm_items']['Row'];
type FarmHallRow = Database['public']['Tables']['farm_halls']['Row'];
type FeedFormulaRow = Database['public']['Tables']['farm_feed_formulas']['Row'];
type FormulaItemRow = Database['public']['Tables']['farm_formula_items']['Row'];
type VoucherLineRow = Database['public']['Tables']['daily_voucher_lines']['Row'];
type TxnRow = Database['public']['Tables']['inventory_transactions']['Row'];
type VoucherRow = Database['public']['Tables']['daily_vouchers']['Row'];
type Category = Database['public']['Enums']['item_category_enum'];

/** All farm items for a farm, optionally filtered by category, active only. */
export async function readFarmItems(farmId: string, category?: Category): Promise<FarmItemRow[]> {
  if (await checkSupabaseReachability()) {
    let q = supabase
      .from('farm_items')
      .select('*')
      .eq('farm_id', farmId)
      .eq('is_active', true);
    if (category) q = q.eq('category', category);
    const { data, error } = await q.order('priority', { ascending: true }).order('name', { ascending: true });
    if (error) throw error;
    return (data || []) as unknown as FarmItemRow[];
  }
  const db = await getOfflineDb();
  if (!db) return [];
  let query = db.farm_items
    .find()
    .where('farm_id')
    .eq(farmId)
    .where('is_active')
    .eq(true)
    .where('_deleted')
    .ne(true);
  if (category) query = query.where('category').eq(category);
  const docs = await query.sort({ priority: 'asc', name: 'asc' }).exec();
  return docs.map((d) => d.toJSON() as unknown as FarmItemRow);
}

/** All inventory transactions for a farm (used to compute balances). */
export async function readFarmTransactions(farmId: string): Promise<TxnRow[]> {
  if (await checkSupabaseReachability()) {
    const { data, error } = await supabase
      .from('inventory_transactions')
      .select('*')
      .eq('farm_id', farmId);
    if (error) throw error;
    return (data || []) as unknown as TxnRow[];
  }
  const db = await getOfflineDb();
  if (!db) return [];
  const docs = await db.inventory_transactions
    .find()
    .where('farm_id')
    .eq(farmId)
    .where('_deleted')
    .ne(true)
    .exec();
  return docs.map((d) => d.toJSON() as unknown as TxnRow);
}

/** Today's purchase transactions for a farm. */
export async function readTodayPurchases(farmId: string, date: string): Promise<TxnRow[]> {
  if (await checkSupabaseReachability()) {
    const { data, error } = await supabase
      .from('inventory_transactions')
      .select('*')
      .eq('farm_id', farmId)
      .eq('txn_date', date)
      .eq('txn_type', 'purchase');
    if (error) throw error;
    return (data || []) as unknown as TxnRow[];
  }
  const db = await getOfflineDb();
  if (!db) return [];
  const docs = await db.inventory_transactions
    .find()
    .where('farm_id')
    .eq(farmId)
    .where('txn_date')
    .eq(date)
    .where('txn_type')
    .eq('purchase')
    .where('_deleted')
    .ne(true)
    .exec();
  return docs.map((d) => d.toJSON() as unknown as TxnRow);
}

/** All lines of a voucher. */
export async function readVoucherLines(voucherId: string): Promise<VoucherLineRow[]> {
  if (await checkSupabaseReachability()) {
    const { data, error } = await supabase
      .from('daily_voucher_lines')
      .select('*')
      .eq('voucher_id', voucherId);
    if (error) throw error;
    return (data || []) as unknown as VoucherLineRow[];
  }
  const db = await getOfflineDb();
  if (!db) return [];
  const docs = await db.daily_voucher_lines
    .find()
    .where('voucher_id')
    .eq(voucherId)
    .where('_deleted')
    .ne(true)
    .exec();
  return docs.map((d) => d.toJSON() as unknown as VoucherLineRow);
}

/** Active feed formulas for a farm (feed category only). */
export async function readFeedFormulas(farmId: string): Promise<FeedFormulaRow[]> {
  if (await checkSupabaseReachability()) {
    const { data, error } = await supabase
      .from('farm_feed_formulas')
      .select('*')
      .eq('farm_id', farmId)
      .eq('is_active', true)
      .order('formula_no', { ascending: false });
    if (error) throw error;
    return (data || []) as unknown as FeedFormulaRow[];
  }
  const db = await getOfflineDb();
  if (!db) return [];
  const docs = await db.farm_feed_formulas
    .find()
    .where('farm_id')
    .eq(farmId)
    .where('is_active')
    .eq(true)
    .where('_deleted')
    .ne(true)
    .sort({ formula_no: 'desc' })
    .exec();
  return docs.map((d) => d.toJSON() as unknown as FeedFormulaRow);
}

/** Items of a specific formula. */
export async function readFormulaItems(formulaId: string): Promise<FormulaItemRow[]> {
  if (await checkSupabaseReachability()) {
    const { data, error } = await supabase
      .from('farm_formula_items')
      .select('*')
      .eq('formula_id', formulaId);
    if (error) throw error;
    return (data || []) as unknown as FormulaItemRow[];
  }
  const db = await getOfflineDb();
  if (!db) return [];
  const docs = await db.farm_formula_items
    .find()
    .where('formula_id')
    .eq(formulaId)
    .where('_deleted')
    .ne(true)
    .exec();
  return docs.map((d) => d.toJSON() as unknown as FormulaItemRow);
}

/** Active halls for a farm, ordered by hall number. */
export async function readFarmHalls(farmId: string): Promise<FarmHallRow[]> {
  if (await checkSupabaseReachability()) {
    const { data, error } = await supabase
      .from('farm_halls')
      .select('*')
      .eq('farm_id', farmId)
      .eq('is_active', true)
      .order('hall_number', { ascending: true });
    if (error) throw error;
    return (data || []) as unknown as FarmHallRow[];
  }
  const db = await getOfflineDb();
  if (!db) return [];
  const docs = await db.farm_halls
    .find()
    .where('farm_id')
    .eq(farmId)
    .where('is_active')
    .eq(true)
    .where('_deleted')
    .ne(true)
    .sort({ hall_number: 'asc' })
    .exec();
  return docs.map((d) => d.toJSON() as unknown as FarmHallRow);
}

/**
 * The voucher for (farm, date, category). Online: existing Supabase find
 * (the caller keeps the create-on-missing behavior). Offline: local lookup
 * only — creating a draft offline is the write path's job.
 */
export async function findVoucher(
  farmId: string,
  date: string,
  category: Category
): Promise<VoucherRow | null> {
  if (await checkSupabaseReachability()) {
    const { data, error } = await supabase
      .from('daily_vouchers')
      .select('id, farm_id, voucher_date, category, status, created_at, submitted_at')
      .eq('farm_id', farmId)
      .eq('voucher_date', date)
      .eq('category', category)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as VoucherRow) || null;
  }
  const db = await getOfflineDb();
  if (!db) return null;
  const doc = await db.daily_vouchers
    .findOne({
      selector: { farm_id: farmId, voucher_date: date, category, _deleted: false },
    })
    .exec();
  return doc ? (doc.toJSON() as unknown as VoucherRow) : null;
}
