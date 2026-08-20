import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Package, 
  Plus, 
  Search, 
  X, 
  AlertTriangle,
  CheckCircle,
  Archive,
  ShoppingCart,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useStockBalances, useInventoryTransactions, useInventoryMutations, useItemInitialCheck } from '@/hooks/useInventory';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from 'sonner';
import { toPersianNumbers } from '@/utils/persianNumbers';
import { getJalaliToday, jalaliToGregorian, formatJalaliDate } from '@/utils/jalaliDate';
import { JalaliDatePicker } from '@/components/ui/JalaliDatePicker';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { InventoryFilters, TransactionType, StockBalance } from '@/types/inventory.types';
import { TXN_TYPE_LABELS, TXN_TYPE_COLORS } from '@/types/inventory.types';

interface Farm {
  id: string;
  name: string;
  code: string;
}

interface FarmItem {
  id: string;
  name: string;
  unit: string;
  category: string;
}

type TabType = 'balance' | 'transactions' | 'initial';

export default function InventoryPage() {
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin';
  const isReadOnly = profile?.role === 'supervisor';

  // Farm selection for admin
  const [farms, setFarms] = useState<Farm[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(
    isAdmin ? null : profile?.farm_id || null
  );
  const [farmItems, setFarmItems] = useState<FarmItem[]>([]);
  const [isLoadingFarms, setIsLoadingFarms] = useState(false);
  const [farmsError, setFarmsError] = useState(false);
  const [isLoadingFarmItems, setIsLoadingFarmItems] = useState(false);
  const [farmItemsError, setFarmItemsError] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('balance');

  // Category filter
  const [categoryFilter, setCategoryFilter] = useState<'feed' | 'packaging' | 'all'>('all');

  // Filters for transactions
  const [filters, setFilters] = useState<InventoryFilters>({
    search: '',
    item_id: 'all',
    txn_type: 'all',
    date_from: getJalaliToday(),
    date_to: getJalaliToday(),
    category: 'all',
  });
  // Filter visibility handled inline

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTxnId, setDeleteTxnId] = useState<string | null>(null);
  const [modalType, setModalType] = useState<'initial' | 'purchase' | 'transfer_in' | 'transfer_out' | 'adjustment'>('initial');
  // Edit transaction functionality reserved for future

  // Form state
  const [formData, setFormData] = useState({
    item_id: '',
    quantity: '',
    unit_price: '',
    txn_date: getJalaliToday(),
    reference_no: '',
    notes: '',
  });

  // Hooks
  const { balances, isLoading: balancesLoading, refetch: refetchBalances } = useStockBalances(selectedFarmId, categoryFilter);
  const gregorianFilters = useMemo(() => ({
    ...filters,
    date_from: filters.date_from ? jalaliToGregorian(filters.date_from) : '',
    date_to: filters.date_to ? jalaliToGregorian(filters.date_to) : '',
  }), [filters.date_from, filters.date_to, filters.item_id, filters.txn_type, filters.search, filters.category]);

  const { transactions, isLoading: txnLoading, refetch: refetchTransactions } = useInventoryTransactions(selectedFarmId, gregorianFilters);
  const { isSubmitting, addInitialStock, addPurchase, addTransfer, addAdjustment, deleteTransaction } = useInventoryMutations(selectedFarmId);
  const { hasInitialStock, refetch: refetchInitialCheck } = useItemInitialCheck(selectedFarmId);

  // Load farms for admin — uses the user-authenticated `supabase` client
  // (NOT `supabaseAdmin`) so the request carries the admin's JWT and
  // satisfies the existing RLS policies.
  const loadFarms = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoadingFarms(true);
    setFarmsError(false);
    const { data, error } = await supabase
      .from('farms')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name');

    setIsLoadingFarms(false);
    if (error) {
      console.error('Error loading inventory farms:', error);
      setFarmsError(true);
      toast.error('خطا در دریافت فهرست فارم‌ها');
      return;
    }

    setFarms(data || []);
    setSelectedFarmId((current) => current || data?.[0]?.id || null);
  }, [isAdmin]);

  useEffect(() => {
    loadFarms();
  }, [loadFarms]);

  // Load farm items for the «ثبت موجودی اولیه/خرید/انتقال» modal.
  const loadFarmItems = useCallback(async () => {
    if (!selectedFarmId) {
      setFarmItems([]);
      return;
    }

    setIsLoadingFarmItems(true);
    setFarmItemsError(false);
    const { data, error } = await supabase
      .from('farm_items')
      .select('id, name, unit, category')
      .eq('farm_id', selectedFarmId)
      .eq('is_active', true)
      .order('priority');

    setIsLoadingFarmItems(false);
    if (error) {
      console.error('Error loading inventory farm items:', error);
      setFarmItemsError(true);
      toast.error('خطا در دریافت اقلام فارم');
      return;
    }

    setFarmItems(data || []);
  }, [selectedFarmId]);

  useEffect(() => {
    loadFarmItems();
  }, [loadFarmItems]);

  // Stats
  const stats = {
    totalItems: balances.length,
    lowStock: balances.filter((b) => b.balance > 0 && b.balance <= b.reorder_point).length,
  };

  // Handle form submit
  const handleSubmit = async () => {
    if (!formData.item_id || !formData.quantity) {
      toast.error('لطفاً کالا و مقدار را وارد کنید');
      return;
    }

    const qty = parseFloat(formData.quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error('مقدار باید عدد مثبت باشد');
      return;
    }

    let success = false;

    switch (modalType) {
      case 'initial':
        success = await addInitialStock({
          item_id: formData.item_id,
          quantity: qty,
          txn_date: jalaliToGregorian(formData.txn_date),
          notes: formData.notes,
        });
        break;
      case 'purchase':
        success = await addPurchase({
          item_id: formData.item_id,
          quantity: qty,
          unit_price: formData.unit_price ? parseFloat(formData.unit_price) : undefined,
          txn_date: jalaliToGregorian(formData.txn_date),
          reference_no: formData.reference_no,
          notes: formData.notes,
        });
        break;
      case 'transfer_in':
      case 'transfer_out':
        success = await addTransfer({
          item_id: formData.item_id,
          quantity: qty,
          txn_date: jalaliToGregorian(formData.txn_date),
          notes: formData.notes,
        }, modalType === 'transfer_in' ? 'in' : 'out');
        break;
      case 'adjustment':
        if (!formData.notes) {
          toast.error('توضیحات برای تعدیل الزامی است');
          return;
        }
        success = await addAdjustment({
          item_id: formData.item_id,
          quantity: qty,
          txn_date: jalaliToGregorian(formData.txn_date),
          notes: formData.notes,
        });
        break;
    }

    if (success) {
      setShowAddModal(false);
      resetForm();
      refetchBalances();
      refetchTransactions();
      refetchInitialCheck();
    }
  };

  const resetForm = () => {
    setFormData({
      item_id: '',
      quantity: '',
      unit_price: '',
      txn_date: getJalaliToday(),
      reference_no: '',
      notes: '',
    });
  };

  
  const openAddModal = (type: typeof modalType) => {
    setModalType(type);
    resetForm();
    setShowAddModal(true);
  };

  const confirmDeleteTransaction = async () => {
    if (!deleteTxnId) return;

    const success = await deleteTransaction(deleteTxnId);
    setDeleteTxnId(null);
    if (success) {
      refetchBalances();
      refetchTransactions();
      refetchInitialCheck();
    }
  };

  const getModalTitle = () => {
    switch (modalType) {
      case 'initial': return 'ثبت موجودی اولیه';
      case 'purchase': return 'ثبت خرید';
      case 'transfer_in': return 'ثبت انتقال ورودی';
      case 'transfer_out': return 'ثبت انتقال خروجی';
      case 'adjustment': return 'ثبت تعدیل موجودی';
    }
  };

  const getStatusBadge = (balance: StockBalance) => {
    if (balance.balance <= 0) {
      return <Badge variant="secondary">تمام شده</Badge>;
    }
    if (balance.balance <= balance.reorder_point) {
      return <Badge className="bg-[color-mix(in_srgb,var(--c-warning)_16%,transparent)] text-[var(--c-warning)]">نقطه سفارش</Badge>;
    }
    return <Badge className="bg-[color-mix(in_srgb,var(--c-success)_16%,transparent)] text-[var(--c-success)]">موجود</Badge>;
  };

  const filteredItems = farmItems.filter((item) => {
    if (categoryFilter === 'all') return true;
    return item.category === categoryFilter;
  });

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, { item: FarmItem; txns: typeof transactions }>();
    transactions.forEach((txn) => {
      const item = farmItems.find((i) => i.id === txn.item_id) || txn.item;
      if (!item) return;
      const existing = groups.get(item.id);
      if (existing) {
        existing.txns.push(txn);
      } else {
        groups.set(item.id, { item, txns: [txn] });
      }
    });
    return Array.from(groups.values());
  }, [transactions, farmItems]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-fg)]">انبارداری</h1>
          <p className="text-sm text-[var(--c-muted-fg)] mt-1">
            مدیریت موجودی، خرید، انتقال و تاریخچه کالا
          </p>
        </div>

        {/* Farm selector for admin */}
        {isAdmin && (
          <div>
            <select
              value={selectedFarmId || ''}
              onChange={(e) => setSelectedFarmId(e.target.value)}
              disabled={isLoadingFarms}
              className="px-4 py-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] min-w-[200px] disabled:opacity-50"
            >
              <option value="">انتخاب فارم</option>
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
            {isLoadingFarms && <span className="block mt-1 text-xs text-[var(--c-muted-fg)]">در حال بارگذاری...</span>}
            {farmsError && (
              <button type="button" onClick={loadFarms} className="mt-1 text-xs text-[var(--c-error)] underline">
                تلاش مجدد
              </button>
            )}
          </div>
        )}
      </div>

      {!selectedFarmId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="w-16 h-16 mx-auto text-[var(--c-muted-fg)] mb-4" />
            <p className="text-[var(--c-muted-fg)]">لطفاً یک فارم را انتخاب کنید</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <Card className="bg-[color-mix(in_srgb,var(--c-info)_16%,transparent)] border-[color-mix(in_srgb,var(--c-info)_30%,transparent)]">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[color-mix(in_srgb,var(--c-info)_30%,transparent)] flex items-center justify-center">
                      <Package className="w-5 h-5 text-[var(--c-info)]" />
                    </div>
                    <div>
                      <p className="text-xs text-[var(--c-info)]">کل اقلام</p>
                      <p className="text-xl font-bold text-[var(--c-info)]">{toPersianNumbers(stats.totalItems)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Link to={`${profile?.role === 'admin' ? '/admin' : profile?.role === 'supervisor' ? '/supervisor' : '/operator'}/reorder`} className="block">
                <Card className="bg-[color-mix(in_srgb,var(--c-warning)_16%,transparent)] border-[color-mix(in_srgb,var(--c-warning)_30%,transparent)] hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[color-mix(in_srgb,var(--c-warning)_30%,transparent)] flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-[var(--c-warning)]" />
                      </div>
                      <div>
                        <p className="text-xs text-[var(--c-warning)]">نقطه سفارش</p>
                        <p className="text-xl font-bold text-[var(--c-warning)]">{toPersianNumbers(stats.lowStock)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-[var(--c-border)] pb-2">
            <button
              onClick={() => setActiveTab('balance')}
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                activeTab === 'balance'
                  ? 'bg-[var(--c-primary)] text-[var(--c-primary-fg)]'
                  : 'text-[var(--c-muted-fg)] hover:bg-[var(--c-muted)]'
              }`}
            >
              <Package className="w-4 h-4 inline-block ml-2" />
              موجودی انبار
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                activeTab === 'transactions'
                  ? 'bg-[var(--c-primary)] text-[var(--c-primary-fg)]'
                  : 'text-[var(--c-muted-fg)] hover:bg-[var(--c-muted)]'
              }`}
            >
              <RefreshCw className="w-4 h-4 inline-block ml-2" />
              تاریخچه کالا
            </button>
            <button
              onClick={() => setActiveTab('initial')}
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                activeTab === 'initial'
                  ? 'bg-[var(--c-primary)] text-[var(--c-primary-fg)]'
                  : 'text-[var(--c-muted-fg)] hover:bg-[var(--c-muted)]'
              }`}
            >
              <Archive className="w-4 h-4 inline-block ml-2" />
              موجودی اولیه
            </button>
          </div>

          {/* Category Filter + Actions */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  categoryFilter === 'all'
                    ? 'bg-[var(--c-fg)] text-[var(--c-bg)]'
                    : 'bg-[var(--c-muted)] text-[var(--c-muted-fg)] hover:bg-[var(--c-border)]'
                }`}
              >
                همه
              </button>
              <button
                onClick={() => setCategoryFilter('feed')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  categoryFilter === 'feed'
                    ? 'bg-[var(--c-success)] text-[var(--c-primary-fg)]'
                    : 'bg-[color-mix(in_srgb,var(--c-success)_16%,transparent)] text-[var(--c-success)] hover:bg-[color-mix(in_srgb,var(--c-success)_30%,transparent)]'
                }`}
              >
                نهاده‌ها
              </button>
              <button
                onClick={() => setCategoryFilter('packaging')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  categoryFilter === 'packaging'
                    ? 'bg-[var(--c-info)] text-[var(--c-primary-fg)]'
                    : 'bg-[color-mix(in_srgb,var(--c-info)_16%,transparent)] text-[var(--c-info)] hover:bg-[color-mix(in_srgb,var(--c-info)_30%,transparent)]'
                }`}
              >
                بسته‌بندی
              </button>
            </div>

            {!isReadOnly && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openAddModal('initial')}
                  className="text-[var(--c-accent)] border-[color-mix(in_srgb,var(--c-accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--c-accent)_12%,transparent)]"
                >
                  <Archive className="w-4 h-4 ml-1" />
                  موجودی اولیه
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openAddModal('purchase')}
                  className="text-[var(--c-success)] border-[color-mix(in_srgb,var(--c-success)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--c-success)_12%,transparent)]"
                >
                  <ShoppingCart className="w-4 h-4 ml-1" />
                  خرید
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openAddModal('transfer_in')}
                  className="text-[#3A7D5C] border-[color-mix(in_srgb,#3A7D5C_30%,transparent)] hover:bg-[color-mix(in_srgb,#3A7D5C_12%,transparent)]"
                >
                  <ArrowDownLeft className="w-4 h-4 ml-1" />
                  انتقال ورودی
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openAddModal('transfer_out')}
                  className="text-[var(--c-warning)] border-[color-mix(in_srgb,var(--c-warning)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--c-warning)_12%,transparent)]"
                >
                  <ArrowUpRight className="w-4 h-4 ml-1" />
                  انتقال خروجی
                </Button>
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openAddModal('adjustment')}
                    className="text-[var(--c-secondary)] border-[color-mix(in_srgb,var(--c-secondary)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--c-secondary)_12%,transparent)]"
                  >
                    <RefreshCw className="w-4 h-4 ml-1" />
                    تعدیل
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {activeTab === 'balance' && (
              <motion.div
                key="balance"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card>
                  <CardContent className="p-0">
                    {balancesLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Spinner className="w-8 h-8" />
                      </div>
                    ) : balances.length === 0 ? (
                      <div className="text-center py-12">
                        <Package className="w-12 h-12 mx-auto text-[var(--c-muted-fg)] mb-3" />
                        <p className="text-[var(--c-muted-fg)]">کالایی یافت نشد</p>
                        <p className="text-sm text-[var(--c-muted-fg)] mt-1">
                          ابتدا از بخش مدیریت فارم، نهاده‌ها را تخصیص دهید
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-[var(--c-muted)] border-b border-[var(--c-border)]">
                            <tr>
                              <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">ردیف</th>
                              <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">نام کالا</th>
                              <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">دسته</th>
                              <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">واحد</th>
                              <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">موجودی اولیه</th>
                              <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">کل ورودی</th>
                              <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">کل خروجی</th>
                              <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">مانده</th>
                              <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">وضعیت</th>
                            </tr>
                          </thead>
                          <tbody>
                            {balances.map((balance, index) => (
                              <tr 
                                key={balance.item_id}
                                className="border-b border-[var(--c-border)] hover:bg-[var(--c-muted)] transition-colors"
                              >
                                <td className="py-3 px-4 text-center text-sm">{toPersianNumbers(index + 1)}</td>
                                <td className="py-3 px-4 text-center">
                                  <span className="font-medium text-[var(--c-fg)]">{balance.item_name}</span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <Badge className={balance.item_category === 'feed' ? 'bg-[color-mix(in_srgb,var(--c-success)_16%,transparent)] text-[var(--c-success)]' : 'bg-[color-mix(in_srgb,var(--c-info)_16%,transparent)] text-[var(--c-info)]'}>
                                    {balance.item_category === 'feed' ? 'نهاده' : 'بسته‌بندی'}
                                  </Badge>
                                </td>
                                <td className="py-3 px-4 text-center text-sm text-[var(--c-muted-fg)]">{balance.item_unit}</td>
                                <td className="py-3 px-4 text-center text-sm">
                                  {balance.has_initial ? (
                                    <span className="text-[var(--c-accent)] font-medium">{toPersianNumbers(balance.initial_qty.toLocaleString())}</span>
                                  ) : (
                                    <span className="text-[var(--c-muted-fg)]">—</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-center text-sm text-[var(--c-success)] font-medium">
                                  {toPersianNumbers(balance.total_in.toLocaleString())}
                                </td>
                                <td className="py-3 px-4 text-center text-sm text-[var(--c-error)] font-medium">
                                  {toPersianNumbers(balance.total_out.toLocaleString())}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className={`font-bold text-lg ${
                                    balance.balance < 0 ? 'text-[var(--c-error)]' :
                                    balance.balance === 0 ? 'text-[var(--c-muted-fg)]' :
                                    balance.balance <= balance.reorder_point ? 'text-[var(--c-warning)]' :
                                    'text-[var(--c-success)]'
                                  }`}>
                                    {toPersianNumbers(balance.balance.toLocaleString())}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  {getStatusBadge(balance)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {activeTab === 'transactions' && (
              <motion.div
                key="transactions"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Filters */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap gap-3 items-end">
                      <div className="flex-1 min-w-[200px]">
                        <label className="text-xs text-[var(--c-muted-fg)] mb-1 block">جستجو</label>
                        <div className="relative">
                          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-muted-fg)]" />
                          <Input
                            value={filters.search}
                            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                            placeholder="شماره مرجع، توضیحات..."
                            className="pr-10"
                          />
                        </div>
                      </div>
                      <div className="w-40">
                        <label className="text-xs text-[var(--c-muted-fg)] mb-1 block">نوع تراکنش</label>
                        <select
                          value={filters.txn_type}
                          onChange={(e) => setFilters({ ...filters, txn_type: e.target.value as TransactionType | 'all' })}
                          className="w-full px-3 py-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm"
                        >
                          <option value="all">همه</option>
                          {Object.entries(TXN_TYPE_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-40">
                        <label className="text-xs text-[var(--c-muted-fg)] mb-1 block">کالا</label>
                        <select
                          value={filters.item_id}
                          onChange={(e) => setFilters({ ...filters, item_id: e.target.value })}
                          disabled={isLoadingFarmItems}
                          className="w-full px-3 py-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm disabled:opacity-50"
                        >
                          <option value="all">همه کالاها</option>
                          {farmItems.map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                        </select>
                        {isLoadingFarmItems && <span className="block mt-1 text-xs text-[var(--c-muted-fg)]">در حال بارگذاری...</span>}
                        {farmItemsError && (
                          <button type="button" onClick={loadFarmItems} className="mt-1 text-xs text-[var(--c-error)] underline">
                            تلاش مجدد
                          </button>
                        )}
                      </div>
                      <div className="w-40">
                        <label className="text-xs text-[var(--c-muted-fg)] mb-1 block">از تاریخ (شمسی)</label>
                        <JalaliDatePicker
                          value={filters.date_from}
                          onChange={(val) => setFilters({ ...filters, date_from: val })}
                          placeholder="انتخاب تاریخ"
                        />
                      </div>
                      <div className="w-40">
                        <label className="text-xs text-[var(--c-muted-fg)] mb-1 block">تا تاریخ (شمسی)</label>
                        <JalaliDatePicker
                          value={filters.date_to}
                          onChange={(val) => setFilters({ ...filters, date_to: val })}
                          placeholder="انتخاب تاریخ"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFilters({
                          search: '',
                          item_id: 'all',
                          txn_type: 'all',
                          date_from: '',
                          date_to: '',
                          category: 'all',
                        })}
                      >
                        <X className="w-4 h-4 ml-1" />
                        پاک کردن
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Item Groups */}
                {txnLoading ? (
                  <Card>
                    <CardContent className="p-10 flex items-center justify-center">
                      <Spinner className="w-8 h-8" />
                    </CardContent>
                  </Card>
                ) : groupedTransactions.length === 0 ? (
                  <Card>
                    <CardContent className="p-10 text-center">
                      <RefreshCw className="w-12 h-12 mx-auto text-[var(--c-muted-fg)] mb-3" />
                      <p className="text-[var(--c-muted-fg)]">تراکنشی یافت نشد</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {groupedTransactions.map((group) => (
                      <Card key={group.item.id}>
                        <CardHeader className="pb-2">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                              <CardTitle className="text-base">{group.item.name}</CardTitle>
                              <p className="text-xs text-[var(--c-muted-fg)]">واحد: {group.item.unit} | دسته: {group.item.category === 'feed' ? 'نهاده' : 'بسته‌بندی'}</p>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <Badge variant="secondary">تعداد تراکنش: {toPersianNumbers(group.txns.length)}</Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-0">
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-[var(--c-muted)] border-b border-[var(--c-border)]">
                                <tr>
                                  <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">تاریخ</th>
                                  <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">نوع</th>
                                  <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">ورودی</th>
                                  <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">خروجی</th>
                                  <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">شماره مرجع</th>
                                  <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">توضیحات</th>
                                  <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">مشاهده سند</th>
                                  {isAdmin && (
                                    <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">عملیات</th>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {group.txns.map((txn) => {
                                  const typeInfo = TXN_TYPE_COLORS[txn.txn_type as TransactionType];
                                  const basePath = profile?.role === 'admin' ? '/admin' : profile?.role === 'supervisor' ? '/supervisor' : '/operator';
                                  const targetLink = txn.source_type === 'daily_voucher' && txn.source_id
                                    ? `${basePath}/consumption/${txn.txn_type === 'consumption' || txn.txn_type === 'waste' ? 'feed' : 'packaging'}?date=${txn.txn_date}`
                                    : '';
                                  return (
                                    <tr key={txn.id} className="border-b border-[var(--c-border)] hover:bg-[var(--c-muted)] transition-colors">
                                      <td className="py-3 px-4 text-center text-sm">{formatJalaliDate(txn.txn_date)}</td>
                                      <td className="py-3 px-4 text-center">
                                        <Badge className={`${typeInfo?.bg || ''} ${typeInfo?.text || ''}`}>
                                          {TXN_TYPE_LABELS[txn.txn_type as TransactionType] || txn.txn_type}
                                        </Badge>
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm text-[var(--c-success)] font-medium">
                                        {txn.qty_in > 0 ? `+${toPersianNumbers(txn.qty_in.toLocaleString())}` : '—'}
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm text-[var(--c-error)] font-medium">
                                        {txn.qty_out > 0 ? `-${toPersianNumbers(txn.qty_out.toLocaleString())}` : '—'}
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm text-[var(--c-muted-fg)]">
                                        {txn.reference_no || '—'}
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm text-[var(--c-muted-fg)] max-w-[200px] truncate">
                                        {txn.notes || '—'}
                                      </td>
                                      <td className="py-3 px-4 text-center text-sm">
                                        {targetLink ? (
                                          <a
                                            href={targetLink}
                                            className="text-primary hover:underline"
                                          >
                                            مشاهده سند
                                          </a>
                                        ) : (
                                          <span className="text-[var(--c-muted-fg)]">—</span>
                                        )}
                                      </td>
                                      {isAdmin && (
                                        <td className="py-3 px-4 text-center">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setDeleteTxnId(txn.id)}
                                            className="text-[var(--c-error)] hover:bg-[color-mix(in_srgb,var(--c-destructive)_10%,transparent)]"
                                            aria-label="حذف تراکنش"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </Button>
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'initial' && (
              <motion.div
                key="initial"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">ثبت موجودی اولیه</CardTitle>
                    <p className="text-sm text-[var(--c-muted-fg)]">
                      برای شروع کار با انبار، باید موجودی اولیه هر کالا را ثبت کنید. بدون ثبت موجودی اولیه، امکان ثبت مصرف وجود ندارد.
                    </p>
                  </CardHeader>
                  <CardContent>
                    {balancesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Spinner className="w-8 h-8" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {balances.map((balance) => (
                          <div
                            key={balance.item_id}
                            className={`p-4 rounded-lg border-2 transition-all ${
                              balance.has_initial
                                ? 'border-[color-mix(in_srgb,var(--c-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--c-success)_10%,transparent)]'
                                : 'border-[color-mix(in_srgb,var(--c-accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--c-accent)_10%,transparent)]'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h4 className="font-medium text-[var(--c-fg)]">{balance.item_name}</h4>
                                <p className="text-xs text-[var(--c-muted-fg)]">
                                  {balance.item_category === 'feed' ? 'نهاده' : 'بسته‌بندی'} | {balance.item_unit}
                                </p>
                              </div>
                              {balance.has_initial ? (
                                <CheckCircle className="w-5 h-5 text-[var(--c-success)]" />
                              ) : (
                                <AlertTriangle className="w-5 h-5 text-[var(--c-accent)]" />
                              )}
                            </div>

                            {balance.has_initial ? (
                              <div className="text-center py-2">
                                <p className="text-xs text-[var(--c-muted-fg)]">موجودی اولیه</p>
                                <p className="text-2xl font-bold text-[var(--c-success)]">
                                  {toPersianNumbers(balance.initial_qty.toLocaleString())}
                                </p>
                                <p className="text-xs text-[var(--c-muted-fg)]">{balance.item_unit}</p>
                              </div>
                            ) : (
                              !isReadOnly && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full text-[var(--c-accent)] border-[color-mix(in_srgb,var(--c-accent)_30%,transparent)]"
                                  onClick={() => {
                                    setFormData({ ...formData, item_id: balance.item_id });
                                    openAddModal('initial');
                                  }}
                                >
                                  <Plus className="w-4 h-4 ml-1" />
                                  ثبت موجودی اولیه
                                </Button>
                              )
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-[var(--c-card)] rounded-xl shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-[var(--c-border)]">
                <h3 className="text-lg font-bold text-[var(--c-fg)]">{getModalTitle()}</h3>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">کالا *</label>
                  <select
                    value={formData.item_id}
                    onChange={(e) => setFormData({ ...formData, item_id: e.target.value })}
                    disabled={isLoadingFarmItems}
                    className="w-full px-3 py-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] disabled:opacity-50"
                  >
                    <option value="">انتخاب کنید</option>
                    {filteredItems.map((item) => {
                      const hasInit = hasInitialStock(item.id);
                      const disabled = modalType === 'initial' && hasInit;
                      return (
                        <option key={item.id} value={item.id} disabled={disabled}>
                          {item.name} ({item.unit}) {disabled ? '✓ ثبت شده' : ''}
                        </option>
                      );
                    })}
                  </select>
                  {isLoadingFarmItems && <span className="mt-1 block text-xs text-[var(--c-muted-fg)]">در حال بارگذاری...</span>}
                  {farmItemsError && (
                    <button type="button" onClick={loadFarmItems} className="mt-1 text-xs text-[var(--c-error)] underline">
                      تلاش مجدد
                    </button>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">مقدار *</label>
                  <Input
                    type="number"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    placeholder="۰"
                    min="0"
                    step="0.001"
                    dir="ltr"
                  />
                </div>

                {modalType === 'purchase' && (
                  <>
                    <div>
                      <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">قیمت واحد (ریال)</label>
                      <Input
                        type="number"
                        value={formData.unit_price}
                        onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                        placeholder="۰"
                        min="0"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">شماره فاکتور/مرجع</label>
                      <Input
                        value={formData.reference_no}
                        onChange={(e) => setFormData({ ...formData, reference_no: e.target.value })}
                        placeholder="شماره فاکتور خرید"
                        dir="ltr"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">تاریخ (شمسی)</label>
                  <JalaliDatePicker
                    value={formData.txn_date}
                    onChange={(val) => setFormData({ ...formData, txn_date: val })}
                    placeholder="انتخاب تاریخ"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">
                    توضیحات {modalType === 'adjustment' && '*'}
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder={modalType === 'adjustment' ? 'دلیل تعدیل را بنویسید (الزامی)' : 'توضیحات اختیاری'}
                    rows={3}
                    className="w-full px-3 py-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] resize-none"
                  />
                </div>
              </div>

              <div className="p-6 border-t border-[var(--c-border)] flex gap-3 justify-end">
                <Button
                  variant="ghost"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSubmitting}
                >
                  انصراف
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Spinner className="w-4 h-4 ml-2" />
                      در حال ثبت...
                    </>
                  ) : (
                    'ثبت'
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={deleteTxnId !== null}
        onClose={() => setDeleteTxnId(null)}
        title="حذف تراکنش"
        message="آیا از حذف این تراکنش اطمینان دارید؟ این عمل قابل بازگشت نیست."
        confirmLabel="حذف"
        cancelLabel="انصراف"
        onConfirm={confirmDeleteTransaction}
        isLoading={isSubmitting}
        variant="destructive"
      />
    </div>
  );
}
