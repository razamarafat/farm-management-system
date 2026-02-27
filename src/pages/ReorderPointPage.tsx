import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  AlertTriangle,
  CheckCircle,
  Clock,
  Edit2,
  X,
  Save,
  Loader,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useStockBalances } from '@/hooks/useInventory';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from 'sonner';
import { toPersianNumbers, toEnglishDigits } from '@/utils/persianNumbers';
import type { StockBalance } from '@/types/inventory.types';

// ─── میانگین مصرف ۷ روزه ────────────────────────────────────────
async function fetch7DayAvgConsumption(
  farmId: string
): Promise<Map<string, number>> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fromDate = sevenDaysAgo.toISOString().split('T')[0];

  const { data } = await supabaseAdmin
    .from('inventory_transactions')
    .select('item_id, qty_out')
    .eq('farm_id', farmId)
    .in('txn_type', ['consumption', 'waste'])
    .gte('txn_date', fromDate);

  const map = new Map<string, number>();
  (data || []).forEach((t) => {
    map.set(t.item_id, (map.get(t.item_id) || 0) + Number(t.qty_out || 0));
  });
  // تقسیم بر ۷ = میانگین روزانه
  map.forEach((total, id) => map.set(id, total / 7));
  return map;
}

export default function ReorderPointPage() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin';

  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(
    isAdmin ? null : profile?.farm_id || null
  );
  const [farms, setFarms] = useState<Array<{ id: string; name: string }>>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [avgConsumption, setAvgConsumption] = useState<Map<string, number>>(new Map());

  const { balances, isLoading, refetch } = useStockBalances(selectedFarmId, 'all');

  // Fetch farms on mount
  useEffect(() => {
    if (!selectedFarmId && profile?.farm_id) {
      const farmIdArray = Array.isArray(profile.farm_id)
        ? profile.farm_id
        : [profile.farm_id];

      supabaseAdmin
        .from('farms')
        .select('id, name')
        .in('id', farmIdArray)
        .eq('is_active', true)
        .then(({ data }) => {
          if (data) {
            setFarms(data);
            if (data.length > 0 && !selectedFarmId) {
              setSelectedFarmId(data[0].id);
            }
          }
        });
    }
  }, [profile, selectedFarmId]);

  // Load 7-day average consumption data
  useEffect(() => {
    if (!selectedFarmId) return;
    fetch7DayAvgConsumption(selectedFarmId).then(setAvgConsumption);
  }, [selectedFarmId]);

  // Sort and categorize items
  const categorizedItems = useMemo(() => {
    const belowReorder = balances.filter((b) => b.reorder_point > 0 && b.balance <= b.reorder_point);
    const nearReorder = balances.filter(
      (b) => b.reorder_point > 0 && b.balance > b.reorder_point && b.balance <= b.reorder_point * 1.5
    );
    const aboveReorder = balances.filter((b) => b.reorder_point > 0 && b.balance > b.reorder_point * 1.5);
    const noReorderPoint = balances.filter((b) => b.reorder_point === 0);

    return { belowReorder, nearReorder, aboveReorder, noReorderPoint };
  }, [balances]);

  // Get color based on inventory ratio
  const getColorForRatio = (balance: number, reorderPoint: number): string => {
    if (reorderPoint === 0) return 'from-gray-100 to-gray-50 dark:from-gray-900 dark:to-gray-800';

    const ratio = balance / reorderPoint;

    if (ratio <= 0.5) {
      return 'from-red-50 to-red-25 dark:from-red-950 dark:to-red-900';
    } else if (ratio <= 1) {
      return 'from-orange-50 to-orange-25 dark:from-orange-950 dark:to-orange-900';
    } else if (ratio <= 1.5) {
      return 'from-yellow-50 to-yellow-25 dark:from-yellow-950 dark:to-yellow-900';
    } else if (ratio <= 2) {
      return 'from-blue-50 to-blue-25 dark:from-blue-950 dark:to-blue-900';
    } else {
      return 'from-green-50 to-green-25 dark:from-green-950 dark:to-green-900';
    }
  };

  const getStatusColor = (balance: number, reorderPoint: number): string => {
    if (reorderPoint === 0) return 'text-gray-600 dark:text-gray-400';

    const ratio = balance / reorderPoint;

    if (ratio <= 0.5) {
      return 'text-red-600 dark:text-red-400';
    } else if (ratio <= 1) {
      return 'text-orange-600 dark:text-orange-400';
    } else if (ratio <= 1.5) {
      return 'text-yellow-600 dark:text-yellow-400';
    } else if (ratio <= 2) {
      return 'text-blue-600 dark:text-blue-400';
    } else {
      return 'text-green-600 dark:text-green-400';
    }
  };

  const getSmartLabel = (itemId: string, balance: number): string => {
    const avgConsumptionValue = avgConsumption.get(itemId);
    if (!avgConsumptionValue || avgConsumptionValue === 0) {
      return 'داده‌های مصرف ندارد';
    }

    const daysRemaining = Math.floor(balance / avgConsumptionValue);
    if (daysRemaining === 0) {
      return 'کمتر از یک روز';
    } else if (daysRemaining === 1) {
      return 'موجودی برای ۱ روز کافی است';
    } else {
      const persianDays = toPersianNumbers(daysRemaining.toString());
      return `موجودی برای ${persianDays} روز کافی است`;
    }
  };

  const handleBack = () => {
    const role = profile?.role || 'operator';
    const baseUrl = role === 'admin' ? '/admin' : `/${role}`;
    navigate(`${baseUrl}/inventory`);
  };

  const handleEditReorderPoint = (item: StockBalance) => {
    setEditingItemId(item.item_id);
    setEditValue(toPersianNumbers(item.reorder_point.toString()));
  };

  const handleSaveReorderPoint = async (itemId: string) => {
    if (!selectedFarmId || !editValue.trim()) {
      toast.error('لطفاً نقطه سفارش را وارد کنید');
      return;
    }

    try {
      setIsSubmitting(true);
      const numValue = parseInt(toEnglishDigits(editValue.trim()));

      if (isNaN(numValue) || numValue < 0) {
        toast.error('لطفاً عدد صحیح و مثبت وارد کنید');
        return;
      }

      const { error } = await supabaseAdmin
        .from('farm_items')
        .update({ reorder_point: numValue })
        .eq('id', itemId)
        .eq('farm_id', selectedFarmId);

      if (error) throw error;

      toast.success('نقطه سفارش با موفقیت ذخیره شد');
      setEditingItemId(null);
      refetch();
    } catch (err) {
      console.error('Error updating reorder point:', err);
      toast.error('خطا در ذخیره نقطه سفارش');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditValue('');
  };

  const handleInputChange = (value: string) => {
    // Allow only Persian and Latin numbers
    const cleaned = value.replace(/[^\d۰-۹]/g, '');
    setEditValue(cleaned);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[var(--c-bg)] to-[var(--c-bg-secondary)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-[var(--c-border)] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="p-2 hover:bg-[var(--c-muted)] rounded-lg transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-[var(--c-text-primary)]">نقطه سفارش انبار</h1>
                <p className="text-sm text-[var(--c-muted-fg)] mt-1">مدیریت و نظارت بر موجودی کالاها</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Farm Selector */}
        {farms.length > 1 && (
          <div className="mb-6 flex gap-2 flex-wrap">
            {farms.map((farm) => (
              <button
                key={farm.id}
                onClick={() => setSelectedFarmId(farm.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedFarmId === farm.id
                    ? 'bg-[var(--c-primary)] text-white shadow-md'
                    : 'bg-white dark:bg-gray-800 text-[var(--c-text-primary)] border border-[var(--c-border)] hover:border-[var(--c-primary)]'
                }`}
              >
                {farm.name}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : !selectedFarmId ? (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertTriangle className="w-12 h-12 text-amber-600 mx-auto mb-3" />
              <p className="text-lg font-semibold text-[var(--c-text-primary)]">فارمی انتخاب نشده است</p>
              <p className="text-[var(--c-muted-fg)] mt-2">برای شروع یک فارم را انتخاب کنید</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Below Reorder Point */}
            {categorizedItems.belowReorder.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="mb-3">
                  <h2 className="text-lg font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    فوری - زیر نقطه سفارش ({toPersianNumbers(categorizedItems.belowReorder.length)})
                  </h2>
                </div>
                <div className="grid gap-3">
                  <AnimatePresence>
                    {categorizedItems.belowReorder.map((item) => (
                      <ReorderPointCard
                        key={item.item_id}
                        item={item}
                        editingItemId={editingItemId}
                        editValue={editValue}
                        onEdit={handleEditReorderPoint}
                        onSave={handleSaveReorderPoint}
                        onCancel={handleCancelEdit}
                        onInputChange={handleInputChange}
                        isSubmitting={isSubmitting}
                        getColorForRatio={getColorForRatio}
                        getStatusColor={getStatusColor}
                        getSmartLabel={getSmartLabel}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {/* Near Reorder Point */}
            {categorizedItems.nearReorder.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="mb-3">
                  <h2 className="text-lg font-bold text-orange-600 dark:text-orange-400 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    هشدار - نزدیک نقطه سفارش ({toPersianNumbers(categorizedItems.nearReorder.length)})
                  </h2>
                </div>
                <div className="grid gap-3">
                  <AnimatePresence>
                    {categorizedItems.nearReorder.map((item) => (
                      <ReorderPointCard
                        key={item.item_id}
                        item={item}
                        editingItemId={editingItemId}
                        editValue={editValue}
                        onEdit={handleEditReorderPoint}
                        onSave={handleSaveReorderPoint}
                        onCancel={handleCancelEdit}
                        onInputChange={handleInputChange}
                        isSubmitting={isSubmitting}
                        getColorForRatio={getColorForRatio}
                        getStatusColor={getStatusColor}
                        getSmartLabel={getSmartLabel}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {/* Above Reorder Point */}
            {categorizedItems.aboveReorder.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="mb-3">
                  <h2 className="text-lg font-bold text-green-600 dark:text-green-400 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    منطقی - قبل از نقطه سفارش ({toPersianNumbers(categorizedItems.aboveReorder.length)})
                  </h2>
                </div>
                <div className="grid gap-3">
                  <AnimatePresence>
                    {categorizedItems.aboveReorder.map((item) => (
                      <ReorderPointCard
                        key={item.item_id}
                        item={item}
                        editingItemId={editingItemId}
                        editValue={editValue}
                        onEdit={handleEditReorderPoint}
                        onSave={handleSaveReorderPoint}
                        onCancel={handleCancelEdit}
                        onInputChange={handleInputChange}
                        isSubmitting={isSubmitting}
                        getColorForRatio={getColorForRatio}
                        getStatusColor={getStatusColor}
                        getSmartLabel={getSmartLabel}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {/* No Reorder Point Set */}
            {categorizedItems.noReorderPoint.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="mb-3">
                  <h2 className="text-lg font-bold text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    بدون نقطه سفارش ({toPersianNumbers(categorizedItems.noReorderPoint.length)})
                  </h2>
                </div>
                <div className="grid gap-3">
                  <AnimatePresence>
                    {categorizedItems.noReorderPoint.map((item) => (
                      <ReorderPointCard
                        key={item.item_id}
                        item={item}
                        editingItemId={editingItemId}
                        editValue={editValue}
                        onEdit={handleEditReorderPoint}
                        onSave={handleSaveReorderPoint}
                        onCancel={handleCancelEdit}
                        onInputChange={handleInputChange}
                        isSubmitting={isSubmitting}
                        getColorForRatio={getColorForRatio}
                        getStatusColor={getStatusColor}
                        getSmartLabel={getSmartLabel}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {balances.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-lg font-semibold text-[var(--c-text-primary)]">هیچ کالایی یافت نشد</p>
                  <p className="text-[var(--c-muted-fg)] mt-2">ابتدا کالاهای انبار را تنظیم کنید</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ReorderPointCardProps {
  item: StockBalance;
  editingItemId: string | null;
  editValue: string;
  onEdit: (item: StockBalance) => void;
  onSave: (itemId: string) => Promise<void>;
  onCancel: () => void;
  onInputChange: (value: string) => void;
  isSubmitting: boolean;
  getColorForRatio: (balance: number, reorderPoint: number) => string;
  getStatusColor: (balance: number, reorderPoint: number) => string;
  getSmartLabel: (itemId: string, balance: number) => string;
}

function ReorderPointCard({
  item,
  editingItemId,
  editValue,
  onEdit,
  onSave,
  onCancel,
  onInputChange,
  isSubmitting,
  getColorForRatio,
  getStatusColor,
  getSmartLabel,
}: ReorderPointCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className={`
          bg-gradient-to-r ${getColorForRatio(item.balance, item.reorder_point)}
          rounded-xl p-4 border border-gray-200 dark:border-gray-700
          transition-all hover:shadow-md
        `}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Left side - Item Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h3 className="font-bold text-[var(--c-text-primary)] truncate">
                  {item.item_name}
                </h3>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-sm font-semibold ${getStatusColor(item.balance, item.reorder_point)}`}>
                    {getSmartLabel(item.item_id, item.balance)}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {item.item_unit}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Center - Inventory Info */}
          <div className="flex items-center gap-6 min-w-max">
            {/* Current Stock */}
            <div className="text-center">
              <p className="text-xs text-[var(--c-muted-fg)] mb-1">موجودی فعلی</p>
              <p className="text-2xl font-bold text-[var(--c-text-primary)]">
                {toPersianNumbers(item.balance.toString())}
              </p>
              <p className="text-xs text-[var(--c-muted-fg)] mt-1">{item.item_unit}</p>
            </div>

            {/* Progress indicator */}
            <div className="w-1 h-12 bg-gradient-to-b from-green-500 to-red-500 rounded-full opacity-30" />

            {/* Reorder Point */}
            {editingItemId === item.item_id ? (
              <div className="text-center min-w-[120px]">
                <p className="text-xs text-[var(--c-muted-fg)] mb-1">نقطه سفارش جدید</p>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={editValue}
                  onChange={(e) => onInputChange(e.target.value)}
                  placeholder="عدد وارد کنید"
                  className="text-center font-bold mb-2"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => onSave(item.item_id)}
                    disabled={isSubmitting}
                    className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white px-3 py-1 rounded text-sm font-medium transition-colors flex items-center justify-center gap-1"
                  >
                    {isSubmitting ? <Loader className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={onCancel}
                    className="flex-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-3 py-1 rounded text-sm font-medium transition-colors flex items-center justify-center gap-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center min-w-[120px]">
                <p className="text-xs text-[var(--c-muted-fg)] mb-1">نقطه سفارش</p>
                {item.reorder_point > 0 ? (
                  <>
                    <p className="text-2xl font-bold text-[var(--c-text-primary)]">
                      {toPersianNumbers(item.reorder_point.toString())}
                    </p>
                    <p className="text-xs text-[var(--c-muted-fg)] mt-1">{item.item_unit}</p>
                  </>
                ) : (
                  <p className="text-lg text-gray-400 italic">تنظیم نشده</p>
                )}
              </div>
            )}
          </div>

          {/* Right side - Action Button */}
          {editingItemId !== item.item_id && (
            <button
              onClick={() => onEdit(item)}
              className="p-2 hover:bg-white/50 dark:hover:bg-black/20 rounded-lg transition-colors"
            >
              <Edit2 className="w-5 h-5 text-[var(--c-text-primary)]" />
            </button>
          )}
        </div>

        {/* Progress bar */}
        {item.reorder_point > 0 && (
          <div className="mt-3 h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className={`h-full bg-gradient-to-r ${
                item.balance <= item.reorder_point
                  ? 'from-red-500 to-orange-500'
                  : item.balance <= item.reorder_point * 1.5
                    ? 'from-orange-500 to-yellow-500'
                    : item.balance <= item.reorder_point * 2
                      ? 'from-yellow-500 to-blue-500'
                      : 'from-blue-500 to-green-500'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((item.balance / (item.reorder_point * 2.5)) * 100, 100)}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
