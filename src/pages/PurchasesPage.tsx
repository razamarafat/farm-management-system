import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  ShoppingCart, 
  ArrowDownToLine,
  Building2,
  Truck,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Save,
  Pencil,
  Trash2,
  Search,
  RefreshCw,
  FileText,
  History,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useModuleReset } from '@/hooks/useModuleReset';
import { supabase } from '@/lib/supabase';
import { useActiveSuppliers } from '@/hooks/useSuppliers';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FileUpload } from '@/components/ui/FileUpload';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';
import { toPersianNumbers, formatNumberWithSeparator } from '@/utils/persianNumbers';
import { assertMutationAffected } from '@/utils/mutationGuard';
import { getJalaliToday, jalaliToGregorian, gregorianToJalali, formatJalaliDate } from '@/utils/jalaliDate';
import { JalaliDatePicker } from '@/components/ui/JalaliDatePicker';
import type { InventoryTransaction } from '@/types/inventory.types';

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


type TransactionType = 'purchase' | 'transfer_in' | 'transfer_out';

export default function PurchasesPage() {
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = profile?.role === 'admin';
  const isReadOnly = profile?.role === 'supervisor';
  // Role-scoped base for shortcuts to sibling modules (reports / kardex).
  const roleBase = profile?.role === 'admin' ? '/admin' : profile?.role === 'supervisor' ? '/supervisor' : '/operator';

  // Farm selection for admin
  const [farms, setFarms] = useState<Farm[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(
    isAdmin ? null : profile?.farm_id || null
  );
  const [farmItems, setFarmItems] = useState<FarmItem[]>([]);
  const [isLoadingFarms, setIsLoadingFarms] = useState(false);
  const [farmsError, setFarmsError] = useState(false);
  const [isLoadingOtherFarms, setIsLoadingOtherFarms] = useState(false);
  const [otherFarmsError, setOtherFarmsError] = useState(false);
  const [isLoadingFarmItems, setIsLoadingFarmItems] = useState(false);
  const [farmItemsError, setFarmItemsError] = useState(false);

  // Active tab: 'cards' | 'purchase' | 'transfer_in' | 'transfer_out'
  const [activeTab, setActiveTab] = useState<string>('cards');

  // register reset button for returning to the cards overview
  const [isSubmitting, setIsSubmitting] = useState(false);

  // keep header button in sync with tab state (reset to cards)
  useModuleReset(activeTab !== 'cards', () => setActiveTab('cards'));

  // Form data
  const [formData, setFormData] = useState({
    item_id: '',
    quantity: '',
    deficit: '',
    unit_price: '',
    total_price: '',
    supplier_id: '',
    truck_number: '',
    driver_name: '',
    shipping_cost: '',
    attachment_url: '',
    from_farm_id: '',
    to_farm_id: '',
    txn_date: getJalaliToday(),
    notes: '',
    items: [{ item_id: '', quantity: '', unit_price: '', notes: '' }],
  });

  // Other farms for transfer
  const [otherFarms, setOtherFarms] = useState<Farm[]>([]);
  
  // Suppliers
  const { suppliers: activeSuppliers } = useActiveSuppliers();

  // Transactions ledger state
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [isLoadingTxns, setIsLoadingTxns] = useState(false);
  const [editingTxnId, setEditingTxnId] = useState<string | null>(null);
  const [deleteTxnId, setDeleteTxnId] = useState<string | null>(null);
  const [isDeletingTxn, setIsDeletingTxn] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<'all' | 'purchase' | 'transfer_in' | 'transfer_out'>('all');
  // The recent-history ledger is collapsible (collapsed by default) so the
  // primary registration workflow stays clean — the full Kardex lives in
  // the reports module, linked prominently below.
  const [showLedger, setShowLedger] = useState(false);


  // Load farms — uses the JWT-bound `supabase` client.
  const loadFarms = useCallback(async () => {
    setIsLoadingFarms(true);
    setFarmsError(false);
    const { data, error } = await supabase
      .from('farms')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name');

    setIsLoadingFarms(false);
    if (error) {
      console.error('Error loading purchase farms:', error);
      setFarmsError(true);
      toast.error('خطا در دریافت فهرست فارم‌ها');
      return;
    }

    const loadedFarms = data || [];
    setFarms(loadedFarms);
    setSelectedFarmId((current) => current || profile?.farm_id || loadedFarms[0]?.id || null);
  }, [profile?.farm_id]);

  useEffect(() => {
    loadFarms();
  }, [loadFarms]);

  // Load other farms for transfers — same JWT-bound client.
  const loadOtherFarms = useCallback(async () => {
    if (!selectedFarmId) {
      setOtherFarms([]);
      return;
    }

    setIsLoadingOtherFarms(true);
    setOtherFarmsError(false);
    const { data, error } = await supabase
      .from('farms')
      .select('id, name, code')
      .eq('is_active', true)
      .neq('id', selectedFarmId)
      .order('name');

    setIsLoadingOtherFarms(false);
    if (error) {
      console.error('Error loading transfer farms:', error);
      setOtherFarmsError(true);
      toast.error('خطا در دریافت فهرست فارم‌ها');
      return;
    }

    setOtherFarms(data || []);
  }, [selectedFarmId]);

  useEffect(() => {
    loadOtherFarms();
  }, [loadOtherFarms]);

  // Load farm items.
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
      .order('category')
      .order('name');

    setIsLoadingFarmItems(false);
    if (error) {
      console.error('Error loading purchase farm items:', error);
      setFarmItemsError(true);
      toast.error('خطا در دریافت اقلام فارم');
      return;
    }

    setFarmItems(data || []);
  }, [selectedFarmId]);

  useEffect(() => {
    loadFarmItems();
  }, [loadFarmItems]);

  // Load transactions ledger
  const loadTransactions = useCallback(async () => {
    if (!selectedFarmId) {
      setTransactions([]);
      return;
    }
    setIsLoadingTxns(true);
    try {
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select('*')
        .eq('farm_id', selectedFarmId)
        .in('txn_type', ['purchase', 'transfer_in', 'transfer_out'])
        .order('txn_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setTransactions(data || []);
    } catch (err) {
      console.error('Error loading purchase transactions:', err);
      toast.error('خطا در دریافت لیست تراکنش‌ها');
    } finally {
      setIsLoadingTxns(false);
    }
  }, [selectedFarmId]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const handleEdit = (txn: InventoryTransaction) => {
    if (isReadOnly) return;
    setEditingTxnId(txn.id);
    const qty = txn.qty_in > 0 ? txn.qty_in : txn.qty_out;
    setFormData({
      item_id: txn.item_id || '',
      quantity: String(qty || ''),
      deficit: '',
      unit_price: txn.unit_price ? String(txn.unit_price) : '',
      total_price: txn.total_price ? txn.total_price.toLocaleString() : '',
      supplier_id: txn.supplier_id || (txn.source_type === 'supplier' ? txn.source_id : '') || '',
      truck_number: '',
      driver_name: '',
      shipping_cost: '',
      attachment_url: txn.attachment_url || '',
      from_farm_id: (txn.source_type === 'farm' && txn.txn_type === 'transfer_in') ? txn.source_id || '' : '',
      to_farm_id: (txn.source_type === 'farm' && txn.txn_type === 'transfer_out') ? txn.source_id || '' : '',
      txn_date: gregorianToJalali(txn.txn_date),
      notes: txn.notes || '',
      items: [{ item_id: '', quantity: '', unit_price: '', notes: '' }],
    });
    setActiveTab(txn.txn_type as TransactionType);
  };

  const handleDeleteTxn = async () => {
    if (!deleteTxnId || isReadOnly) return;
    setIsDeletingTxn(true);
    try {
      // `.select('id')` + row-count guard: an RLS-denied DELETE returns
      // zero rows with NO error — without the check the toast below would
      // falsely claim success while the row survives reload.
      const { data, error } = await supabase
        .from('inventory_transactions')
        .delete()
        .eq('id', deleteTxnId)
        .select('id');

      assertMutationAffected(data, error);
      toast.success('تراکنش با موفقیت حذف شد');
      setDeleteTxnId(null);
      await loadTransactions();
    } catch (err) {
      console.error('Error deleting transaction:', err);
      toast.error(err instanceof Error ? err.message : 'خطا در حذف تراکنش');
    } finally {
      setIsDeletingTxn(false);
    }
  };

  // Navigate to specific form
  const navigateToForm = (type: TransactionType) => {
    if (isReadOnly) return;
    setEditingTxnId(null);
    resetForm();
    setActiveTab(type);
  };

  // Go back to cards
  const goBackToCards = () => {
    setEditingTxnId(null);
    setActiveTab('cards');
    resetForm();
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      item_id: '',
      quantity: '',
      deficit: '',
      unit_price: '',
      total_price: '',
      supplier_id: '',
      truck_number: '',
      driver_name: '',
      shipping_cost: '',
      attachment_url: '',
      from_farm_id: '',
      to_farm_id: '',
      txn_date: getJalaliToday(),
      notes: '',
      items: [{ item_id: '', quantity: '', unit_price: '', notes: '' }],
    });
  };

  // Calculate total price
  useEffect(() => {
    if (formData.quantity && formData.unit_price) {
      const deficitAmount = parseFloat(formData.deficit || '0') || 0;
      const actualQty = Math.max(0, Math.round((parseFloat(formData.quantity) - deficitAmount) * 1000) / 1000);
      const shippingCost = parseFloat(formData.shipping_cost || '0') || 0;
      const unitPrice = parseFloat(formData.unit_price) || 0;
      const total = Math.round(actualQty * unitPrice + shippingCost);
      setFormData(prev => ({ ...prev, total_price: total.toLocaleString() }));
    }
  }, [formData.quantity, formData.unit_price, formData.deficit, formData.shipping_cost]);

  // Submit form
  const handleSubmit = async () => {
    if (isSubmitting || isReadOnly) return;
    if (!selectedFarmId) {
      toast.error('لطفاً یک فارم را انتخاب کنید');
      return;
    }

    const activeType = activeTab as TransactionType;
    
    if (activeType === 'purchase' || activeType === 'transfer_in' || activeType === 'transfer_out') {
      if (!formData.item_id || !formData.quantity) {
        toast.error('لطفاً کالا و مقدار را وارد کنید');
        return;
      }
    }

    const qty = parseFloat(formData.quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error('مقدار باید عدد مثبت باشد');
      return;
    }

    setIsSubmitting(true);
    try {
      let success = false;

      if (activeType === 'purchase') {
        const deficitAmount = parseFloat(formData.deficit || '0') || 0;
        const actualQty = Math.max(0, Math.round((qty - deficitAmount) * 1000) / 1000);
        const unitPrice = formData.unit_price ? parseFloat(formData.unit_price) : null;
        const totalPrice = unitPrice ? Math.round(actualQty * unitPrice) : null;
        const shippingCost = formData.shipping_cost ? parseFloat(formData.shipping_cost) : 0;
        const costPrice = totalPrice !== null ? totalPrice + Math.round(shippingCost) : null;
        
        if (editingTxnId) {
          const { data, error } = await supabase
            .from('inventory_transactions')
            .update({
              item_id: formData.item_id,
              txn_date: jalaliToGregorian(formData.txn_date),
              qty_in: actualQty,
              qty_out: 0,
              unit_price: unitPrice,
              total_price: costPrice,
              notes: formData.notes || null,
              attachment_url: formData.attachment_url || null,
              supplier_id: formData.supplier_id || null,
            })
            .eq('id', editingTxnId)
            .select('id');

          assertMutationAffected(data, error);
          success = true;
          toast.success('خرید با موفقیت ویرایش شد');
        } else {
          const { error } = await supabase
            .from('inventory_transactions')
            .insert({
              farm_id: selectedFarmId,
              item_id: formData.item_id,
              txn_date: jalaliToGregorian(formData.txn_date),
              txn_type: 'purchase' as TransactionType,
              qty_in: actualQty,
              qty_out: 0,
              unit_price: unitPrice,
              total_price: costPrice,
              notes: formData.notes || null,
              created_by: profile?.id,
              attachment_url: formData.attachment_url || null,
              supplier_id: formData.supplier_id || null,
            });

          if (error) throw error;
          success = true;
          toast.success('خرید با موفقیت ثبت شد');
        }
      } 
      else if (activeType === 'transfer_in') {
        if (!formData.from_farm_id) {
          toast.error('لطفاً فارم مبدأ را انتخاب کنید');
          setIsSubmitting(false);
          return;
        }

        if (editingTxnId) {
          const { data, error } = await supabase
            .from('inventory_transactions')
            .update({
              item_id: formData.item_id,
              txn_date: jalaliToGregorian(formData.txn_date),
              qty_in: qty,
              qty_out: 0,
              source_type: 'farm',
              source_id: formData.from_farm_id,
              notes: formData.notes || null,
              attachment_url: formData.attachment_url || null,
            })
            .eq('id', editingTxnId)
            .select('id');

          assertMutationAffected(data, error);
          success = true;
          toast.success('دریافت از واحدها با موفقیت ویرایش شد');
        } else {
          const { error } = await supabase
            .from('inventory_transactions')
            .insert({
              farm_id: selectedFarmId,
              item_id: formData.item_id,
              txn_date: jalaliToGregorian(formData.txn_date),
              txn_type: 'transfer_in' as TransactionType,
              qty_in: qty,
              qty_out: 0,
              source_type: 'farm',
              source_id: formData.from_farm_id,
              notes: formData.notes || null,
              created_by: profile?.id,
              attachment_url: formData.attachment_url || null,
            });

          if (error) throw error;
          success = true;
          toast.success('دریافت از واحدها با موفقیت ثبت شد');
        }
      }
      else if (activeType === 'transfer_out') {
        if (!formData.to_farm_id) {
          toast.error('لطفاً فارم مقصد را انتخاب کنید');
          setIsSubmitting(false);
          return;
        }

        if (editingTxnId) {
          const { data, error } = await supabase
            .from('inventory_transactions')
            .update({
              item_id: formData.item_id,
              txn_date: jalaliToGregorian(formData.txn_date),
              qty_in: 0,
              qty_out: qty,
              source_type: 'farm',
              source_id: formData.to_farm_id,
              notes: formData.notes || null,
              attachment_url: formData.attachment_url || null,
            })
            .eq('id', editingTxnId)
            .select('id');

          assertMutationAffected(data, error);
          success = true;
          toast.success('ارسال به واحدها با موفقیت ویرایش شد');
        } else {
          const { error } = await supabase
            .from('inventory_transactions')
            .insert({
              farm_id: selectedFarmId,
              item_id: formData.item_id,
              txn_date: jalaliToGregorian(formData.txn_date),
              txn_type: 'transfer_out' as TransactionType,
              qty_in: 0,
              qty_out: qty,
              source_type: 'farm',
              source_id: formData.to_farm_id,
              notes: formData.notes || null,
              created_by: profile?.id,
              attachment_url: formData.attachment_url || null,
            });

          if (error) throw error;
          success = true;
          toast.success('ارسال به واحدها با موفقیت ثبت شد');
        }
      }

      if (success) {
        goBackToCards();
        await loadTransactions();
      }
    } catch (err) {
      console.error('Error submitting:', err);
      toast.error(err instanceof Error ? err.message : 'خطا در ثبت اطلاعات');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get form title based on active tab
  const getFormTitle = () => {
    const isEdit = !!editingTxnId;
    switch (activeTab) {
      case 'purchase': return isEdit ? 'ویرایش خرید' : 'ثبت خرید جدید';
      case 'transfer_in': return isEdit ? 'ویرایش دریافت از سایر واحدها' : 'ثبت دریافت از سایر واحدها';
      case 'transfer_out': return isEdit ? 'ویرایش ارسال به سایر واحدها' : 'ثبت ارسال به سایر واحدها';
      default: return '';
    }
  };

  // Get feed and packaging items
  const feedItems = farmItems.filter(i => i.category === 'feed');
  const packagingItems = farmItems.filter(i => i.category === 'packaging');

  // Combined item options for searchable select
  const itemOptions = [
    ...feedItems.map(i => ({ value: i.id, label: `📦 ${i.name} (${i.unit})` })),
    ...packagingItems.map(i => ({ value: i.id, label: `📋 ${i.name} (${i.unit})` })),
  ];

  // Farm options for transfers
  const fromFarmOptions = otherFarms.map(f => ({ value: f.id, label: f.name }));
  const toFarmOptions = otherFarms.map(f => ({ value: f.id, label: f.name }));

  // Supplier options
  const supplierOptions = activeSuppliers.map(s => ({ value: s.id, label: s.name }));

  // Filtered ledger transactions
  const filteredTransactions = transactions.filter((t) => {
    if (ledgerTypeFilter !== 'all' && t.txn_type !== ledgerTypeFilter) {
      return false;
    }
    if (ledgerSearch.trim()) {
      const q = ledgerSearch.trim().toLowerCase();
      const item = farmItems.find((i) => i.id === t.item_id);
      const itemName = (item?.name || '').toLowerCase();
      const notes = (t.notes || '').toLowerCase();
      const ref = (t.reference_no || '').toLowerCase();
      if (!itemName.includes(q) && !notes.includes(q) && !ref.includes(q)) {
        return false;
      }
    }
    return true;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-fg)]">خرید و انتقال</h1>
          <p className="text-sm text-[var(--c-muted-fg)] mt-1">
            ثبت خرید، دریافت از واحدهای دیگر و ارسال به سایر فارم‌ها
          </p>
        </div>

        {/* Farm selector */}
        {(isAdmin || !profile?.farm_id || farms.length > 1) && (
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
            <Building2 className="w-16 h-16 mx-auto text-[var(--c-muted-fg)] mb-4" />
            <p className="text-[var(--c-muted-fg)]">لطفاً یک فارم را انتخاب کنید</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Back button when in form mode */}
          {activeTab !== 'cards' && (
            <Button variant="ghost" onClick={goBackToCards} className="mb-2">
              <ChevronLeft className="w-4 h-4 ml-1" />
              بازگشت به لیست
            </Button>
          )}

          {/* Cards View */}
          <AnimatePresence mode="wait">
            {activeTab === 'cards' && (
              <motion.div
                key="cards"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Main Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Purchase Card */}
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Card 
                      className={`cursor-pointer hover:shadow-lg transition-all duration-200 border-2 border-transparent hover:border-[var(--c-success)]/30 h-full ${isReadOnly ? 'opacity-80' : ''}`}
                      onClick={() => !isReadOnly && navigateToForm('purchase')}
                    >
                      <CardHeader className="pb-2">
                        <div className="w-14 h-14 rounded-xl bg-[color-mix(in_srgb,var(--c-success)_16%,transparent)] flex items-center justify-center mb-3">
                          <ShoppingCart className="w-7 h-7 text-[var(--c-success)]" />
                        </div>
                        <CardTitle className="text-lg">ثبت خرید</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center text-[var(--c-success)] text-sm font-medium mt-4">
                          <span>{isReadOnly ? 'فقط مشاهده (ردیف‌های دفتر)' : 'ورود به فرم ثبت'}</span>
                          <ChevronLeft className="w-4 h-4 mr-1" />
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* Transfer In Card */}
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Card 
                      className={`cursor-pointer hover:shadow-lg transition-all duration-200 border-2 border-transparent hover:border-[#3A7D5C]/30 h-full ${isReadOnly ? 'opacity-80' : ''}`}
                      onClick={() => !isReadOnly && navigateToForm('transfer_in')}
                    >
                      <CardHeader className="pb-2">
                        <div className="w-14 h-14 rounded-xl bg-[color-mix(in_srgb,#3A7D5C_16%,transparent)] flex items-center justify-center mb-3">
                          <ArrowDownToLine className="w-7 h-7 text-[#3A7D5C]" />
                        </div>
                        <CardTitle className="text-lg">دریافت از واحدها</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center text-[#3A7D5C] text-sm font-medium mt-4">
                          <span>{isReadOnly ? 'فقط مشاهده (ردیف‌های دفتر)' : 'ورود به فرم ثبت'}</span>
                          <ChevronLeft className="w-4 h-4 mr-1" />
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* Transfer Out Card */}
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Card 
                      className={`cursor-pointer hover:shadow-lg transition-all duration-200 border-2 border-transparent hover:border-[var(--c-accent)]/30 h-full ${isReadOnly ? 'opacity-80' : ''}`}
                      onClick={() => !isReadOnly && navigateToForm('transfer_out')}
                    >
                      <CardHeader className="pb-2">
                        <div className="w-14 h-14 rounded-xl bg-[color-mix(in_srgb,var(--c-accent)_16%,transparent)] flex items-center justify-center mb-3">
                          <Truck className="w-7 h-7 text-[var(--c-accent)]" />
                        </div>
                        <CardTitle className="text-lg">ارسال به واحدها</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center text-[var(--c-accent)] text-sm font-medium mt-4">
                          <span>{isReadOnly ? 'فقط مشاهده (ردیف‌های دفتر)' : 'ورود به فرم ثبت'}</span>
                          <ChevronLeft className="w-4 h-4 mr-1" />
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                </div>

                {/* Info Card */}
                <Card className="bg-[color-mix(in_srgb,var(--c-info)_16%,transparent)] border-[color-mix(in_srgb,var(--c-info)_30%,transparent)]">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--c-info)_30%,transparent)] flex items-center justify-center flex-shrink-0">
                        <span className="text-[var(--c-info)] text-lg">💡</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-[var(--c-info)] mb-1">راهنما</h4>
                        <p className="text-sm text-[var(--c-info)]">
                          برای ثبت خرید، از تأمین‌کننده فاکتور دریافت کنید و اطلاعات آن را وارد کنید. 
                          برای انتقال، هماهنگی لازم با واحد مقصد انجام شده باشد.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Kardex shortcut — the comprehensive ledger lives in reports */}
                <Card className="border-2 border-dashed border-[var(--c-primary)]/40 bg-[color-mix(in_srgb,var(--c-primary)_6%,transparent)]">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--c-primary)_15%,transparent)] flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-[var(--c-fg)]">کاردکس و گزارش‌های جامع</h4>
                          <p className="text-xs text-[var(--c-muted-fg)] mt-0.5">
                            گردش کامل کالا، گزارش خریدها و انتقال بین انبارها را در بخش گزارشات ببینید
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => navigate(`${roleBase}/reports`)}
                        className="flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <History className="w-4 h-4" />
                        مشاهده کاردکس / گزارشات
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Purchases & Transfers Ledger (collapsible recent history) */}
                <Card className="border border-[var(--c-border)] shadow-sm">
                  <CardHeader className="pb-3 border-b border-[var(--c-border)]">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setShowLedger((v) => !v)}
                        aria-expanded={showLedger}
                        className="flex items-center gap-2 text-right group"
                      >
                        <span className="w-8 h-8 rounded-lg bg-[var(--c-muted)] flex items-center justify-center text-[var(--c-muted-fg)] group-hover:text-[var(--c-fg)] transition-colors">
                          {showLedger ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </span>
                        <span>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <ShoppingCart className="w-5 h-5 text-primary" />
                            تاریخچه اخیر خریدها و انتقالات
                          </CardTitle>
                          <span className="text-xs text-[var(--c-muted-fg)] mt-1 block">
                            {showLedger ? 'بستن لیست' : 'مشاهده ۱۰۰ تراکنش اخیر این فارم — برای گردش کامل به کاردکس بروید'}
                          </span>
                        </span>
                      </button>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={loadTransactions}
                          disabled={isLoadingTxns}
                          title="بروزرسانی داده‌ها"
                        >
                          <RefreshCw className={`w-4 h-4 ml-1 ${isLoadingTxns ? 'animate-spin' : ''}`} />
                          بروزرسانی
                        </Button>
                        <Badge variant="secondary">
                          {toPersianNumbers(filteredTransactions.length)} تراکنش
                        </Badge>
                      </div>
                    </div>

                    {/* Query Filters Bar */}
                    {showLedger && (
                    <div className="flex flex-col sm:flex-row gap-3 pt-3 items-stretch sm:items-center">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[var(--c-muted-fg)]" />
                        <Input
                          placeholder="جستجو در کالا، شماره فاکتور یا توضیحات..."
                          value={ledgerSearch}
                          onChange={(e) => setLedgerSearch(e.target.value)}
                          className="pr-9"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                        <span className="text-xs text-[var(--c-muted-fg)] whitespace-nowrap ml-1">فیلتر نوع:</span>
                        <Button
                          type="button"
                          size="sm"
                          variant={ledgerTypeFilter === 'all' ? 'primary' : 'outline'}
                          onClick={() => setLedgerTypeFilter('all')}
                        >
                          همه
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={ledgerTypeFilter === 'purchase' ? 'primary' : 'outline'}
                          onClick={() => setLedgerTypeFilter('purchase')}
                        >
                          خریدها
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={ledgerTypeFilter === 'transfer_in' ? 'primary' : 'outline'}
                          onClick={() => setLedgerTypeFilter('transfer_in')}
                        >
                          دریافت انتقالی
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={ledgerTypeFilter === 'transfer_out' ? 'primary' : 'outline'}
                          onClick={() => setLedgerTypeFilter('transfer_out')}
                        >
                          ارسال انتقالی
                        </Button>
                      </div>
                    </div>
                    )}
                  </CardHeader>
                  {showLedger && (
                  <CardContent className="p-0">
                    {isLoadingTxns ? (
                      <div className="py-12 flex items-center justify-center">
                        <Spinner className="w-8 h-8" />
                      </div>
                    ) : filteredTransactions.length === 0 ? (
                      <div className="py-12 text-center text-[var(--c-muted-fg)] text-sm">
                        {transactions.length === 0
                          ? 'هنوز هیچ تراکنش خرید یا انتقالی برای این فارم ثبت نشده است.'
                          : 'تراکنشی با مشخصات جستجو شده یافت نشد.'}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-sm">
                          <thead className="bg-[var(--c-muted)] text-[var(--c-muted-fg)] text-xs border-b border-[var(--c-border)]">
                            <tr>
                              <th className="py-3 px-3 text-center">ردیف</th>
                              <th className="py-3 px-3 text-center">تاریخ</th>
                              <th className="py-3 px-3 text-center">نوع</th>
                              <th className="py-3 px-3">کالا</th>
                              <th className="py-3 px-3 text-center">مقدار</th>
                              <th className="py-3 px-3 text-center">قیمت واحد</th>
                              <th className="py-3 px-3 text-center">مبلغ کل</th>
                              <th className="py-3 px-3">طرف معامله / واحد</th>
                              <th className="py-3 px-3 text-center">شماره مرجع</th>
                              <th className="py-3 px-3">توضیحات</th>
                              <th className="py-3 px-3 text-center">عملیات</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--c-border)]">
                            {filteredTransactions.map((txn, idx) => {
                              const item = farmItems.find((i) => i.id === txn.item_id);
                              const supplier = activeSuppliers.find((s) => s.id === (txn.supplier_id || txn.source_id));
                              const otherFarm = farms.find((f) => f.id === txn.source_id);
                              const qty = txn.qty_in > 0 ? txn.qty_in : txn.qty_out;
                              const isPurchase = txn.txn_type === 'purchase';
                              const isTransferIn = txn.txn_type === 'transfer_in';

                              return (
                                <tr key={txn.id} className="hover:bg-[var(--c-muted)]/50 transition-colors">
                                  <td className="py-3 px-3 text-center text-xs text-[var(--c-muted-fg)]">
                                    {toPersianNumbers(idx + 1)}
                                  </td>
                                  <td className="py-3 px-3 text-center whitespace-nowrap text-xs">
                                    {formatJalaliDate(txn.txn_date)}
                                  </td>
                                  <td className="py-3 px-3 text-center whitespace-nowrap">
                                    {isPurchase ? (
                                      <Badge className="bg-[color-mix(in_srgb,var(--c-success)_15%,transparent)] text-[var(--c-success)]">
                                        خرید
                                      </Badge>
                                    ) : isTransferIn ? (
                                      <Badge className="bg-[color-mix(in_srgb,var(--c-primary)_15%,transparent)] text-primary">
                                        دریافت
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-[color-mix(in_srgb,var(--c-accent)_15%,transparent)] text-[var(--c-accent)]">
                                        ارسال
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="py-3 px-3 font-medium">
                                    {item ? `${item.name} (${item.unit})` : '—'}
                                  </td>
                                  <td className="py-3 px-3 text-center font-mono font-medium">
                                    {toPersianNumbers(qty.toLocaleString())}
                                  </td>
                                  <td className="py-3 px-3 text-center text-xs text-[var(--c-muted-fg)]">
                                    {txn.unit_price ? `${toPersianNumbers(txn.unit_price.toLocaleString())} ریال` : '—'}
                                  </td>
                                  <td className="py-3 px-3 text-center text-xs font-semibold">
                                    {txn.total_price ? `${toPersianNumbers(txn.total_price.toLocaleString())} ریال` : '—'}
                                  </td>
                                  <td className="py-3 px-3 text-xs text-[var(--c-muted-fg)]">
                                    {isPurchase ? (supplier ? supplier.name : '—') : (otherFarm ? otherFarm.name : '—')}
                                  </td>
                                  <td className="py-3 px-3 text-center text-xs text-[var(--c-muted-fg)]">
                                    {txn.reference_no || '—'}
                                  </td>
                                  <td className="py-3 px-3 text-xs text-[var(--c-muted-fg)] max-w-[150px] truncate">
                                    {txn.notes || '—'}
                                  </td>
                                  {!isReadOnly ? (
                                    <td className="py-3 px-3 text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => txn.item_id && navigate(`${roleBase}/inventory/${txn.item_id}/history`)}
                                          title="مشاهده کاردکس کالا"
                                          aria-label="مشاهده کاردکس کالا"
                                          className="text-[var(--c-muted-fg)] hover:bg-[color-mix(in_srgb,var(--c-primary)_10%,transparent)] hover:text-primary p-1.5 h-auto"
                                        >
                                          <History className="w-4 h-4" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleEdit(txn)}
                                          title="ویرایش رکورد"
                                          aria-label="ویرایش رکورد"
                                          className="text-primary hover:bg-[color-mix(in_srgb,var(--c-primary)_10%,transparent)] p-1.5 h-auto"
                                        >
                                          <Pencil className="w-4 h-4" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setDeleteTxnId(txn.id)}
                                          title="حذف رکورد"
                                          aria-label="حذف رکورد"
                                          className="text-[var(--c-error)] hover:bg-[color-mix(in_srgb,var(--c-destructive)_10%,transparent)] p-1.5 h-auto"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </td>
                                  ) : (
                                    <td className="py-3 px-3 text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => txn.item_id && navigate(`${roleBase}/inventory/${txn.item_id}/history`)}
                                          title="مشاهده کاردکس کالا"
                                          aria-label="مشاهده کاردکس کالا"
                                          className="text-[var(--c-muted-fg)] hover:bg-[color-mix(in_srgb,var(--c-primary)_10%,transparent)] hover:text-primary p-1.5 h-auto"
                                        >
                                          <History className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                  )}
                </Card>
              </motion.div>
            )}

            {/* Purchase Form */}
            {activeTab === 'purchase' && (
              <motion.div
                key="purchase-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <Card>
                  <CardHeader className="border-b border-[var(--c-border)]">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ShoppingCart className="w-5 h-5 text-[var(--c-success)]" />
                      {getFormTitle()}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-6">
                      {/* Date */}
                      <div className="max-w-xs">
                        <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">تاریخ *</label>
                        <JalaliDatePicker
                          value={formData.txn_date}
                          onChange={(val) => setFormData({ ...formData, txn_date: val || getJalaliToday() })}
                          placeholder="انتخاب تاریخ"
                        />
                      </div>

                      {/* Item Selection */}
                      <div>
                        <SearchableSelect
                          value={formData.item_id}
                          onChange={(val) => setFormData({ ...formData, item_id: val })}
                          options={itemOptions}
                          placeholder="جستجو و انتخاب کالا..."
                          label="کالا *"
                          disabled={isLoadingFarmItems}
                        />
                        {isLoadingFarmItems && <span className="mt-1 block text-xs text-[var(--c-muted-fg)]">در حال بارگذاری...</span>}
                        {farmItemsError && (
                          <button type="button" onClick={loadFarmItems} className="mt-1 text-xs text-[var(--c-error)] underline">
                            تلاش مجدد
                          </button>
                        )}
                      </div>

                      {/* Quantity and Deficit */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div>
                          <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">مقدار *</label>
                          <Input
                            type="number"
                            className="no-spinners"
                            value={formData.quantity}
                            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                            placeholder="۰"
                            min="0"
                            step="0.001"
                            dir="ltr"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">کمبود حمل</label>
                          <Input
                            type="number"
                            className="no-spinners"
                            value={formData.deficit}
                            onChange={(e) => setFormData({ ...formData, deficit: e.target.value })}
                            placeholder="۰"
                            min="0"
                            step="0.001"
                            dir="ltr"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">قیمت واحد (ریال)</label>
                          <Input
                            type="number"
                            className="no-spinners"
                            value={formData.unit_price}
                            onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                            placeholder="۰"
                            min="0"
                            dir="ltr"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">قیمت کل (ریال)</label>
                          <Input
                            value={formData.total_price}
                            disabled
                            className="bg-[var(--c-muted)]"
                            dir="ltr"
                          />
                        </div>
                      </div>

                      {/* Supplier Selection */}
                      <div>
                        <SearchableSelect
                          value={formData.supplier_id}
                          onChange={(val) => setFormData({ ...formData, supplier_id: val })}
                          options={supplierOptions}
                          placeholder="انتخاب تأمین‌کننده"
                          label="تأمین‌کننده"
                        />
                      </div>

                      {/* Truck, Driver, and Shipping Cost */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">نام راننده</label>
                          <Input
                            value={formData.driver_name}
                            onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                            placeholder="نام راننده"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">پلاک خودرو</label>
                          <Input
                            value={formData.truck_number}
                            onChange={(e) => setFormData({ ...formData, truck_number: e.target.value })}
                            placeholder="پلاک خودرو"
                            dir="ltr"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">هزینه حمل و نقل (ریال)</label>
                          <Input
                            type="text"
                            className="no-spinners"
                            value={toPersianNumbers(formatNumberWithSeparator(formData.shipping_cost))}
                            onChange={(e) => {
                              const cleanValue = e.target.value.replace(/[/\s]/g, '').replace(/[۰-۹]/g, (w: string) => {
                                const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
                                const englishDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
                                return englishDigits[farsiDigits.indexOf(w)];
                              });
                              setFormData({ ...formData, shipping_cost: cleanValue });
                            }}
                            placeholder="۰"
                            dir="ltr"
                          />
                        </div>
                      </div>

                      {/* Attachment - Invoice/Bill of Lading */}
                      <div>
                        <FileUpload
                          value={formData.attachment_url || null}
                          onChange={(url) => setFormData({ ...formData, attachment_url: url || '' })}
                          label="تصویر فاکتور یا بارنامه"
                          folderName="purchase"
                        />
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">توضیحات</label>
                        <textarea
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          placeholder="توضیحات اختیاری..."
                          rows={3}
                          className="w-full px-3 py-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] resize-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-[var(--c-border)]">
                      <Button variant="ghost" onClick={goBackToCards}>
                        انصراف
                      </Button>
                      <Button onClick={handleSubmit} isLoading={isSubmitting}>
                        <Save className="w-4 h-4 ml-2" />
                        {editingTxnId ? 'ذخیره تغییرات' : 'ثبت خرید'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Transfer In Form */}
            {activeTab === 'transfer_in' && (
              <motion.div
                key="transfer-in-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <Card>
                  <CardHeader className="border-b border-[var(--c-border)]">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ArrowDownToLine className="w-5 h-5 text-[#3A7D5C]" />
                      {getFormTitle()}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-6">
                      {/* Date */}
                      <div className="max-w-xs">
                        <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">تاریخ *</label>
                        <JalaliDatePicker
                          value={formData.txn_date}
                          onChange={(val) => setFormData({ ...formData, txn_date: val || getJalaliToday() })}
                          placeholder="انتخاب تاریخ"
                        />
                      </div>

                      {/* Source Farm */}
                      <div>
                        <SearchableSelect
                          value={formData.from_farm_id}
                          onChange={(val) => setFormData({ ...formData, from_farm_id: val })}
                          options={fromFarmOptions}
                          placeholder="جستجو و انتخاب فارم..."
                          label="فارم مبدأ *"
                          disabled={isLoadingOtherFarms}
                        />
                        {isLoadingOtherFarms && <span className="mt-1 block text-xs text-[var(--c-muted-fg)]">در حال بارگذاری...</span>}
                        {otherFarmsError && (
                          <button type="button" onClick={loadOtherFarms} className="mt-1 text-xs text-[var(--c-error)] underline">
                            تلاش مجدد
                          </button>
                        )}
                      </div>

                      {/* Item Selection */}
                      <div>
                        <SearchableSelect
                          value={formData.item_id}
                          onChange={(val) => setFormData({ ...formData, item_id: val })}
                          options={itemOptions}
                          placeholder="جستجو و انتخاب کالا..."
                          label="کالا *"
                          disabled={isLoadingFarmItems}
                        />
                        {isLoadingFarmItems && <span className="mt-1 block text-xs text-[var(--c-muted-fg)]">در حال بارگذاری...</span>}
                        {farmItemsError && (
                          <button type="button" onClick={loadFarmItems} className="mt-1 text-xs text-[var(--c-error)] underline">
                            تلاش مجدد
                          </button>
                        )}
                      </div>

                      {/* Quantity, Driver, and Shipping Cost */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">مقدار *</label>
                          <Input
                            type="number"
                            className="no-spinners"
                            value={formData.quantity}
                            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                            placeholder="۰"
                            min="0"
                            step="0.001"
                            dir="ltr"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">نام راننده</label>
                          <Input
                            value={formData.driver_name}
                            onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                            placeholder="نام راننده"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">کرایه حمل (ریال)</label>
                          <Input
                            type="text"
                            className="no-spinners"
                            value={toPersianNumbers(formatNumberWithSeparator(formData.shipping_cost))}
                            onChange={(e) => {
                              const cleanValue = e.target.value.replace(/[/\s]/g, '').replace(/[۰-۹]/g, (w: string) => {
                                const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
                                const englishDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
                                return englishDigits[farsiDigits.indexOf(w)];
                              });
                              setFormData({ ...formData, shipping_cost: cleanValue });
                            }}
                            placeholder="۰"
                            dir="ltr"
                          />
                        </div>
                      </div>

                      {/* Attachment - Invoice/Bill of Lading */}
                      <div>
                        <FileUpload
                          value={formData.attachment_url || null}
                          onChange={(url) => setFormData({ ...formData, attachment_url: url || '' })}
                          label="تصویر حواله یا بارنامه"
                          folderName="transfer_in"
                        />
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">توضیحات</label>
                        <textarea
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          placeholder="توضیحات اختیاری..."
                          rows={3}
                          className="w-full px-3 py-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] resize-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-[var(--c-border)]">
                      <Button variant="ghost" onClick={goBackToCards}>
                        انصراف
                      </Button>
                      <Button onClick={handleSubmit} isLoading={isSubmitting}>
                        <Save className="w-4 h-4 ml-2" />
                        {editingTxnId ? 'ذخیره تغییرات' : 'ثبت دریافت'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Transfer Out Form */}
            {activeTab === 'transfer_out' && (
              <motion.div
                key="transfer-out-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <Card>
                  <CardHeader className="border-b border-[var(--c-border)]">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Truck className="w-5 h-5 text-[var(--c-accent)]" />
                      {getFormTitle()}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-6">
                      {/* Date */}
                      <div className="max-w-xs">
                        <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">تاریخ *</label>
                        <JalaliDatePicker
                          value={formData.txn_date}
                          onChange={(val) => setFormData({ ...formData, txn_date: val || getJalaliToday() })}
                          placeholder="انتخاب تاریخ"
                        />
                      </div>

                      {/* Destination Farm */}
                      <div>
                        <SearchableSelect
                          value={formData.to_farm_id}
                          onChange={(val) => setFormData({ ...formData, to_farm_id: val })}
                          options={toFarmOptions}
                          placeholder="جستجو و انتخاب فارم..."
                          label="فارم مقصد *"
                          disabled={isLoadingOtherFarms}
                        />
                        {isLoadingOtherFarms && <span className="mt-1 block text-xs text-[var(--c-muted-fg)]">در حال بارگذاری...</span>}
                        {otherFarmsError && (
                          <button type="button" onClick={loadOtherFarms} className="mt-1 text-xs text-[var(--c-error)] underline">
                            تلاش مجدد
                          </button>
                        )}
                      </div>

                      {/* Item Selection */}
                      <div>
                        <SearchableSelect
                          value={formData.item_id}
                          onChange={(val) => setFormData({ ...formData, item_id: val })}
                          options={itemOptions}
                          placeholder="جستجو و انتخاب کالا..."
                          label="کالا *"
                          disabled={isLoadingFarmItems}
                        />
                        {isLoadingFarmItems && <span className="mt-1 block text-xs text-[var(--c-muted-fg)]">در حال بارگذاری...</span>}
                        {farmItemsError && (
                          <button type="button" onClick={loadFarmItems} className="mt-1 text-xs text-[var(--c-error)] underline">
                            تلاش مجدد
                          </button>
                        )}
                      </div>

                      {/* Quantity and Driver */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">مقدار *</label>
                          <Input
                            type="number"
                            className="no-spinners"
                            value={formData.quantity}
                            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                            placeholder="۰"
                            min="0"
                            step="0.001"
                            dir="ltr"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">نام راننده</label>
                          <Input
                            value={formData.driver_name}
                            onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                            placeholder="نام راننده"
                          />
                        </div>
                      </div>

                      {/* Attachment - Invoice/Bill of Lading */}
                      <div>
                        <FileUpload
                          value={formData.attachment_url || null}
                          onChange={(url) => setFormData({ ...formData, attachment_url: url || '' })}
                          label="تصویر حواله یا بارنامه"
                          folderName="transfer_out"
                        />
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">توضیحات</label>
                        <textarea
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          placeholder="توضیحات اختیاری..."
                          rows={3}
                          className="w-full px-3 py-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] resize-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-[var(--c-border)]">
                      <Button variant="ghost" onClick={goBackToCards}>
                        انصراف
                      </Button>
                      <Button onClick={handleSubmit} isLoading={isSubmitting}>
                        <Save className="w-4 h-4 ml-2" />
                        {editingTxnId ? 'ذخیره تغییرات' : 'ثبت ارسال'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Delete Transaction Confirm Dialog */}
      <ConfirmDialog
        isOpen={deleteTxnId !== null}
        onClose={() => setDeleteTxnId(null)}
        title="حذف تراکنش"
        message="آیا از حذف این رکورد خرید/انتقال اطمینان دارید؟ این عمل قابل بازگشت نیست."
        confirmLabel="حذف"
        cancelLabel="انصراف"
        variant="destructive"
        isLoading={isDeletingTxn}
        onConfirm={handleDeleteTxn}
      />
    </motion.div>
  );
}
