import { logger } from '@/utils/logger';
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns-jalali';
import { ItemCategory } from '@/types/database.types';
import {
  FileText,
  Download,
  Filter,
  ShoppingCart,
  ClipboardList,
  Warehouse,
  BarChart3,
  Search,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { JalaliDatePicker } from '@/components/ui/JalaliDatePicker';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { toast } from 'sonner';
import { toPersianNumbers, formatRial } from '@/utils/persianNumbers';
import { formatJalaliDate, jalaliToGregorian } from '@/utils/jalaliDate';
import { exportToExcel as exportToExcelPro } from '@/utils/excelExport';

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

interface FarmHall {
  id: string;
  name: string | null;
  hall_number: number;
}

interface Supplier {
  id: string;
  name: string;
}

interface ReportData {
  date: string;
  item_name: string;
  item_category: string;
  unit: string;
  quantity: number;
  unit_price?: number;
  total_price?: number;
  supplier?: string;
  hall_name?: string;
  formula_name?: string;
  reference_no?: string;
  notes?: string;
}

type ReportType = 'consumption' | 'purchase' | 'inventory' | 'summary';
type DateRange =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_year'
  | 'custom';

export default function ReportsPage() {
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin';

  // Farm selection
  const [farms, setFarms] = useState<Farm[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(
    isAdmin ? null : profile?.farm_id || null
  );

  // Report type
  const [reportType, setReportType] = useState<ReportType>('consumption');
  const [dateRange, setDateRange] = useState<DateRange>('this_month');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [itemFilter, setItemFilter] = useState<string>('all');
  const [hallFilter, setHallFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  // Data
  const [farmItems, setFarmItems] = useState<FarmItem[]>([]);
  const [farmHalls, setFarmHalls] = useState<FarmHall[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const [lastPrices, setLastPrices] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  // Load farms
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

  // Load farm data when farm changes
  useEffect(() => {
    if (!selectedFarmId) return;

    // Load items
    supabaseAdmin
      .from('farm_items')
      .select('id, name, unit, category')
      .eq('farm_id', selectedFarmId)
      .eq('is_active', true)
      .order('category')
      .order('name')
      .then(({ data }) => setFarmItems(data || []));

    // Load halls
    supabaseAdmin
      .from('farm_halls')
      .select('id, name, hall_number')
      .eq('farm_id', selectedFarmId)
      .eq('is_active', true)
      .order('hall_number')
      .then(({ data }) => setFarmHalls((data as FarmHall[]) || []));

    // Load suppliers
    supabaseAdmin
      .from('suppliers')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setSuppliers(data || []));

  }, [selectedFarmId]);

  // آخرین قیمت خرید
  useEffect(() => {
    if (!selectedFarmId) return;

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
  }, [selectedFarmId]);

  // Calculate date range
  // compute range according to jalali calendar and localized week/year boundaries
  const getDateRange = () => {
    const today = new Date();
    let from: Date | string, to: Date | string;

    switch (dateRange) {
      case 'today':
        from = today;
        to = today;
        break;
      case 'yesterday': {
        const d = new Date(today);
        d.setDate(d.getDate() - 1);
        from = d;
        to = d;
        break;
      }
      case 'this_week': {
        // jalali week starts on Saturday (getDay() === 6)
        const start = new Date(today);
        const day = start.getDay();
        const diff = (day + 1) % 7; // days since saturday
        start.setDate(start.getDate() - diff);
        from = start;
        to = today;
        break;
      }
      case 'this_month': {
        // use date-fns-jalali helpers to get start of jalali month
        const start = startOfMonth(today);
        from = start;
        to = today;
        break;
      }
      case 'last_month': {
        const startOfThis = startOfMonth(today);
        const startOfPrev = subMonths(startOfThis, 1);
        const endOfPrev = endOfMonth(startOfPrev);
        from = startOfPrev;
        to = endOfPrev;
        break;
      }
      case 'this_year': {
        // beginning of current jalali year until today
        const jalaliStr = format(today, 'yyyy');
        const startJalali = `${jalaliStr}/01/01`;
        from = jalaliToGregorian(startJalali);
        to = today;
        break;
      }
      case 'last_year': {
        const jalaliYear = Number(format(today, 'yyyy')) - 1;
        const startJalali = `${jalaliYear}/01/01`;
        const endJalali = `${jalaliYear}/12/30`; // safe upper bound; supabase query will simply return whatever exists
        from = jalaliToGregorian(startJalali);
        to = jalaliToGregorian(endJalali);
        break;
      }
      case 'custom':
        from = customDateFrom || today;
        to = customDateTo || today;
        break;
      default:
        // fallback to first day of jalali month until today
        from = startOfMonth(today);
        to = today;
    }

    return {
      from: from instanceof Date ? from.toISOString().split('T')[0] : jalaliToGregorian(from),
      to: to instanceof Date ? to.toISOString().split('T')[0] : jalaliToGregorian(to)
    };
  };

  // Generate report
  const generateReport = async () => {
    if (!selectedFarmId) {
      toast.error('لطفاً یک فارم را انتخاب کنید');
      return;
    }

    setIsLoading(true);
    try {
      const { from, to } = getDateRange();

      if (reportType === 'consumption') {
        // ═══════════════════════════════════════════════════
        // FIX: کوئری از daily_vouchers شروع می‌کند (که farm_id دارد)
        // سپس به daily_voucher_lines join می‌زند
        // ═══════════════════════════════════════════════════
        const { data, error: qErr } = await supabaseAdmin
          .from('daily_vouchers')
          .select(`
            voucher_date,
            status,
            daily_voucher_lines (
              consumed_qty,
              waste_qty,
              hall_numbers,
              farm_items!inner ( name, unit, category )
            )
          `)
          .eq('farm_id', selectedFarmId)
          .eq('status', 'submitted')
          .gte('voucher_date', from)
          .lte('voucher_date', to);

        if (qErr) throw qErr;

        const processedData: ReportData[] = [];
        (data || []).forEach((voucher: any) => {
          (voucher.daily_voucher_lines || []).forEach((line: any) => {
            if (!line.farm_items) return;
            processedData.push({
              date: voucher.voucher_date,
              item_name: line.farm_items.name,
              // FIX: مقدار خام 'feed'/'packaging' نگه می‌داریم برای فیلتر، نمایش جداگانه
              item_category: line.farm_items.category,
              unit: line.farm_items.unit,
              quantity: Number(line.consumed_qty) || 0,
              // FIX: hall_numbers به جای hall_name (که ستون وجود ندارد)
              hall_name: line.hall_numbers || '',
            });
          });
        });

        // فیلتر دسته — FIX: مقایسه با مقدار انگلیسی 'feed'/'packaging'
        let filtered = processedData;
        if (categoryFilter !== 'all') {
          filtered = filtered.filter(r => r.item_category === categoryFilter);
        }
        if (itemFilter !== 'all') {
          const selectedItem = farmItems.find(i => i.id === itemFilter);
          if (selectedItem) filtered = filtered.filter(r => r.item_name === selectedItem.name);
        }

        // تبدیل به فارسی برای نمایش — بعد از فیلتر
        const displayData = filtered.map(r => ({
          ...r,
          item_category: r.item_category === 'feed' ? 'نهاده' : 'بسته‌بندی',
        }));

        // گروه‌بندی بر اساس کالا و جمع مقادیر
        const grouped = displayData.reduce((acc: any, curr) => {
          const key = `${curr.item_name}-${curr.date}`;
          if (!acc[key]) {
            acc[key] = { ...curr, quantity: 0 };
          }
          acc[key].quantity += curr.quantity;
          return acc;
        }, {});

        setReportData(Object.values(grouped));
      }
      else if (reportType === 'purchase') {
        // Get purchases
        const { data } = await supabaseAdmin
          .from('inventory_transactions')
          .select(`
            *,
            farm_items(name, unit, category),
            suppliers(name)
          `)
          .eq('farm_id', selectedFarmId)
          .in('txn_type', ['purchase', 'transfer_in'])
          .gte('txn_date', from)
          .lte('txn_date', to)
          .order('txn_date', { ascending: false });

        let processedData: ReportData[] = (data || []).map((d: any) => ({
          date: d.txn_date,
          item_name: d.farm_items?.name,
          item_category: d.farm_items?.category === 'feed' ? 'نهاده' : 'بسته‌بندی',
          unit: d.farm_items?.unit,
          quantity: Number(d.qty_in) || 0,
          unit_price: d.unit_price,
          total_price: d.total_price,
          supplier: d.suppliers?.name || d.supplier_name,
          reference_no: d.reference_no,
        }));

        // Filter
        if (categoryFilter !== 'all') processedData = processedData.filter(r => r.item_category === categoryFilter);
        if (itemFilter !== 'all') processedData = processedData.filter(r => r.item_name === itemFilter);
        if (supplierFilter !== 'all') processedData = processedData.filter(r => r.supplier === suppliers.find(s => s.id === supplierFilter)?.name);

        setReportData(processedData);
      }
      else if (reportType === 'inventory') {
        // Get current stock balances
        let itemsQuery = supabaseAdmin
          .from('farm_items')
          .select('id, name, unit, category, reorder_point')
          .eq('farm_id', selectedFarmId)
          .eq('is_active', true);

        if (categoryFilter !== 'all') itemsQuery = itemsQuery.eq('category', categoryFilter as ItemCategory);
        if (itemFilter !== 'all') itemsQuery = itemsQuery.eq('id', itemFilter);

        const { data: items } = await itemsQuery.order('category').order('name');

        // Get all transactions
        const { data: transactions } = await supabaseAdmin
          .from('inventory_transactions')
          .select('item_id, txn_type, qty_in, qty_out')
          .eq('farm_id', selectedFarmId)
          .lte('txn_date', to);

        // Calculate balances
        const balanceMap = new Map<string, { total_in: number; total_out: number; initial: number }>();

        (transactions || []).forEach((t: any) => {
          const current = balanceMap.get(t.item_id) || { total_in: 0, total_out: 0, initial: 0 };
          current.total_in += Number(t.qty_in) || 0;
          current.total_out += Number(t.qty_out) || 0;
          if (t.txn_type === 'initial') current.initial += Number(t.qty_in) || 0;
          balanceMap.set(t.item_id, current);
        });

        const processedData = (items || []).map((item: any) => {
          const balance = balanceMap.get(item.id) || { total_in: 0, total_out: 0, initial: 0 };
          return {
            date: to,
            item_name: item.name,
            item_category: item.category === 'feed' ? 'نهاده' : 'بسته‌بندی',
            unit: item.unit,
            quantity: balance.initial + balance.total_in - balance.total_out,
            total_price: balance.total_in,
            notes: item.reorder_point ? `نقطه سفارش: ${item.reorder_point}` : '',
          };
        });

        setReportData(processedData);
      }
      else if (reportType === 'summary') {
        // FIX: همان کوئری اصلاح‌شده از daily_vouchers
        const { data } = await supabaseAdmin
          .from('daily_vouchers')
          .select(`
            voucher_date,
            daily_voucher_lines (
              consumed_qty,
              hall_numbers,
              farm_items!inner ( name, unit, category )
            )
          `)
          .eq('farm_id', selectedFarmId)
          .eq('status', 'submitted')
          .gte('voucher_date', from)
          .lte('voucher_date', to);

        const summaryByHall: Record<string, number> = {};
        const summaryByItem: Record<string, number> = {};

        (data || []).forEach((voucher: any) => {
          (voucher.daily_voucher_lines || []).forEach((line: any) => {
            if (!line.farm_items) return;
            const hall = line.hall_numbers || 'بدون سالن';
            const item = line.farm_items.name;
            const qty = Number(line.consumed_qty) || 0;

            summaryByHall[hall] = (summaryByHall[hall] || 0) + qty;
            summaryByItem[item] = (summaryByItem[item] || 0) + qty;
          });
        });

        const processedData = [
          ...Object.entries(summaryByHall).map(([hall, qty]) => ({
            date: from,
            item_name: hall,
            item_category: 'جمع بر اساس سالن',
            unit: '-',
            quantity: qty,
          })),
          ...Object.entries(summaryByItem).map(([item, qty]) => ({
            date: from,
            item_name: item,
            item_category: 'جمع بر اساس کالا',
            unit: '-',
            quantity: qty,
          })),
        ];

        setReportData(processedData);
      }
    } catch (err) {
      logger.error('Error generating report:', err);
      toast.error('خطا در تولید گزارش');
    } finally {
      setIsLoading(false);
    }
  };

  // Get options for searchable selects
  const itemOptions = farmItems.map(i => ({ value: i.id, label: `${i.name} (${i.unit})` }));
  const hallOptions = farmHalls.map(h => ({ value: h.id, label: h.name || h.hall_number.toString() }));
  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }));

  // Summary statistics
  const stats = useMemo(() => {
    if (reportData.length === 0) return null;

    const totalQty = reportData.reduce((sum, r) => sum + (r.quantity || 0), 0);
    const totalValue = reportData.reduce((sum, r) => sum + (r.total_price || 0), 0);
    const uniqueItems = new Set(reportData.map(r => r.item_name)).size;
    const uniqueDates = new Set(reportData.map(r => r.date)).size;

    return { totalQty, totalValue, uniqueItems, uniqueDates };
  }, [reportData]);

  // Export to Excel
  const handleExport = async () => {
    if (reportData.length === 0) {
      toast.error('داده‌ای برای خروجی وجود ندارد');
      return;
    }

    const columns = [
      { key: 'date', header: 'تاریخ', width: 12 },
      { key: 'item_name', header: 'نام کالا', width: 25 },
      { key: 'item_category', header: 'دسته', width: 12 },
      { key: 'unit', header: 'واحد', width: 10 },
      { key: 'quantity', header: 'مقدار', width: 12 },
      { key: 'unit_price', header: 'قیمت واحد (ریال)', width: 18 },
      { key: 'total_price', header: 'قیمت کل (ریال)', width: 20 },
      { key: 'supplier', header: 'تأمین‌کننده', width: 20 },
      { key: 'hall_name', header: 'سالن', width: 15 },
      { key: 'reference_no', header: 'شماره مرجع', width: 15 },
    ];

    const formattedData = reportData.map(r => ({
      ...r,
      date: formatJalaliDate(r.date),
      quantity: toPersianNumbers(r.quantity?.toLocaleString() || '0'),
      unit_price: r.unit_price ? formatRial(r.unit_price) : '—',
      total_price: r.total_price ? formatRial(r.total_price) : '—',
    }));

    await exportToExcelPro({
      fileName: `report_${reportType}_${new Date().toISOString().split('T')[0]}`,
      sheetName: 'گزارش',
      title: getReportTitle(),
      subtitle: `تاریخ: ${formatJalaliDate(new Date().toISOString())}`,
      columns,
      data: formattedData,
    });

    toast.success('گزارش با موفقیت صادر شد');
  };

  const getReportTitle = () => {
    switch (reportType) {
      case 'consumption': return 'گزارش مصرف';
      case 'purchase': return 'گزارش خرید و انتقال';
      case 'inventory': return 'گزارش موجودی انبار';
      case 'summary': return 'گزارش خلاصه';
      default: return 'گزارش';
    }
  };

  const getDateRangeLabel = () => {
    switch (dateRange) {
      case 'today': return 'امروز';
      case 'yesterday': return 'دیروز';
      case 'this_week': return 'هفته جاری';
      case 'this_month': return 'ماه جاری';
      case 'last_month': return 'ماه گذشته';
      case 'this_year': return 'سال جاری';
      case 'last_year': return 'سال گذشته';
      case 'custom': return 'دلخواه';
      default: return '';
    }
  };

  if (!selectedFarmId && !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <Warehouse className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">دسترسی محدود</h3>
            <p className="text-[var(--c-muted-fg)]">شما مجوز مشاهده گزارشات را ندارید.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          <h1 className="text-2xl font-bold text-[var(--c-fg)]">گزارشات</h1>
          <p className="text-sm text-[var(--c-muted-fg)] mt-1">
            مشاهده و صدور گزارشات مختلف از عملکرد فارم
          </p>
        </div>

        {isAdmin && (
          <select
            value={selectedFarmId || ''}
            onChange={(e) => setSelectedFarmId(e.target.value)}
            className="px-4 py-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] min-w-[200px]"
          >
            <option value="">انتخاب فارم</option>
            {farms.map((farm) => (
              <option key={farm.id} value={farm.id}>{farm.name} ({farm.code})</option>
            ))}
          </select>
        )}
      </div>

      {!selectedFarmId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Warehouse className="w-16 h-16 mx-auto text-[var(--c-muted-fg)] mb-4" />
            <p className="text-[var(--c-muted-fg)]">لطفاً یک فارم را انتخاب کنید</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Report Type Selection */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { id: 'consumption', label: 'مصرف', icon: ClipboardList, color: 'blue' },
              { id: 'purchase', label: 'خرید و انتقال', icon: ShoppingCart, color: 'green' },
              { id: 'inventory', label: 'موجودی انبار', icon: Warehouse, color: 'teal' },
              { id: 'summary', label: 'گزارش خلاصه', icon: BarChart3, color: 'purple' },
            ].map((type) => (
              <button
                key={type.id}
                onClick={() => { setReportType(type.id as ReportType); setReportData([]); }}
                className={`p-4 rounded-lg border-2 transition-all ${reportType === type.id
                  ? `border-${type.color}-500 bg-${type.color}-50 dark:bg-${type.color}-900/20`
                  : 'border-[var(--c-border)] hover:border-[var(--c-muted-fg)]'
                  }`}
              >
                <type.icon className={`w-6 h-6 mx-auto mb-2 text-${type.color}-600`} />
                <span className="text-sm font-medium">{type.label}</span>
              </button>
            ))}
          </div>

          {/* Filters Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-[var(--c-primary)]" />
                <CardTitle className="text-base">فیلترها</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Date Range */}
                <div>
                  <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">بازه زمانی</label>
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value as DateRange)}
                    className="w-full px-3 py-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)]"
                  >
                    <option value="today">امروز</option>
                    <option value="yesterday">دیروز</option>
                    <option value="this_week">هفته جاری</option>
                    <option value="this_month">ماه جاری</option>
                    <option value="last_month">ماه گذشته</option>
                    <option value="this_year">سال جاری</option>
                    <option value="last_year">سال گذشته</option>
                    <option value="custom">دلخواه</option>
                  </select>
                </div>

                {/* Custom Date From */}
                {dateRange === 'custom' && (
                  <div>
                    <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">از تاریخ</label>
                    <JalaliDatePicker
                      value={customDateFrom}
                      onChange={setCustomDateFrom}
                      placeholder="از تاریخ"
                    />
                  </div>
                )}

                {dateRange === 'custom' && (
                  <div>
                    <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">تا تاریخ</label>
                    <JalaliDatePicker
                      value={customDateTo}
                      onChange={setCustomDateTo}
                      placeholder="تا تاریخ"
                    />
                  </div>
                )}

                {/* Category Filter */}
                <div>
                  <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">دسته</label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)]"
                  >
                    <option value="all">همه</option>
                    <option value="feed">نهاده‌ها</option>
                    <option value="packaging">بسته‌بندی</option>
                  </select>
                </div>

                {/* Item Filter */}
                <div>
                  <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">کالا</label>
                  <SearchableSelect
                    value={itemFilter}
                    onChange={setItemFilter}
                    options={[{ value: 'all', label: 'همه کالاها' }, ...itemOptions]}
                    placeholder="انتخاب کالا"
                  />
                </div>

                {/* Hall Filter */}
                {reportType === 'consumption' && (
                  <div>
                    <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">سالن</label>
                    <SearchableSelect
                      value={hallFilter}
                      onChange={setHallFilter}
                      options={[{ value: 'all', label: 'همه سالن‌ها' }, ...hallOptions]}
                      placeholder="انتخاب سالن"
                    />
                  </div>
                )}

                {/* Supplier Filter */}
                {reportType === 'purchase' && (
                  <div>
                    <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">تأمین‌کننده</label>
                    <SearchableSelect
                      value={supplierFilter}
                      onChange={setSupplierFilter}
                      options={[{ value: 'all', label: 'همه تأمین‌کنندگان' }, ...supplierOptions]}
                      placeholder="انتخاب تأمین‌کننده"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-4">
                <Button onClick={generateReport} isLoading={isLoading}>
                  <Search className="w-4 h-4 ml-2" />
                  تولید گزارش
                </Button>
                {reportData.length > 0 && (
                  <Button
                    onClick={handleExport}
                    className="bg-green-600 hover:bg-green-700 text-white border-none"
                  >
                    <Download className="w-4 h-4 ml-2" />
                    خروجی اکسل
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Statistics */}
          {stats && reportData.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-blue-600 mb-1">مجموع مقدار</p>
                  <p className="text-xl font-bold text-blue-700">{toPersianNumbers(stats.totalQty.toLocaleString())}</p>
                </CardContent>
              </Card>
              <Card className="bg-green-50 dark:bg-green-900/20 border-green-200">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-green-600 mb-1">مجموع ارزش</p>
                  <p className="text-xl font-bold text-green-700">{formatRial(stats.totalValue)}</p>
                </CardContent>
              </Card>
              <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-purple-600 mb-1">تعداد اقلام</p>
                  <p className="text-xl font-bold text-purple-700">{toPersianNumbers(stats.uniqueItems)}</p>
                </CardContent>
              </Card>
              <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-orange-600 mb-1">تعداد روزها</p>
                  <p className="text-xl font-bold text-orange-700">{toPersianNumbers(stats.uniqueDates)}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Report Data Table */}
          {reportData.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[var(--c-primary)]" />
                    <CardTitle className="text-base">{getReportTitle()}</CardTitle>
                    <Badge variant="outline">{getDateRangeLabel()}</Badge>
                  </div>
                  <span className="text-sm text-[var(--c-muted-fg)]">
                    {toPersianNumbers(reportData.length)} ردیف
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[var(--c-muted)] border-b border-[var(--c-border)]">
                      <tr>
                        <th className="text-right py-3 px-3 text-xs font-semibold text-[var(--c-muted-fg)]">ردیف</th>
                        <th className="text-right py-3 px-3 text-xs font-semibold text-[var(--c-muted-fg)]">تاریخ</th>
                        <th className="text-right py-3 px-3 text-xs font-semibold text-[var(--c-muted-fg)]">نام کالا</th>
                        <th className="text-right py-3 px-3 text-xs font-semibold text-[var(--c-muted-fg)]">دسته</th>
                        <th className="text-right py-3 px-3 text-xs font-semibold text-[var(--c-muted-fg)]">واحد</th>
                        <th className="text-right py-3 px-3 text-xs font-semibold text-[var(--c-muted-fg)]">مقدار</th>
                        {reportType === 'purchase' && (
                          <>
                            <th className="text-right py-3 px-3 text-xs font-semibold text-[var(--c-muted-fg)]">قیمت واحد (ریال)</th>
                            <th className="text-right py-3 px-3 text-xs font-semibold text-[var(--c-muted-fg)]">قیمت کل (ریال)</th>
                            <th className="text-right py-3 px-3 text-xs font-semibold text-[var(--c-muted-fg)]">تأمین‌کننده</th>
                          </>
                        )}
                        {reportType === 'consumption' && (
                          <>
                            <th className="text-right py-3 px-3 text-xs font-semibold text-indigo-600 dark:text-indigo-400">ارزش مصرف (ریال)</th>
                            <th className="text-right py-3 px-3 text-xs font-semibold text-[var(--c-muted-fg)]">سالن</th>
                          </>
                        )}
                        <th className="text-right py-3 px-3 text-xs font-semibold text-[var(--c-muted-fg)]">شماره مرجع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.slice(0, 100).map((row, index) => (
                        <tr key={index} className="border-b border-[var(--c-border)] hover:bg-[var(--c-muted)]/50">
                          <td className="py-3 px-3 text-sm">{toPersianNumbers(index + 1)}</td>
                          <td className="py-3 px-3 text-sm">{formatJalaliDate(row.date)}</td>
                          <td className="py-3 px-3 text-sm font-medium">{row.item_name}</td>
                          <td className="py-3 px-3 text-sm">
                            <Badge className={row.item_category === 'نهاده' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}>
                              {row.item_category}
                            </Badge>
                          </td>
                          <td className="py-3 px-3 text-sm">{row.unit}</td>
                          <td className="py-3 px-3 text-sm font-medium text-green-600">
                            {toPersianNumbers(row.quantity?.toLocaleString() || '0')}
                          </td>
                          {reportType === 'purchase' && (
                            <>
                              <td className="py-3 px-3 text-sm">{row.unit_price ? formatRial(row.unit_price) : '—'}</td>
                              <td className="py-3 px-3 text-sm">{row.total_price ? formatRial(row.total_price) : '—'}</td>
                              <td className="py-3 px-3 text-sm">{row.supplier || '-'}</td>
                            </>
                          )}
                          {reportType === 'consumption' && (
                            <>
                              <td className="py-3 px-3 text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                                {(() => {
                                  const farmItem = farmItems.find(fi => fi.name === row.item_name);
                                  const price = farmItem ? (lastPrices.get(farmItem.id) || 0) : 0;
                                  const value = row.quantity * price;
                                  return value > 0 ? formatRial(value) : '—';
                                })()}
                              </td>
                              <td className="py-3 px-3 text-sm">{row.hall_name ? toPersianNumbers(row.hall_name) : '—'}</td>
                            </>
                          )}
                          <td className="py-3 px-3 text-sm text-[var(--c-muted-fg)]">{row.reference_no ? toPersianNumbers(row.reference_no) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {reportData.length > 100 && (
                    <div className="text-center py-4 text-sm text-[var(--c-muted-fg)]">
                      و {toPersianNumbers(reportData.length - 100)} ردیف دیگر...
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : !isLoading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart3 className="w-16 h-16 mx-auto text-[var(--c-muted-fg)] mb-4" />
                <p className="text-[var(--c-muted-fg)] mb-4">گزارشی تولید نشده است</p>
                <p className="text-sm text-[var(--c-muted-fg)]">
                  با انتخاب فیلترهای مناسب و کلیک روی "تولید گزارش" می‌توانید گزارش مورد نظر را مشاهده کنید
                </p>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </motion.div>
  );
}
