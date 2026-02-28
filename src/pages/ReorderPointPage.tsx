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
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useStockBalances } from '@/hooks/useInventory';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from 'sonner';
import { toPersianNumbers, toEnglishDigits, formatRial, formatNumberWithSeparator } from '@/utils/persianNumbers';
import type { StockBalance } from '@/types/inventory.types';


type LastPriceMap = Record<string, number>;

const MANUAL_LAST_PRICE_KEY = 'manual-last-price-map';

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
    isAdmin ? null : profile?.farm_id || null
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
      console.error('Error fetching last purchase prices:', err);
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
          const farmIdArray = Array.isArray(profile.farm_id)
            ? profile.farm_id
            : [profile.farm_id];

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
        console.error('Error loading farms:', err);
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

  // Get color based on inventory ratio
  const getColorForRatio = (balance: number, reorderPoint: number): string => {
    if (reorderPoint === 0) return 'from-gray-100 to-gray-50 dark:from-gray-900 dark:to-gray-800';

    const ratio = balance / reorderPoint;

    if (ratio <= 0.5) {
      return 'from-red-50 to-red-25 dark:from-red-950 dark:to-red-900';
    } else if (ratio <= 1) {
      return 'from-orange-50 to-orange-25 dark:from-orange-950 dark:to-orange-900';
    } else {
        return 'from-green-50 to-green-25 dark:from-green-950 dark:to-green-900';
    }
  }

  // Note: Place UI return logic here to complete the component
  return null; 
}
