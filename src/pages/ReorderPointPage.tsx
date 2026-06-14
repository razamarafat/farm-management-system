import { logger } from '@/utils/logger';
import { useState, useEffect, useMemo, useCallback } from 'react';
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
  DollarSign,
  Pencil,
  AlertCircle,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useStockBalances } from '@/hooks/useInventory';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from 'sonner';
import { toPersianNumbers, toEnglishDigits, formatRial } from '@/utils/persianNumbers';
import type { StockBalance } from '@/types/inventory.types';


type LastPriceMap = Record<string, number>;

const MANUAL_LAST_PRICE_KEY = 'manual-last-price-map';


function normalizeFarmId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0];
  return null;
}

function getManualPriceStorageKey(farmId: string): string {
  return `${MANUAL_LAST_PRICE_KEY}:${farmId}`;
}

function loadManualLastPriceMap(farmId: string): LastPriceMap {
  try {
    const raw = localStorage.getItem(getManualPriceStorageKey(farmId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const safe: LastPriceMap = {};
    Object.entries(parsed).forEach(([itemId, value]) => {
      const num = Number(value);
      if (Number.isFinite(num) && num >= 0) safe[itemId] = num;
    });
    return safe;
  } catch {
    return {};
  }
}

function saveManualLastPriceMap(farmId: string, data: LastPriceMap) {
  try {
    localStorage.setItem(getManualPriceStorageKey(farmId), JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

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
    isAdmin ? null : normalizeFarmId(profile?.farm_id)
  );
  const [farms, setFarms] = useState<Array<{ id: string; name: string }>>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [avgConsumption, setAvgConsumption] = useState<Map<string, number>>(new Map());
  const [lastPurchasePriceMap, setLastPurchasePriceMap] = useState<LastPriceMap>({});
  const [manualLastPriceMap, setManualLastPriceMap] = useState<LastPriceMap>({});
  const [editingLastPriceItemId, setEditingLastPriceItemId] = useState<string | null>(null);
  const [lastPriceInputValue, setLastPriceInputValue] = useState('');

  const { balances, isLoading, refetch } = useStockBalances(selectedFarmId, 'all');


  const fetchLastPurchasePrices = useCallback(async (farmId: string, itemIds: string[]) => {
    if (itemIds.length === 0) {
      setLastPurchasePriceMap({});
      return;
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('inventory_transactions')
        .select('item_id, unit_price, txn_ts')
        .eq('farm_id', farmId)
        .eq('txn_type', 'purchase')
        .in('item_id', itemIds)
        .not('unit_price', 'is', null)
        .order('txn_ts', { ascending: false });

      if (error) throw error;

      const latestPriceMap: LastPriceMap = {};
      (data || []).forEach((row) => {
        const price = Number(row.unit_price ?? 0);
        if (!Number.isFinite(price) || price <= 0) return;
        if (latestPriceMap[row.item_id] === undefined) {
          latestPriceMap[row.item_id] = price;
        }
      });
      setLastPurchasePriceMap(latestPriceMap);
    } catch (err) {
      logger.error('Error fetching last purchase prices:', err);
      setLastPurchasePriceMap({});
    }
  }, []);

  // Fetch farms (admin: all, non-admin: assigned)
  useEffect(() => {
    const loadFarms = async () => {
      try {
        if (isAdmin) {
          const { data } = await supabaseAdmin
            .from('farms')
            .select('id, name')
            .eq('is_active', true)
            .order('name');

          if (data) {
            setFarms(data);
            if (data.length > 0 && !selectedFarmId) {
              setSelectedFarmId(data[0].id);
            }
          }
          return;
        }

        if (profile?.farm_id) {
          const normalizedFarmId = normalizeFarmId(profile.farm_id);
          if (!normalizedFarmId) return;

          const farmIdArray = [normalizedFarmId];

          const { data } = await supabaseAdmin
            .from('farms')
            .select('id, name')
            .in('id', farmIdArray)
            .eq('is_active', true);

          if (data) {
            setFarms(data);
            if (data.length > 0 && !selectedFarmId) {
              setSelectedFarmId(data[0].id);
            }
          }
        }
      } catch (err) {
        logger.error('Error loading farms:', err);
      }
    };

    loadFarms();
  }, [isAdmin, profile?.farm_id, selectedFarmId]);

  // Load 7-day average consumption data
  useEffect(() => {
    if (!selectedFarmId) return;
    fetch7DayAvgConsumption(selectedFarmId).then(setAvgConsumption);
  }, [selectedFarmId]);

  useEffect(() => {
    if (!selectedFarmId) {
      setManualLastPriceMap({});
      return;
    }
    setManualLastPriceMap(loadManualLastPriceMap(selectedFarmId));
  }, [selectedFarmId]);

  useEffect(() => {
    if (!selectedFarmId) {
      setLastPurchasePriceMap({});
      return;
    }
    const itemIds = balances.map((item) => item.item_id);
    fetchLastPurchasePrices(selectedFarmId, itemIds);
  }, [selectedFarmId, balances, fetchLastPurchasePrices]);

  useEffect(() => {
    setEditingItemId(null);
    setEditValue('');
    setEditingLastPriceItemId(null);
    setLastPriceInputValue('');
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

  // Get row background class based on inventory ratio
  const getRowBgClass = (balance: number, reorderPoint: number): string => {
    if (reorderPoint === 0) return '';
    const ratio = balance / reorderPoint;
    if (ratio <= 0.5) return 'bg-red-50 dark:bg-red-950/30';
    if (ratio <= 1) return 'bg-orange-50 dark:bg-orange-950/30';
    if (ratio <= 1.5) return 'bg-orange-50/50 dark:bg-orange-950/20';
    return '';
  };

  // ─── Handlers ────────────────────────────────────────────────

  const handleStartEditReorder = (item: StockBalance) => {
    setEditingItemId(item.item_id);
    setEditValue(String(item.reorder_point));
  };

  const handleCancelEditReorder = () => {
    setEditingItemId(null);
    setEditValue('');
  };

  const handleSaveReorder = async (itemId: string) => {
    const newValue = parseFloat(toEnglishDigits(editValue));
    if (isNaN(newValue) || newValue < 0) {
      toast.error('مقدار نقطه سفارش باید عدد مثبت باشد');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabaseAdmin
        .from('farm_items')
        .update({ reorder_point: newValue })
        .eq('id', itemId);

      if (error) throw error;

      toast.success('نقطه سفارش بروزرسانی شد');
      setEditingItemId(null);
      setEditValue('');
      refetch();
    } catch (err) {
      logger.error('Error updating reorder point:', err);
      toast.error('خطا در بروزرسانی نقطه سفارش');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEditLastPrice = (itemId: string) => {
    const currentManual = manualLastPriceMap[itemId];
    const currentAuto = lastPurchasePriceMap[itemId];
    const current = currentManual ?? currentAuto ?? 0;
    setEditingLastPriceItemId(itemId);
    setLastPriceInputValue(current > 0 ? String(current) : '');
  };

  const handleCancelEditLastPrice = () => {
    setEditingLastPriceItemId(null);
    setLastPriceInputValue('');
  };

  const handleSaveLastPrice = (itemId: string) => {
    const newValue = parseFloat(toEnglishDigits(lastPriceInputValue));
    if (isNaN(newValue) || newValue < 0) {
      toast.error('قیمت باید عدد مثبت باشد');
      return;
    }

    const updated = { ...manualLastPriceMap };
    if (newValue === 0) {
      delete updated[itemId];
    } else {
      updated[itemId] = newValue;
    }
    setManualLastPriceMap(updated);
    saveManualLastPriceMap(selectedFarmId!, updated);
    setEditingLastPriceItemId(null);
    setLastPriceInputValue('');
    toast.success('قیمت دستی ذخیره شد');
  };

  const getEffectivePrice = (itemId: string): number => {
    if (manualLastPriceMap[itemId] !== undefined) return manualLastPriceMap[itemId];
    return lastPurchasePriceMap[itemId] || 0;
  };

  const getDaysRemaining = (balance: number, itemId: string): string => {
    const daily = avgConsumption.get(itemId) || 0;
    if (daily <= 0) return '—';
    const days = balance / daily;
    if (days <= 0) return '۰';
    return toPersianNumbers(Math.round(days).toLocaleString());
  };

  const getStatusBadge = (balance: number, reorderPoint: number) => {
    if (reorderPoint === 0) {
      return <Badge variant="secondary">تعیین نشده</Badge>;
    }
    const ratio = balance / reorderPoint;
    if (ratio <= 0.5) {
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">بحرانی</Badge>;
    } else if (ratio <= 1) {
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">هشدار</Badge>;
    } else if (ratio <= 1.5) {
      return <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">نزدیک</Badge>;
    }
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">مناسب</Badge>;
  };

  const getBalanceColor = (balance: number, reorderPoint: number): string => {
    if (reorderPoint === 0) return 'text-[var(--c-muted-fg)]';
    if (balance <= 0) return 'text-red-600 font-bold';
    if (balance <= reorderPoint * 0.5) return 'text-red-600 font-bold';
    if (balance <= reorderPoint) return 'text-amber-600 font-semibold';
    if (balance <= reorderPoint * 1.5) return 'text-orange-600 font-medium';
    return 'text-green-600 font-medium';
  };

  // ─── Render table for a category ─────────────────────────────

  const renderCategoryTable = (items: StockBalance[], headerBg: string) => {
    if (items.length === 0) {
      return (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-2" />
            <p className="text-[var(--c-muted-fg)]">موردی در این دسته وجود ندارد</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={`${headerBg} border-b border-[var(--c-border)]`}>
                <tr>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-[var(--c-muted-fg)]">ردیف</th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-[var(--c-muted-fg)]">نام کالا</th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-[var(--c-muted-fg)]">واحد</th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-[var(--c-muted-fg)]">موجودی</th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-[var(--c-muted-fg)]">نقطه سفارش</th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-[var(--c-muted-fg)]">
                    <span className="flex items-center justify-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      آخرین قیمت
                    </span>
                  </th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-[var(--c-muted-fg)]">
                    <span className="flex items-center justify-center gap-1">
                      <TrendingDown className="w-3 h-3" />
                      میانگین روزانه
                    </span>
                  </th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-[var(--c-muted-fg)]">
                    <span className="flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3" />
                      روز تا اتمام
                    </span>
                  </th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-[var(--c-muted-fg)]">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const isEditing = editingItemId === item.item_id;
                  const isEditingPrice = editingLastPriceItemId === item.item_id;
                  const effectivePrice = getEffectivePrice(item.item_id);
                  const isManualPrice = manualLastPriceMap[item.item_id] !== undefined;
                  const dailyAvg = avgConsumption.get(item.item_id) || 0;

                  return (
                    <tr
                      key={item.item_id}
                      className={`border-b border-[var(--c-border)] hover:bg-[var(--c-muted)] transition-colors ${getRowBgClass(item.balance, item.reorder_point)}`}
                    >
                      {/* Row number */}
                      <td className="py-3 px-2 text-center text-sm text-[var(--c-muted-fg)]">
                        {toPersianNumbers(idx + 1)}
                      </td>

                      {/* Item name */}
                      <td className="py-3 px-2 text-center">
                        <span className="font-medium text-[var(--c-fg)] text-sm">{item.item_name}</span>
                      </td>

                      {/* Unit */}
                      <td className="py-3 px-2 text-center text-sm text-[var(--c-muted-fg)]">{item.item_unit}</td>

                      {/* Balance */}
                      <td className="py-3 px-2 text-center" dir="ltr">
                        <span className={`text-sm ${getBalanceColor(item.balance, item.reorder_point)}`}>
                          {toPersianNumbers(item.balance.toLocaleString())}
                        </span>
                      </td>

                      {/* Reorder Point - editable */}
                      <td className="py-3 px-2 text-center" dir="ltr">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            <Input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-20 h-8 text-sm text-center"
                              min="0"
                              autoFocus
                              dir="ltr"
                            />
                            <button
                              onClick={() => handleSaveReorder(item.item_id)}
                              disabled={isSubmitting}
                              className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                              title="ذخیره"
                            >
                              {isSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={handleCancelEditReorder}
                              disabled={isSubmitting}
                              className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                              title="انصراف"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-sm font-medium text-[var(--c-fg)]">
                              {item.reorder_point > 0 ? toPersianNumbers(item.reorder_point.toLocaleString()) : '—'}
                            </span>
                            {isAdmin && (
                              <button
                                onClick={() => handleStartEditReorder(item)}
                                className="p-1 text-[var(--c-muted-fg)] hover:text-[var(--c-fg)] hover:bg-[var(--c-border)] rounded transition-colors"
                                title="ویرایش نقطه سفارش"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Last Price */}
                      <td className="py-3 px-2 text-center" dir="ltr">
                        {isEditingPrice ? (
                          <div className="flex items-center justify-center gap-1">
                            <Input
                              type="number"
                              value={lastPriceInputValue}
                              onChange={(e) => setLastPriceInputValue(e.target.value)}
                              className="w-24 h-8 text-sm text-center"
                              min="0"
                              autoFocus
                              dir="ltr"
                            />
                            <button
                              onClick={() => handleSaveLastPrice(item.item_id)}
                              className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                              title="ذخیره"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={handleCancelEditLastPrice}
                              className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                              title="انصراف"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <span className={`text-sm ${isManualPrice ? 'text-purple-600 dark:text-purple-400 font-medium' : 'text-indigo-600 dark:text-indigo-400'}`}>
                              {effectivePrice > 0 ? formatRial(effectivePrice) : '—'}
                            </span>
                            {isAdmin && (
                              <button
                                onClick={() => handleStartEditLastPrice(item.item_id)}
                                className="p-1 text-[var(--c-muted-fg)] hover:text-[var(--c-fg)] hover:bg-[var(--c-border)] rounded transition-colors"
                                title="ویرایش قیمت دستی"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 7-day Average */}
                      <td className="py-3 px-2 text-center text-sm text-[var(--c-muted-fg)]" dir="ltr">
                        {dailyAvg > 0
                          ? toPersianNumbers(Number(dailyAvg.toFixed(2)).toLocaleString())
                          : '—'}
                      </td>

                      {/* Days Remaining */}
                      <td className="py-3 px-2 text-center" dir="ltr">
                        <span className={`text-sm font-medium ${
                          dailyAvg > 0 && (item.balance / dailyAvg) <= (item.reorder_point > 0 ? item.reorder_point / dailyAvg * 0.5 : 3)
                            ? 'text-red-600'
                            : dailyAvg > 0 && (item.balance / dailyAvg) <= (item.reorder_point > 0 ? item.reorder_point / dailyAvg : 7)
                            ? 'text-amber-600'
                            : 'text-[var(--c-muted-fg)]'
                        }`}>
                          {getDaysRemaining(item.balance, item.item_id)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-2 text-center">
                        {getStatusBadge(item.balance, item.reorder_point)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ─── Main Render ─────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-fg)]">مدیریت نقطه سفارش</h1>
          <p className="text-sm text-[var(--c-muted-fg)] mt-1">
            پایش موجودی، بررسی قیمت‌های خرید و پیش‌بینی نیاز به سفارش
          </p>
        </div>

        <div className="flex items-center gap-3">
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
                  {farm.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 px-3 py-2 text-sm text-[var(--c-muted-fg)] hover:text-[var(--c-fg)] hover:bg-[var(--c-muted)] rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            بازگشت
          </button>
        </div>
      </div>

      {!selectedFarmId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-16 h-16 mx-auto text-[var(--c-muted-fg)] mb-4" />
            <p className="text-[var(--c-muted-fg)]">لطفاً یک فارم را انتخاب کنید</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner className="w-10 h-10" />
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-3"
          >
            <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-xs text-red-600 dark:text-red-400">زیر نقطه سفارش</p>
                    <p className="text-xl font-bold text-red-700 dark:text-red-300">
                      {toPersianNumbers(categorizedItems.belowReorder.length)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-xs text-orange-600 dark:text-orange-400">نزدیک نقطه سفارش</p>
                    <p className="text-xl font-bold text-orange-700 dark:text-orange-300">
                      {toPersianNumbers(categorizedItems.nearReorder.length)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs text-green-600 dark:text-green-400">موجودی کافی</p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-300">
                      {toPersianNumbers(categorizedItems.aboveReorder.length)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-900/40 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">بدون نقطه سفارش</p>
                    <p className="text-xl font-bold text-gray-700 dark:text-gray-300">
                      {toPersianNumbers(categorizedItems.noReorderPoint.length)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-[var(--c-muted-fg)]">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-red-500" />
              <span>موجودی ≤ ۵۰٪ نقطه سفارش (بحرانی)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-amber-500" />
              <span>موجودی ≤ نقطه سفارش (هشدار)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-orange-400" />
              <span>موجودی ≤ ۱.۵ برابر نقطه سفارش (نزدیک)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span>موجودی کافی (مناسب)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-purple-500" />
              <span>قیمت دستی (ویرایش شده توسط کاربر)</span>
            </div>
          </div>

          {/* Category Sections */}
          <AnimatePresence mode="wait">
            {/* Critical: Below Reorder Point */}
            {categorizedItems.belowReorder.length > 0 && (
              <motion.div
                key="below"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <h2 className="text-lg font-bold text-red-600 dark:text-red-400">
                    زیر نقطه سفارش ({toPersianNumbers(categorizedItems.belowReorder.length)})
                  </h2>
                </div>
                {renderCategoryTable(categorizedItems.belowReorder, 'bg-red-100 dark:bg-red-900/30')}
              </motion.div>
            )}

            {/* Warning: Near Reorder Point */}
            {categorizedItems.nearReorder.length > 0 && (
              <motion.div
                key="near"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-5 h-5 text-orange-600" />
                  <h2 className="text-lg font-bold text-orange-600 dark:text-orange-400">
                    نزدیک به نقطه سفارش ({toPersianNumbers(categorizedItems.nearReorder.length)})
                  </h2>
                </div>
                {renderCategoryTable(categorizedItems.nearReorder, 'bg-orange-100 dark:bg-orange-900/30')}
              </motion.div>
            )}

            {/* OK: Above Reorder Point */}
            {categorizedItems.aboveReorder.length > 0 && (
              <motion.div
                key="above"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  <h2 className="text-lg font-bold text-green-600 dark:text-green-400">
                    موجودی کافی ({toPersianNumbers(categorizedItems.aboveReorder.length)})
                  </h2>
                </div>
                {renderCategoryTable(categorizedItems.aboveReorder, 'bg-green-100 dark:bg-green-900/30')}
              </motion.div>
            )}

            {/* No Reorder Point */}
            {categorizedItems.noReorderPoint.length > 0 && (
              <motion.div
                key="none"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-5 h-5 text-gray-500" />
                  <h2 className="text-lg font-bold text-gray-500 dark:text-gray-400">
                    بدون نقطه سفارش ({toPersianNumbers(categorizedItems.noReorderPoint.length)})
                  </h2>
                </div>
                {renderCategoryTable(categorizedItems.noReorderPoint, 'bg-gray-100 dark:bg-gray-900/30')}
              </motion.div>
            )}

            {/* Empty state when no items at all */}
            {balances.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertCircle className="w-16 h-16 mx-auto text-[var(--c-muted-fg)] mb-4" />
                  <p className="text-[var(--c-muted-fg)]">کالایی برای این فارم یافت نشد</p>
                  <p className="text-sm text-[var(--c-muted-fg)] mt-1">
                    ابتدا از بخش مدیریت فارم، نهاده‌ها را تخصیص دهید
                  </p>
                </CardContent>
              </Card>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
