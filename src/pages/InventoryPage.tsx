import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  Plus,
  Search,
  X,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Download,
  ChevronLeft,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useStockBalances, useInventoryTransactions, useInventoryMutations, useItemInitialCheck } from '@/hooks/useInventory';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Button } from '@/components/ui/Button';
import { exportInventoryTransactionsToExcel, exportStockBalanceToExcel } from '@/utils/excelExportPro';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from 'sonner';
import { toPersianNumbers, formatRial } from '@/utils/persianNumbers';
import { getJalaliToday, jalaliToGregorian } from '@/utils/jalaliDate';
import { JalaliDatePicker } from '@/components/ui/JalaliDatePicker';
import type { InventoryFilters, TransactionType, StockBalance } from '@/types/inventory.types';
import { TXN_TYPE_LABELS } from '@/types/inventory.types';

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

type TabType = 'balance' | 'transactions' | 'all-items';

export default function InventoryPage() {
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = profile?.role === 'admin';
  const isReadOnly = profile?.role === 'supervisor';

  // Farm selection for admin
  const [farms, setFarms] = useState<Farm[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(
    isAdmin ? null : profile?.farm_id || null
  );
  const [farmItems, setFarmItems] = useState<FarmItem[]>([]);
  const [lastPrices, setLastPrices] = useState<Map<string, number>>(new Map());

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
  const { isSubmitting, addInitialStock, addPurchase, addTransfer, addAdjustment } = useInventoryMutations(selectedFarmId);
  const { hasInitialStock, refetch: refetchInitialCheck } = useItemInitialCheck(selectedFarmId);

  // Load farms for admin
  useEffect(() => {
    if (isAdmin) {
      supabaseAdmin
        .from('farms')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name')
        .then(({ data }) => {
          setFarms(data || []);
          if (data && data.length > 0 && !selectedFarmId) {
            setSelectedFarmId(data[0].id);
          }
        });
    }
  }, [isAdmin]);

  // Load farm items
  useEffect(() => {
    if (selectedFarmId) {
      supabaseAdmin
        .from('farm_items')
        .select('id, name, unit, category')
        .eq('farm_id', selectedFarmId)
        .eq('is_active', true)
        .order('priority')
        .then(({ data }) => {
          setFarmItems(data || []);
          // ─── آخرین قیمت خرید ───────────────────────────────
          supabaseAdmin
            .from('inventory_transactions')
            .select('item_id, unit_price, txn_date')
            .eq('farm_id', selectedFarmId)
            .in('txn_type', ['purchase', 'transfer_in'])
            .not('unit_price', 'is', null)
            .gt('unit_price', 0)
            .order('txn_date', { ascending: false })
            .then(({ data: priceData }) => {
              const priceMap = new Map<string, number>();
              (priceData || []).forEach((row) => {
                if (!priceMap.has(row.item_id) && row.unit_price) {
                  priceMap.set(row.item_id, Number(row.unit_price));
                }
              });
              // اگر قیمت خرید ندارد، از manual_unit_price استفاده کن
              supabaseAdmin
                .from('farm_items')
                .select('id, manual_unit_price')
                .eq('farm_id', selectedFarmId)
                .not('manual_unit_price', 'is', null)
                .then(({ data: manualData }) => {
                  (manualData || []).forEach((row: any) => {
                    if (!priceMap.has(row.id) && row.manual_unit_price) {
                      priceMap.set(row.id, Number(row.manual_unit_price));
                    }
                  });
                  setLastPrices(priceMap);
                });
            });
        });
    }
  }, [selectedFarmId]);

  // Stats
  const stats = {
    totalItems: balances.length,
    lowStock: balances.filter((b) => b.balance > 0 && b.balance <= b.reorder_point).length,
  };

  // Handle form submit
  const handleSubmit = async () => {
    if (!formData.item_id || formData.quantity === '') {
      toast.error('لطفاً کالا و مقدار را وارد کنید');
      return;
    }

    const qty = parseFloat(formData.quantity);
    if (isNaN(qty)) {
      toast.error('مقدار باید عدد باشد');
      return;
    }

    // Validation based on transaction type
    if (modalType === 'initial') {
      // Initial inventory: allow zero and positive, reject negative
      if (qty < 0) {
        toast.error('مقدار موجودی اولیه نمی‌تواند منفی باشد');
        return;
      }
    } else {
      // Other transactions: require positive values only
      if (qty <= 0) {
        toast.error('مقدار باید عدد مثبت باشد');
        return;
      }
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


  const openAddModal = (type: typeof modalType, preSelectedItemId?: string) => {
    setModalType(type);
    resetForm();
    if (preSelectedItemId) {
      setFormData(prev => ({ ...prev, item_id: preSelectedItemId }));
    }
    setShowAddModal(true);
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
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">نقطه سفارش</Badge>;
    }
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">موجود</Badge>;
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
          <select
            value={selectedFarmId || ''}
            onChange={(e) => setSelectedFarmId(e.target.value)}
            className="px-4 py-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] min-w-[200px]"
          >
            <option value="">انتخاب فارم</option>
            {farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.name} ({farm.code})
              </option>
            ))}
          </select>
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
              <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                      <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 dark:text-blue-400">کل اقلام</p>
                      <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{toPersianNumbers(stats.totalItems)}</p>
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
              <Card 
                className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => {
                  const basePath = profile?.role === 'admin' ? '/admin' : profile?.role === 'supervisor' ? '/supervisor' : '/operator';
                  navigate(`${basePath}/inventory/reorder-points`);
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-xs text-amber-600 dark:text-amber-400">نقطه سفارش</p>
                      <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{toPersianNumbers(stats.lowStock)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-[var(--c-border)] pb-2">
            <button
              onClick={() => setActiveTab('balance')}
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === 'balance'
                ? 'bg-[var(--c-primary)] text-white'
                : 'text-[var(--c-muted-fg)] hover:bg-[var(--c-muted)]'
                }`}
            >
              <Package className="w-4 h-4 inline-block ml-2" />
              موجودی انبار
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === 'transactions'
                ? 'bg-[var(--c-primary)] text-white'
                : 'text-[var(--c-muted-fg)] hover:bg-[var(--c-muted)]'
                }`}
            >
              <RefreshCw className="w-4 h-4 inline-block ml-2" />
              تاریخچه کالا
            </button>
            <button
              onClick={() => setActiveTab('all-items')}
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${activeTab === 'all-items'
                ? 'bg-[var(--c-primary)] text-white'
                : 'text-[var(--c-muted-fg)] hover:bg-[var(--c-muted)]'
                }`}
            >
              <Package className="w-4 h-4 inline-block ml-2" />
              کالاهای انبار
            </button>
          </div>

          {/* Category Filter + Actions */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${categoryFilter === 'all'
                  ? 'bg-[var(--c-fg)] text-[var(--c-bg)]'
                  : 'bg-[var(--c-muted)] text-[var(--c-muted-fg)] hover:bg-[var(--c-border)]'
                  }`}
              >
                همه
              </button>
              <button
                onClick={() => setCategoryFilter('feed')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${categoryFilter === 'feed'
                  ? 'bg-green-600 text-white'
                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                  }`}
              >
                نهاده‌ها
              </button>
              <button
                onClick={() => setCategoryFilter('packaging')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${categoryFilter === 'packaging'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50'
                  }`}
              >
                بسته‌بندی
              </button>
            </div>
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
                              <th className="text-center py-3 px-4 text-xs font-semibold text-indigo-600 dark:text-indigo-400">آخرین فی خرید</th>
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
                                  <Badge className={balance.item_category === 'feed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}>
                                    {balance.item_category === 'feed' ? 'نهاده' : 'بسته‌بندی'}
                                  </Badge>
                                </td>
                                <td className="py-3 px-4 text-center text-sm text-[var(--c-muted-fg)]">{balance.item_unit}</td>
                                <td className="py-3 px-4 text-center text-sm">
                                  {balance.has_initial ? (
                                    <span className="text-purple-600 font-medium">{toPersianNumbers(balance.initial_qty.toLocaleString())}</span>
                                  ) : (
                                    <span className="text-[var(--c-muted-fg)]">—</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-center text-sm text-green-600 font-medium">
                                  {toPersianNumbers(balance.total_in.toLocaleString())}
                                </td>
                                <td className="py-3 px-4 text-center text-sm text-red-600 font-medium">
                                  {toPersianNumbers(balance.total_out.toLocaleString())}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className={`font-bold text-lg ${balance.balance < 0 ? 'text-red-600' :
                                    balance.balance === 0 ? 'text-[var(--c-muted-fg)]' :
                                      balance.balance <= balance.reorder_point ? 'text-amber-600' :
                                        'text-green-600'
                                    }`}>
                                    {toPersianNumbers(balance.balance.toLocaleString())}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  {getStatusBadge(balance)}
                                </td>
                                <td className="py-3 px-4 text-center text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                                  {lastPrices.has(balance.item_id)
                                    ? formatRial(lastPrices.get(balance.item_id)!)
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {balances.length > 0 && (
                  <div className="flex justify-end">
                    <Button
                      onClick={async () => await exportStockBalanceToExcel(balances, 'stock_balance')}
                      className="bg-green-600 hover:bg-green-700 text-white border-none"
                      size="sm"
                    >
                      <Download className="w-4 h-4 ml-1" />
                      خروجی اکسل
                    </Button>
                  </div>
                )}
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
                          className="w-full px-3 py-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm"
                        >
                          <option value="all">همه کالاها</option>
                          {farmItems.map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                        </select>
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

                {/* Export Button */}
                {transactions.length > 0 && (
                  <div className="flex justify-end">
                    <Button
                      onClick={async () => await exportInventoryTransactionsToExcel(transactions, 'inventory_transactions')}
                      className="bg-green-600 hover:bg-green-700 text-white border-none"
                      size="sm"
                    >
                      <Download className="w-4 h-4 ml-1" />
                      خروجی اکسل
                    </Button>
                  </div>
                )}

                {/* Item Groups - Replaced with Summary Table */}
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
                  <Card className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[var(--c-muted)] border-b border-[var(--c-border)]">
                            <tr>
                              <th className="py-4 px-4 text-center font-bold text-[var(--c-muted-fg)]">ردیف</th>
                              <th className="py-4 px-4 text-right font-bold text-[var(--c-muted-fg)]">نام کالا</th>
                              <th className="py-4 px-4 text-center font-bold text-[var(--c-muted-fg)]">موجودی اولیه</th>
                              <th className="py-4 px-4 text-center font-bold text-[var(--c-muted-fg)] text-green-700">کل ورودی</th>
                              <th className="py-4 px-4 text-center font-bold text-[var(--c-muted-fg)] text-red-700">کل مصرف/خروجی</th>
                              <th className="py-4 px-4 text-center font-bold text-[var(--c-muted-fg)]">باقیمانده</th>
                              <th className="py-4 px-4 text-center font-bold text-[var(--c-muted-fg)]">عملیات</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupedTransactions.map((group, index) => {
                              // We need the balance for this specific item. 
                              // groupedTransactions has group.item and group.txns.
                              // But we need the summary stats. We can calculate them from group.txns or use balances from useStockBalances.
                              // Let's calculate from group.txns for accuracy considering filters.

                              const initial = group.txns.filter(t => t.txn_type === 'initial').reduce((sum, t) => sum + (t.qty_in || 0), 0);
                              const totalIn = group.txns.filter(t => t.txn_type === 'purchase' || t.txn_type === 'transfer_in').reduce((sum, t) => sum + (t.qty_in || 0), 0);
                              const totalOut = group.txns.filter(t => t.txn_type !== 'initial' && t.txn_type !== 'purchase' && t.txn_type !== 'transfer_in')
                                .reduce((sum, t) => sum + (t.qty_out || 0), 0);
                              const balance = initial + totalIn - totalOut;

                              const basePath = profile?.role === 'admin' ? '/admin' : profile?.role === 'supervisor' ? '/supervisor' : '/operator';

                              return (
                                <tr key={group.item.id} className="border-b border-[var(--c-border)] hover:bg-[var(--c-muted)] transition-colors">
                                  <td className="py-4 px-4 text-center text-[var(--c-muted-fg)]">{toPersianNumbers(index + 1)}</td>
                                  <td className="py-4 px-4 text-right">
                                    <div className="font-bold text-[var(--c-fg)]">{group.item.name}</div>
                                    <div className="text-xs text-[var(--c-muted-fg)]">واحد: {group.item.unit} | {group.item.category === 'feed' ? 'نهاده' : 'بسته‌بندی'}</div>
                                  </td>
                                  <td className="py-4 px-4 text-center font-medium">{toPersianNumbers(initial.toLocaleString())}</td>
                                  <td className="py-4 px-4 text-center font-bold text-green-600">{toPersianNumbers(totalIn.toLocaleString())}</td>
                                  <td className="py-4 px-4 text-center font-bold text-red-600">{toPersianNumbers(totalOut.toLocaleString())}</td>
                                  <td className="py-4 px-4 text-center">
                                    <Badge variant={balance < 0 ? 'destructive' : 'secondary'} className="font-bold">
                                      {toPersianNumbers(balance.toLocaleString())}
                                    </Badge>
                                  </td>
                                  <td className="py-4 px-4 text-center">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => navigate(`${basePath}/inventory/items/${group.item.id}`)}
                                      className="text-primary border-primary/30 hover:bg-primary/5 h-8 px-3"
                                    >
                                      مشاهده تغییرات
                                      <ChevronLeft className="w-4 h-4 mr-1" />
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            )}

            {activeTab === 'all-items' && (
              <motion.div
                key="all-items"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">کالاهای انبار</CardTitle>
                    <p className="text-sm text-[var(--c-muted-fg)]">
                      لیست تمام کالاهای موجود. می‌توانید موجودی اولیه هر کالا را ثبت کنید و یا خریدها و انتقال‌های جدید را اضافه کنید.
                    </p>
                  </CardHeader>
                  <CardContent>
                    {balancesLoading ? (
                      <div className="flex items-center justify-center py-8">
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
                      <div className="space-y-2">
                        {balances.map((balance, index) => (
                          <div
                            key={balance.item_id}
                            className="p-4 rounded-lg border border-[var(--c-border)] hover:bg-[var(--c-muted)] transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3">
                                  <div className="text-sm font-medium text-[var(--c-muted-fg)]">
                                    {toPersianNumbers(index + 1)}
                                  </div>
                                  <div>
                                    <h4 className="font-medium text-[var(--c-fg)]">{balance.item_name}</h4>
                                    <p className="text-xs text-[var(--c-muted-fg)]">
                                      {balance.item_category === 'feed' ? 'نهاده' : 'بسته‌بندی'} | واحد: {balance.item_unit}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-4">
                                {balance.has_initial ? (
                                  <div className="text-center">
                                    <p className="text-xs text-[var(--c-muted-fg)]">موجودی اولیه</p>
                                    <p className="text-lg font-bold text-green-600">
                                      {toPersianNumbers(balance.initial_qty.toLocaleString())}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="text-center">
                                    <p className="text-xs text-[var(--c-muted-fg)]">موجودی اولیه</p>
                                    <p className="text-lg font-bold text-amber-600">-</p>
                                  </div>
                                )}

                                {!isReadOnly && (
                                  <div className="flex gap-2 flex-wrap">
                                    {!balance.has_initial ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-purple-600 border-purple-300"
                                        onClick={() => openAddModal('initial', balance.item_id)}
                                      >
                                        <Plus className="w-4 h-4 ml-1" />
                                        موجودی اولیه
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled
                                        className="text-green-600 border-green-300"
                                      >
                                        <CheckCircle className="w-4 h-4 ml-1" />
                                        ثبت شده
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
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
            onClick={() => setShowAddModal(false)}
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
                {formData.item_id ? (
                  <div>
                    <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">کالا</label>
                    <div className="px-3 py-2 rounded-md border border-[var(--c-border)] bg-[var(--c-muted)] text-[var(--c-fg)] font-medium">
                      {farmItems.find(i => i.id === formData.item_id)?.name} ({farmItems.find(i => i.id === formData.item_id)?.unit})
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">کالا *</label>
                    <select
                      value={formData.item_id}
                      onChange={(e) => setFormData({ ...formData, item_id: e.target.value })}
                      className="w-full px-3 py-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)]"
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
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">مقدار *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="no-spinners w-full px-3 py-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] font-sans text-lg"
                    value={formData.quantity ? toPersianNumbers(formData.quantity) : ''}
                    onChange={(e) => {
                      let val = e.target.value;
                      // Convert Persian digits to Latin
                      val = val.replace(/[۰-۹]/g, (d) => {
                        return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
                      });
                      setFormData({ ...formData, quantity: val });
                    }}
                    placeholder="۰"
                    dir="rtl"
                  />
                </div>

                {modalType === 'purchase' && (
                  <>
                    <div>
                      <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">قیمت واحد (ریال)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="no-spinners w-full px-3 py-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] font-sans text-lg"
                        value={formData.unit_price ? toPersianNumbers(formData.unit_price) : ''}
                        onChange={(e) => {
                          let val = e.target.value;
                          // Convert Persian digits to Latin
                          val = val.replace(/[۰-۹]/g, (d) => {
                            return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
                          });
                          setFormData({ ...formData, unit_price: val });
                        }}
                        placeholder="۰"
                        dir="rtl"
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
    </div>
  );
}
