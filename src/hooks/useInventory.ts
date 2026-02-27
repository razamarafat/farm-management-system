import { useState, useEffect, useCallback } from 'react';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';
import type {
  InventoryTransaction,
  StockBalance,
  InventoryFilters,
  InitialStockInput,
  PurchaseInput,
  TransferInput,
  AdjustmentInput,
  TransactionType,
} from '@/types/inventory.types';

// Hook for fetching stock balances
export function useStockBalances(farmId: string | null, category: 'feed' | 'packaging' | 'all' = 'all') {
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!farmId) {
      setBalances([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get all farm items
      let itemsQuery = supabaseAdmin
        .from('farm_items')
        .select('id, name, unit, category, reorder_point')
        .eq('farm_id', farmId)
        .eq('is_active', true);

      if (category !== 'all') {
        itemsQuery = itemsQuery.eq('category', category);
      }

      const { data: items, error: itemsError } = await itemsQuery.order('priority', { ascending: true });

      if (itemsError) throw itemsError;

      // Get all transactions for this farm
      const { data: transactions, error: txnError } = await supabaseAdmin
        .from('inventory_transactions')
        .select('item_id, txn_type, qty_in, qty_out, txn_ts')
        .eq('farm_id', farmId);

      if (txnError) throw txnError;

      // Calculate balances
      const balanceMap = new Map<string, {
        total_in: number;
        total_out: number;
        has_initial: boolean;
        initial_qty: number;
        last_txn: string | null;
      }>();

      (transactions || []).forEach((txn) => {
        const current = balanceMap.get(txn.item_id) || {
          total_in: 0,
          total_out: 0,
          has_initial: false,
          initial_qty: 0,
          last_txn: null,
        };

        if (txn.txn_type === 'purchase' || txn.txn_type === 'transfer_in') {
          current.total_in += Number(txn.qty_in) || 0;
        } else if (txn.txn_type === 'initial') {
          current.has_initial = true;
          current.initial_qty += Number(txn.qty_in) || 0;
        } else {
          current.total_out += Number(txn.qty_out) || 0;
        }

        if (!current.last_txn || txn.txn_ts > current.last_txn) {
          current.last_txn = txn.txn_ts;
        }

        balanceMap.set(txn.item_id, current);
      });

      // Build balance list
      const result: StockBalance[] = (items || []).map((item) => {
        const txnData = balanceMap.get(item.id) || {
          total_in: 0,
          total_out: 0,
          has_initial: false,
          initial_qty: 0,
          last_txn: null,
        };

        return {
          farm_id: farmId,
          item_id: item.id,
          item_name: item.name,
          item_unit: item.unit,
          item_category: item.category,
          balance: txnData.initial_qty + txnData.total_in - txnData.total_out,
          total_in: txnData.total_in,
          total_out: txnData.total_out,
          has_initial: txnData.has_initial,
          initial_qty: txnData.initial_qty,
          last_transaction_at: txnData.last_txn || undefined,
          reorder_point: Number(item.reorder_point) || 0,
        };
      });

      setBalances(result);
    } catch (err) {
      console.error('Error fetching balances:', err);
      setError('خطا در دریافت موجودی انبار');
    } finally {
      setIsLoading(false);
    }
  }, [farmId, category]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return { balances, isLoading, error, refetch: fetchBalances };
}

// Hook for fetching transactions with filters
export function useInventoryTransactions(farmId: string | null, filters: InventoryFilters) {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!farmId) {
      setTransactions([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // First get transactions
      let query = supabaseAdmin
        .from('inventory_transactions')
        .select('*')
        .eq('farm_id', farmId)
        .order('txn_ts', { ascending: false });

      // Apply filters
      if (filters.item_id !== 'all') {
        query = query.eq('item_id', filters.item_id);
      }

      if (filters.txn_type !== 'all') {
        query = query.eq('txn_type', filters.txn_type);
      }

      if (filters.date_from) {
        query = query.gte('txn_date', filters.date_from);
      }

      if (filters.date_to) {
        query = query.lte('txn_date', filters.date_to);
      }

      if (filters.search) {
        query = query.or(`notes.ilike.%${filters.search}%,reference_no.ilike.%${filters.search}%`);
      }

      const { data: txnData, error: fetchError } = await query.limit(500);

      if (fetchError) throw fetchError;

      // Get item details separately
      const itemIds = [...new Set((txnData || []).map((t) => t.item_id))];
      let itemsMap = new Map<string, { id: string; name: string; unit: string; category: string }>();

      if (itemIds.length > 0) {
        const { data: itemsData } = await supabaseAdmin
          .from('farm_items')
          .select('id, name, unit, category')
          .in('id', itemIds);

        (itemsData || []).forEach((item) => {
          itemsMap.set(item.id, item);
        });
      }

      // Build transactions with item data
      let result: InventoryTransaction[] = (txnData || []).map((txn) => ({
        ...txn,
        item: itemsMap.get(txn.item_id),
      }));

      // Filter by category if needed
      if (filters.category !== 'all') {
        result = result.filter((t) => t.item?.category === filters.category);
      }

      setTransactions(result);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError('خطا در دریافت تراکنش‌ها');
    } finally {
      setIsLoading(false);
    }
  }, [farmId, filters]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return { transactions, isLoading, error, refetch: fetchTransactions };
}

// Hook for paginated transactions for a single item
export function usePaginatedTransactions(farmId: string | null, itemId: string, filters: Omit<InventoryFilters, 'item_id'>, pageSize: number = 20) {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!farmId || !itemId) {
      setTransactions([]);
      setTotalCount(0);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let query = supabaseAdmin
        .from('inventory_transactions')
        .select('*', { count: 'exact' })
        .eq('farm_id', farmId)
        .eq('item_id', itemId);

      // Apply filters
      if (filters.txn_type !== 'all') {
        query = query.eq('txn_type', filters.txn_type);
      }
      if (filters.date_from) {
        query = query.gte('txn_date', filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte('txn_date', filters.date_to);
      }
      if (filters.search) {
        query = query.or(`notes.ilike.%${filters.search}%,reference_no.ilike.%${filters.search}%`);
      }

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error: fetchError, count } = await query
        .order('txn_ts', { ascending: false })
        .range(from, to);

      if (fetchError) throw fetchError;

      setTransactions(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error('Error fetching paginated transactions:', err);
      setError('خطا در دریافت تاریخچه کالا');
    } finally {
      setIsLoading(false);
    }
  }, [farmId, itemId, filters, currentPage, pageSize]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return {
    transactions,
    totalCount,
    currentPage,
    setCurrentPage,
    totalPages: Math.ceil(totalCount / pageSize),
    isLoading,
    error,
    refetch: fetchTransactions
  };
}

// Hook for inventory mutations
export function useInventoryMutations(farmId: string | null) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, profile } = useAuthStore();
  const isSupervisor = profile?.role === 'supervisor';

  // Add initial stock
  const addInitialStock = useCallback(async (input: InitialStockInput) => {
    if (isSupervisor) {
      toast.error('شما مجوز ثبت موجودی اولیه را ندارید');
      return false;
    }
    if (!farmId || !user) {
      toast.error('اطلاعات فارم یا کاربر نامعتبر است');
      return false;
    }

    setIsSubmitting(true);
    try {
      // Check if initial stock already exists for this item
      const { data: existing } = await supabaseAdmin
        .from('inventory_transactions')
        .select('id')
        .eq('farm_id', farmId)
        .eq('item_id', input.item_id)
        .eq('txn_type', 'initial')
        .maybeSingle();

      if (existing) {
        toast.error('موجودی اولیه این کالا قبلاً ثبت شده است');
        return false;
      }

      const { error } = await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          farm_id: farmId,
          item_id: input.item_id,
          txn_date: input.txn_date,
          txn_type: 'initial' as TransactionType,
          qty_in: input.quantity >= 0 ? input.quantity : 0,
          qty_out: input.quantity < 0 ? Math.abs(input.quantity) : 0,
          notes: input.notes || null,
          created_by: user.id,
        });

      if (error) throw error;

      toast.success('موجودی اولیه با موفقیت ثبت شد');
      return true;
    } catch (err) {
      console.error('Error adding initial stock:', err);
      toast.error('خطا در ثبت موجودی اولیه');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [farmId, user, isSupervisor]);

  // Add purchase
  const addPurchase = useCallback(async (input: PurchaseInput) => {
    if (isSupervisor) {
      toast.error('شما مجوز ثبت خرید را ندارید');
      return false;
    }
    if (!farmId || !user) {
      toast.error('اطلاعات فارم یا کاربر نامعتبر است');
      return false;
    }

    setIsSubmitting(true);
    try {
      const totalPrice = input.unit_price ? input.quantity * input.unit_price : null;

      const { error } = await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          farm_id: farmId,
          item_id: input.item_id,
          txn_date: input.txn_date,
          txn_type: 'purchase' as TransactionType,
          qty_in: input.quantity,
          qty_out: 0,
          unit_price: input.unit_price || null,
          total_price: totalPrice,
          reference_no: input.reference_no || null,
          notes: input.notes || null,
          created_by: user.id,
        });

      if (error) throw error;

      toast.success('خرید با موفقیت ثبت شد');
      return true;
    } catch (err) {
      console.error('Error adding purchase:', err);
      toast.error('خطا در ثبت خرید');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [farmId, user, isSupervisor]);

  // Add transfer
  const addTransfer = useCallback(async (input: TransferInput, direction: 'in' | 'out') => {
    if (isSupervisor) {
      toast.error('شما مجوز ثبت انتقال را ندارید');
      return false;
    }
    if (!farmId || !user) {
      toast.error('اطلاعات فارم یا کاربر نامعتبر است');
      return false;
    }

    setIsSubmitting(true);
    try {
      const txnType = direction === 'in' ? 'transfer_in' : 'transfer_out';
      const qtyIn = direction === 'in' ? input.quantity : 0;
      const qtyOut = direction === 'out' ? input.quantity : 0;

      const { error } = await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          farm_id: farmId,
          item_id: input.item_id,
          txn_date: input.txn_date,
          txn_type: txnType as TransactionType,
          qty_in: qtyIn,
          qty_out: qtyOut,
          notes: input.notes || null,
          created_by: user.id,
        });

      if (error) throw error;

      toast.success(direction === 'in' ? 'انتقال ورودی ثبت شد' : 'انتقال خروجی ثبت شد');
      return true;
    } catch (err) {
      console.error('Error adding transfer:', err);
      toast.error('خطا در ثبت انتقال');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [farmId, user, isSupervisor]);

  // Add adjustment
  const addAdjustment = useCallback(async (input: AdjustmentInput) => {
    if (isSupervisor) {
      toast.error('شما مجوز ثبت تعدیل را ندارید');
      return false;
    }
    if (!farmId || !user) {
      toast.error('اطلاعات فارم یا کاربر نامعتبر است');
      return false;
    }

    if (!input.notes) {
      toast.error('توضیحات برای تعدیل الزامی است');
      return false;
    }

    setIsSubmitting(true);
    try {
      const qtyIn = input.quantity > 0 ? input.quantity : 0;
      const qtyOut = input.quantity < 0 ? Math.abs(input.quantity) : 0;

      const { error } = await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          farm_id: farmId,
          item_id: input.item_id,
          txn_date: input.txn_date,
          txn_type: 'adjustment' as TransactionType,
          qty_in: qtyIn,
          qty_out: qtyOut,
          notes: input.notes,
          created_by: user.id,
        });

      if (error) throw error;

      toast.success('تعدیل موجودی با موفقیت ثبت شد');
      return true;
    } catch (err) {
      console.error('Error adding adjustment:', err);
      toast.error('خطا در ثبت تعدیل');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [farmId, user, isSupervisor]);

  // Delete transaction (admin only - but allow operators)
  const deleteTransaction = useCallback(async (transactionId: string) => {
    if (isSupervisor) {
      toast.error('شما مجوز حذف تراکنش را ندارید');
      return false;
    }
    if (!user) {
      toast.error('کاربر نامعتبر است');
      return false;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabaseAdmin
        .from('inventory_transactions')
        .delete()
        .eq('id', transactionId);

      if (error) throw error;

      toast.success('تراکنش با موفقیت حذف شد');
      return true;
    } catch (err) {
      console.error('Error deleting transaction:', err);
      toast.error('خطا در حذف تراکنش');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [user, isSupervisor]);

  // Update transaction (admin only)
  const updateTransaction = useCallback(async (transactionId: string, updates: Partial<{
    qty_in: number;
    qty_out: number;
    txn_date: string;
    notes: string;
    reference_no: string;
    unit_price: number;
  }>) => {
    if (isSupervisor) {
      toast.error('شما مجوز ویرایش تراکنش را ندارید');
      return false;
    }
    if (!user) {
      toast.error('کاربر نامعتبر است');
      return false;
    }

    setIsSubmitting(true);
    try {
      const updateData: Record<string, unknown> = { ...updates };
      if (updates.unit_price && updates.qty_in) {
        updateData.total_price = updates.unit_price * updates.qty_in;
      }

      const { error } = await supabaseAdmin
        .from('inventory_transactions')
        .update(updateData)
        .eq('id', transactionId);

      if (error) throw error;

      toast.success('تراکنش با موفقیت بروزرسانی شد');
      return true;
    } catch (err) {
      console.error('Error updating transaction:', err);
      toast.error('خطا در بروزرسانی تراکنش');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [user, isSupervisor]);

  return {
    isSubmitting,
    addInitialStock,
    addPurchase,
    addTransfer,
    addAdjustment,
    deleteTransaction,
    updateTransaction,
  };
}

// Hook to check if item has initial stock
export function useItemInitialCheck(farmId: string | null) {
  const [itemsWithInitial, setItemsWithInitial] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const checkInitialStock = useCallback(async () => {
    if (!farmId) {
      setItemsWithInitial(new Set());
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabaseAdmin
        .from('inventory_transactions')
        .select('item_id')
        .eq('farm_id', farmId)
        .eq('txn_type', 'initial');

      if (error) throw error;

      const itemIds = new Set((data || []).map((t) => t.item_id));
      setItemsWithInitial(itemIds);
    } catch (err) {
      console.error('Error checking initial stock:', err);
    } finally {
      setIsLoading(false);
    }
  }, [farmId]);

  useEffect(() => {
    checkInitialStock();
  }, [checkInitialStock]);

  const hasInitialStock = useCallback((itemId: string) => {
    return itemsWithInitial.has(itemId);
  }, [itemsWithInitial]);

  return { itemsWithInitial, hasInitialStock, isLoading, refetch: checkInitialStock };
}
