import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowRight,
    Search,
    ChevronLeft,
    ChevronRight,
    Filter,
    Download,
    Package,
    History,
    AlertTriangle
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { usePaginatedTransactions } from '@/hooks/useInventory';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { JalaliDatePicker } from '@/components/ui/JalaliDatePicker';
import { toPersianNumbers } from '@/utils/persianNumbers';
import { gregorianToJalali, jalaliToGregorian } from '@/utils/jalaliDate';
import { TXN_TYPE_LABELS, TXN_TYPE_COLORS, type TransactionType } from '@/types/inventory.types';
import { exportInventoryTransactionsToExcel } from '@/utils/excelExport';

export default function InventoryItemHistoryPage() {
    const { itemId } = useParams<{ itemId: string }>();
    const { profile } = useAuthStore();
    const navigate = useNavigate();
    const [itemInfo, setItemInfo] = useState<{ name: string; unit: string; category: string } | null>(null);

    const farmId = profile?.farm_id || null; // For non-admin, use their farm. Admin logic might need farmId from query or persistent state.
    // For simplicity, let's assume farmId is available or we can fetch it if missing (for admin)
    // Actually, item belongs to a farm, so we can fetch it from item info.

    const [filters, setFilters] = useState({
        search: '',
        txn_type: 'all' as TransactionType | 'all',
        date_from: '',
        date_to: '',
        category: 'all' as 'feed' | 'packaging' | 'all'
    });

    const [showFilters, setShowFilters] = useState(false);

    const gregorianFilters = useMemo(() => ({
        ...filters,
        item_id: itemId || 'all',
        date_from: filters.date_from ? jalaliToGregorian(filters.date_from) : '',
        date_to: filters.date_to ? jalaliToGregorian(filters.date_to) : '',
    }), [filters, itemId]);

    const {
        transactions,
        totalCount,
        currentPage,
        setCurrentPage,
        totalPages,
        isLoading,
        error
    } = usePaginatedTransactions(farmId, itemId || '', gregorianFilters, 15);

    useEffect(() => {
        if (itemId) {
            supabaseAdmin
                .from('farm_items')
                .select('name, unit, category')
                .eq('id', itemId)
                .single()
                .then(({ data }) => setItemInfo(data));
        }
    }, [itemId]);

    const handleBack = () => {
        const basePath = profile?.role === 'admin' ? '/admin' : profile?.role === 'supervisor' ? '/supervisor' : '/operator';
        navigate(`${basePath}/inventory`);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={handleBack} className="p-2">
                        <ArrowRight className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--c-fg)] flex items-center gap-2">
                            <History className="w-6 h-6 text-primary" />
                            تاریخچه تغییرات کالای {itemInfo?.name ?? '...'}
                        </h1>
                        <p className="text-sm text-[var(--c-muted-fg)] mt-1">
                            {itemInfo ? `${itemInfo.unit} | ${itemInfo.category === 'feed' ? 'نهاده' : 'بسته‌بندی'}` : 'در حال بارگذاری...'}
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowFilters(!showFilters)}
                        className={showFilters ? 'bg-primary/10 text-primary border-primary' : ''}
                    >
                        <Filter className="w-4 h-4 ml-1" />
                        فیلترها
                    </Button>
                    <Button
                        onClick={async () => await exportInventoryTransactionsToExcel(transactions, `history_${itemInfo?.name || 'item'}`)}
                        className="bg-green-600 hover:bg-green-700 text-white border-none"
                        size="sm"
                        disabled={transactions.length === 0}
                    >
                        <Download className="w-4 h-4 ml-1" />
                        خروجی اکسل
                    </Button>
                </div>
            </div>

            {/* Filter Panel */}
            <AnimatePresence>
                {showFilters && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <Card className="border-primary/20 bg-primary/5 mb-4">
                            <CardContent className="p-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
                                    <div>
                                        <label className="text-xs text-[var(--c-muted-fg)] mb-1 block">جستجو</label>
                                        <div className="relative">
                                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-muted-fg)]" />
                                            <Input
                                                value={filters.search}
                                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                                placeholder="شماره مرجع، توضیحات..."
                                                className="pr-10 h-9 text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs text-[var(--c-muted-fg)] mb-1 block">نوع تراکنش</label>
                                        <select
                                            value={filters.txn_type}
                                            onChange={(e) => setFilters({ ...filters, txn_type: e.target.value as typeof filters.txn_type })}
                                            className="w-full h-9 px-3 rounded-md border border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-fg)] text-sm"
                                        >
                                            <option value="all">همه انواع</option>
                                            {Object.entries(TXN_TYPE_LABELS).map(([key, label]) => (
                                                <option key={key} value={key}>{label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs text-[var(--c-muted-fg)] mb-1 block">از تاریخ</label>
                                        <JalaliDatePicker
                                            value={filters.date_from}
                                            onChange={(val) => setFilters({ ...filters, date_from: val })}
                                            placeholder="انتخاب تاریخ"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-[var(--c-muted-fg)] mb-1 block">تا تاریخ</label>
                                        <JalaliDatePicker
                                            value={filters.date_to}
                                            onChange={(val) => setFilters({ ...filters, date_to: val })}
                                            placeholder="انتخاب تاریخ"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end mt-4">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setFilters({
                                            search: '',
                                            txn_type: 'all',
                                            date_from: '',
                                            date_to: '',
                                            category: 'all'
                                        })}
                                        className="text-xs"
                                    >
                                        پاک کردن فیلترها
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Table Content */}
            <Card className="overflow-hidden">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <Spinner className="w-10 h-10" />
                        </div>
                    ) : error ? (
                        <div className="text-center py-20">
                            <AlertTriangle className="w-12 h-12 mx-auto text-red-500 mb-4" />
                            <p className="text-[var(--c-fg)]">{error}</p>
                            <Button onClick={() => window.location.reload()} className="mt-4">تلاش مجدد</Button>
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="text-center py-20">
                            <Package className="w-16 h-16 mx-auto text-[var(--c-muted-fg)] mb-4" />
                            <p className="text-[var(--c-fg)]">هیچ تراکنشی یافت نشد</p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-[var(--c-muted)] border-b border-[var(--c-border)]">
                                        <tr>
                                            <th className="py-4 px-4 text-center font-bold text-[var(--c-muted-fg)]">تاریخ</th>
                                            <th className="py-4 px-4 text-center font-bold text-[var(--c-muted-fg)]">نوع تراکنش</th>
                                            <th className="py-4 px-4 text-center font-bold text-[var(--c-muted-fg)]">ورودی (+)</th>
                                            <th className="py-4 px-4 text-center font-bold text-[var(--c-muted-fg)]">خروجی (-)</th>
                                            <th className="py-4 px-4 text-center font-bold text-[var(--c-muted-fg)]">شماره مرجع</th>
                                            <th className="py-4 px-4 text-center font-bold text-[var(--c-muted-fg)]">توضیحات</th>
                                            <th className="py-4 px-4 text-center font-bold text-[var(--c-muted-fg)]">سند</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.map((txn) => {
                                            const typeInfo = TXN_TYPE_COLORS[txn.txn_type as TransactionType];
                                            const basePath = profile?.role === 'admin' ? '/admin' : profile?.role === 'supervisor' ? '/supervisor' : '/operator';
                                            const targetLink = txn.source_type === 'daily_voucher' && txn.source_id
                                                ? `${basePath}/consumption/${txn.txn_type === 'consumption' || txn.txn_type === 'waste' ? 'feed' : 'packaging'}?date=${txn.txn_date}`
                                                : '';

                                            return (
                                                <tr key={txn.id} className="border-b border-[var(--c-border)] hover:bg-[var(--hover-bg)] transition-colors">
                                                    <td className="py-4 px-4 text-center font-medium">{toPersianNumbers(gregorianToJalali(txn.txn_date))}</td>
                                                    <td className="py-4 px-4 text-center">
                                                        <Badge className={`${typeInfo?.bg || ''} ${typeInfo?.text || ''}`}>
                                                            {TXN_TYPE_LABELS[txn.txn_type as TransactionType] || txn.txn_type}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-4 px-4 text-center font-bold text-green-600">
                                                        {txn.qty_in > 0 ? `+${toPersianNumbers(txn.qty_in.toLocaleString())}` : '—'}
                                                    </td>
                                                    <td className="py-4 px-4 text-center font-bold text-red-600">
                                                        {txn.qty_out > 0 ? `-${toPersianNumbers(txn.qty_out.toLocaleString())}` : '—'}
                                                    </td>
                                                    <td className="py-4 px-4 text-center text-[var(--c-muted-fg)]">{toPersianNumbers(txn.reference_no || '—')}</td>
                                                    <td className="py-4 px-4 text-center text-[var(--c-muted-fg)] max-w-[250px] truncate" title={txn.notes || ''}>
                                                        {txn.notes || '—'}
                                                    </td>
                                                    <td className="py-4 px-4 text-center">
                                                        {targetLink && (
                                                            <button
                                                                onClick={() => navigate(targetLink)}
                                                                className="text-primary hover:underline font-medium"
                                                            >
                                                                مشاهده سند
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between px-6 py-4 bg-[var(--c-card)] border-t border-[var(--c-border)]">
                                    <div className="text-sm text-[var(--c-muted-fg)]">
                                        نمایش {toPersianNumbers(Math.min(totalCount, (currentPage - 1) * 15 + 1))} تا {toPersianNumbers(Math.min(totalCount, currentPage * 15))} از {toPersianNumbers(totalCount)} نتیجه
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={currentPage === 1}
                                            onClick={() => setCurrentPage(currentPage - 1)}
                                        >
                                            <ChevronRight className="w-4 h-4 ml-1" />
                                            قبلی
                                        </Button>
                                        <div className="flex items-center gap-2">
                                            {Array.from({ length: totalPages }).map((_, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setCurrentPage(i + 1)}
                                                    className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${currentPage === i + 1
                                                        ? 'bg-primary text-white'
                                                        : 'hover:bg-[var(--c-muted)] text-[var(--c-fg)]'
                                                        }`}
                                                >
                                                    {toPersianNumbers(i + 1)}
                                                </button>
                                            ))}
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={currentPage === totalPages}
                                            onClick={() => setCurrentPage(currentPage + 1)}
                                        >
                                            بعدی
                                            <ChevronLeft className="w-4 h-4 mr-1" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
