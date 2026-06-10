import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, Plus, Search, ChevronDown, ChevronUp,
  Edit3, Trash2, Copy, ToggleLeft, ToggleRight,
  Save, X, Loader2, Beaker, Scale, ListChecks,
  ArrowRightLeft, AlertCircle, CheckCircle2
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { useFormulas, useFormulaActions, useFarmFeedItems, Formula, FormulaInput } from '@/hooks/useFormulas';
import { toast } from 'sonner';
import { formatRial } from '@/utils/persianNumbers';

interface FarmOption {
  id: string;
  name: string;
  code: string;
}

const toPersianNum = (n: number | string): string => {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
};

const FormulaManagementPage = () => {
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin';

  const [farms, setFarms] = useState<FarmOption[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingFormula, setEditingFormula] = useState<Formula | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<Formula | null>(null);
  const [dupNo, setDupNo] = useState('');

  const { formulas, isLoading, error, refetch } = useFormulas(selectedFarmId);
  const { createFormula, updateFormula, deleteFormula, toggleFormulaStatus, duplicateFormula, isSaving } =
    useFormulaActions(selectedFarmId);

  // Fetch farms
  useEffect(() => {
    const loadFarms = async () => {
      const { data } = await supabaseAdmin
        .from('farms')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name');
      setFarms(
        (data || []).map((f) => ({ id: f.id, name: f.name, code: f.code }))
      );
    };

    if (isAdmin) {
      loadFarms();
    } else if (profile?.farm_id) {
      setSelectedFarmId(profile.farm_id);
    }
  }, [isAdmin, profile?.farm_id]);

  useEffect(() => {
    if (farms.length > 0 && !selectedFarmId && isAdmin) {
      setSelectedFarmId(farms[0].id);
    }
  }, [farms, selectedFarmId, isAdmin]);

  const filtered = formulas.filter((f) => {
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      const nameMatch = f.name?.toLowerCase().includes(s);
      const noMatch = String(f.formula_no).includes(s);
      if (!nameMatch && !noMatch) return false;
    }
    if (filterActive === 'active' && !f.is_active) return false;
    if (filterActive === 'inactive' && f.is_active) return false;
    return true;
  });

  const handleCreate = () => {
    setEditingFormula(null);
    setShowForm(true);
  };

  const handleEdit = (f: Formula) => {
    setEditingFormula(f);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteFormula(id);
    if (ok) {
      setDeleteConfirm(null);
      refetch();
    }
  };

  const handleToggle = async (f: Formula) => {
    const ok = await toggleFormulaStatus(f.id, f.is_active);
    if (ok) refetch();
  };

  const handleDuplicate = async () => {
    if (!duplicateTarget || !dupNo) return;
    const no = parseInt(dupNo);
    if (isNaN(no) || no <= 0) {
      toast.error('شماره فرمول معتبر نیست');
      return;
    }
    const ok = await duplicateFormula(duplicateTarget, no);
    if (ok) {
      setDuplicateTarget(null);
      setDupNo('');
      refetch();
    }
  };

  const handleFormSave = async (input: FormulaInput) => {
    let ok: boolean;
    if (editingFormula) {
      ok = await updateFormula(editingFormula.id, input);
    } else {
      ok = await createFormula(input);
    }
    if (ok) {
      setShowForm(false);
      setEditingFormula(null);
      refetch();
    }
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : prev
    );
  };

  const selectedFarm = farms.find((f) => f.id === selectedFarmId);

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--c-fg)] flex items-center gap-2">
            <FlaskConical className="w-7 h-7 text-purple-500" />
            مدیریت فرمول‌ها
          </h2>
          <p className="text-sm text-[var(--c-muted-fg)] mt-1">
            ایجاد، ویرایش و مدیریت فرمول‌های خوراک برای هر فارم
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {compareMode ? (
            <>
              <button
                onClick={() => { setCompareMode(false); setCompareIds([]); }}
                className="px-4 py-2 text-sm rounded-lg border border-[var(--c-border)] text-[var(--c-fg)] hover:bg-[var(--c-muted)]"
              >
                انصراف
              </button>
              {compareIds.length === 2 && (
                <button
                  onClick={() => setExpandedId('compare')}
                  className="px-4 py-2 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700 flex items-center gap-1"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  مقایسه
                </button>
              )}
              <span className="text-xs text-[var(--c-muted-fg)]">
                {toPersianNum(compareIds.length)} از ۲ انتخاب شده
              </span>
            </>
          ) : (
            <>
              <button
                onClick={() => setCompareMode(true)}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--c-border)] text-[var(--c-fg)] hover:bg-[var(--c-muted)] flex items-center gap-1"
              >
                <ArrowRightLeft className="w-4 h-4" />
                مقایسه
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                فرمول جدید
              </button>
            </>
          )}
        </div>
      </div>

      {/* Farm Selector (Admin) */}
      {isAdmin && (
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium text-[var(--c-fg)]">فارم:</label>
          <select
            value={selectedFarmId || ''}
            onChange={(e) => setSelectedFarmId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-card)] text-sm text-[var(--c-fg)]"
          >
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.code})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Stats */}
      {!isLoading && selectedFarmId && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<ListChecks className="w-5 h-5 text-blue-500" />}
            label="کل فرمول‌ها"
            value={toPersianNum(formulas.length)}
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
            label="فعال"
            value={toPersianNum(formulas.filter((f) => f.is_active).length)}
          />
          <StatCard
            icon={<Scale className="w-5 h-5 text-orange-500" />}
            label="میانگین وزن میکسر"
            value={
              formulas.length > 0
                ? toPersianNum(Math.round(formulas.reduce((s, f) => s + f.mixer_weight, 0) / formulas.length)) + ' kg'
                : '—'
            }
          />
          <StatCard
            icon={<Beaker className="w-5 h-5 text-purple-500" />}
            label="میانگین نهاده‌ها"
            value={
              formulas.length > 0
                ? toPersianNum(Math.round(formulas.reduce((s, f) => s + f.items.length, 0) / formulas.length))
                : '—'
            }
          />
        </div>
      )}

      {/* Search + Filter */}
      {selectedFarmId && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-muted-fg)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="جستجوی نام یا شماره فرمول..."
              className="w-full pr-10 pl-4 py-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-card)] text-sm text-[var(--c-fg)] focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-[var(--c-border)] overflow-hidden">
            {(['all', 'active', 'inactive'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterActive(f)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  filterActive === f
                    ? 'bg-purple-600 text-white'
                    : 'text-[var(--c-fg)] hover:bg-[var(--c-muted)]'
                }`}
              >
                {f === 'all' ? 'همه' : f === 'active' ? 'فعال' : 'غیرفعال'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 mx-auto text-red-400 mb-3" />
          <p className="text-[var(--c-fg)]">{error}</p>
          <button onClick={refetch} className="mt-3 px-4 py-2 text-sm rounded-lg bg-purple-600 text-white">
            تلاش مجدد
          </button>
        </div>
      ) : !selectedFarmId ? (
        <div className="text-center py-16">
          <FlaskConical className="w-12 h-12 mx-auto text-[var(--c-muted-fg)] mb-3" />
          <p className="text-[var(--c-fg)]">لطفاً یک فارم انتخاب کنید</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FlaskConical className="w-12 h-12 mx-auto text-[var(--c-muted-fg)] mb-3" />
          <p className="text-[var(--c-fg)] font-medium">فرمولی یافت نشد</p>
          <p className="text-sm text-[var(--c-muted-fg)] mt-1">
            {searchTerm ? 'فیلترها را تغییر دهید' : 'اولین فرمول خوراک را ایجاد کنید'}
          </p>
          {!searchTerm && (
            <button onClick={handleCreate} className="mt-4 px-4 py-2 text-sm rounded-lg bg-green-600 text-white">
              <Plus className="w-4 h-4 inline-block ml-1" />
              ایجاد فرمول
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Compare View */}
          <AnimatePresence>
            {expandedId === 'compare' && compareIds.length === 2 && (
              <ComparePanel
                formulas={formulas.filter((f) => compareIds.includes(f.id))}
                onClose={() => {
                  setExpandedId(null);
                  setCompareMode(false);
                  setCompareIds([]);
                }}
              />
            )}
          </AnimatePresence>

          {/* Formula List */}
          <div className="space-y-3">
            {filtered.map((formula) => (
              <FormulaCard
                key={formula.id}
                formula={formula}
                isExpanded={expandedId === formula.id}
                onToggleExpand={() => setExpandedId(expandedId === formula.id ? null : formula.id)}
                onEdit={() => handleEdit(formula)}
                onDelete={() => setDeleteConfirm(formula.id)}
                onToggleStatus={() => handleToggle(formula)}
                onDuplicate={() => { setDuplicateTarget(formula); setDupNo(String((formulas.at(-1)?.formula_no || 0) + 1)); }}
                compareMode={compareMode}
                isCompareSelected={compareIds.includes(formula.id)}
                onToggleCompare={() => toggleCompare(formula.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <FormulaFormModal
            farmId={selectedFarmId!}
            farmName={selectedFarm?.name || ''}
            formula={editingFormula}
            existingNumbers={formulas.map((f) => f.formula_no)}
            isSaving={isSaving}
            onSave={handleFormSave}
            onClose={() => { setShowForm(false); setEditingFormula(null); }}
          />
        )}
      </AnimatePresence>

      {/* Delete Dialog */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-[var(--c-card)] rounded-xl p-6 max-w-sm w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[var(--c-fg)] mb-3">حذف فرمول</h3>
              <p className="text-sm text-[var(--c-muted-fg)] mb-6">
                آیا از حذف این فرمول اطمینان دارید؟ این عمل غیرقابل بازگشت است.
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm rounded-lg border border-[var(--c-border)] text-[var(--c-fg)]">
                  انصراف
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حذف'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Duplicate Dialog */}
      <AnimatePresence>
        {duplicateTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setDuplicateTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-[var(--c-card)] rounded-xl p-6 max-w-sm w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[var(--c-fg)] mb-3">کپی فرمول</h3>
              <p className="text-sm text-[var(--c-muted-fg)] mb-4">
                فرمول شماره {toPersianNum(duplicateTarget.formula_no)} کپی می‌شود. شماره جدید را وارد کنید:
              </p>
              <input
                type="number"
                value={dupNo}
                onChange={(e) => setDupNo(e.target.value)}
                placeholder="شماره فرمول جدید"
                className="w-full px-3 py-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-card)] text-sm mb-4"
                dir="ltr"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setDuplicateTarget(null)} className="px-4 py-2 text-sm rounded-lg border border-[var(--c-border)] text-[var(--c-fg)]">
                  انصراف
                </button>
                <button
                  onClick={handleDuplicate}
                  disabled={isSaving || !dupNo}
                  className="px-4 py-2 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'کپی'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ============= StatCard ============= */
const StatCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] p-4 flex items-center gap-3">
    <div className="w-10 h-10 rounded-lg bg-[var(--c-muted)] flex items-center justify-center">{icon}</div>
    <div>
      <p className="text-xs text-[var(--c-muted-fg)]">{label}</p>
      <p className="text-lg font-bold text-[var(--c-fg)]">{value}</p>
    </div>
  </div>
);

/* ============= FormulaCard ============= */
interface FormulaCardProps {
  formula: Formula;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  onDuplicate: () => void;
  compareMode: boolean;
  isCompareSelected: boolean;
  onToggleCompare: () => void;
}

const FormulaCard = ({
  formula, isExpanded, onToggleExpand, onEdit, onDelete,
  onToggleStatus, onDuplicate, compareMode, isCompareSelected, onToggleCompare
}: FormulaCardProps) => (
  <motion.div
    layout
    className={`rounded-xl border bg-[var(--c-card)] overflow-hidden transition-shadow ${
      isCompareSelected ? 'border-purple-500 shadow-lg' : 'border-[var(--c-border)]'
    }`}
  >
    {/* Header */}
    <div
      className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--c-muted)] transition-colors"
      onClick={compareMode ? onToggleCompare : onToggleExpand}
    >
      <div className="flex items-center gap-3">
        {compareMode && (
          <div
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              isCompareSelected ? 'bg-purple-600 border-purple-600' : 'border-[var(--c-border)]'
            }`}
          >
            {isCompareSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
          </div>
        )}
        <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
          <FlaskConical className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-[var(--c-fg)]">
              فرمول {toPersianNum(formula.formula_no)}
            </span>
            {formula.name && (
              <span className="text-sm text-[var(--c-muted-fg)]">— {formula.name}</span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              formula.is_active
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
            }`}>
              {formula.is_active ? 'فعال' : 'غیرفعال'}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-[var(--c-muted-fg)] mt-1">
            <span>وزن میکسر: {toPersianNum(formula.mixer_weight)} kg</span>
            <span>تعداد نهاده: {toPersianNum(formula.items.length)}</span>
            <span>وزن کل: {toPersianNum(Math.round(formula.total_weight))} kg</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {!compareMode && (
          <>
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-2 rounded-lg hover:bg-[var(--c-muted)] text-blue-500" title="ویرایش">
              <Edit3 className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="p-2 rounded-lg hover:bg-[var(--c-muted)] text-purple-500" title="کپی">
              <Copy className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onToggleStatus(); }} className="p-2 rounded-lg hover:bg-[var(--c-muted)]" title={formula.is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}>
              {formula.is_active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-2 rounded-lg hover:bg-[var(--c-muted)] text-red-500" title="حذف">
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
        {!compareMode && (
          isExpanded ? <ChevronUp className="w-5 h-5 text-[var(--c-muted-fg)]" /> : <ChevronDown className="w-5 h-5 text-[var(--c-muted-fg)]" />
        )}
      </div>
    </div>

    {/* Expanded Detail */}
    <AnimatePresence>
      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="border-t border-[var(--c-border)] p-4">
            {formula.items.length === 0 ? (
              <p className="text-center text-sm text-[var(--c-muted-fg)] py-4">هنوز نهاده‌ای تعریف نشده</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--c-muted)] text-[var(--c-muted-fg)]">
                      <th className="text-center p-3 rounded-tr-lg w-14">ردیف</th>
                      <th className="text-center p-3">نام نهاده</th>
                      <th className="text-center p-3 w-20">واحد</th>
                      <th className="text-center p-3 w-36">مقدار در هر میکسر</th>
                      <th className="text-center p-3 rounded-tl-lg w-20">درصد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formula.items
                      .sort((a, b) => a.qty_per_mixer > b.qty_per_mixer ? -1 : 1)
                      .map((item, idx) => {
                        const unitPrice = lastPrices.get(item.item_id) || 0;
                        const itemCost = (item.qty_per_mixer * unitPrice);
                        return (
                          <tr key={item.id} className="border-b border-[var(--c-border)] hover:bg-[var(--c-muted)] transition-colors">
                            <td className="p-3 text-center text-[var(--c-muted-fg)]">{toPersianNum(idx + 1)}</td>
                            <td className="p-3 text-center font-medium text-[var(--c-fg)]">{item.item_name}</td>
                            <td className="p-3 text-center text-[var(--c-muted-fg)]">{item.item_unit}</td>
                            <td className="p-3 text-center font-bold text-[var(--c-fg)]" dir="ltr">
                              {toPersianNum(item.qty_per_mixer.toLocaleString())}
                            </td>
                            <td className="p-3 text-center text-indigo-600 dark:text-indigo-400 font-medium" dir="ltr">
                              {unitPrice > 0 ? formatRial(unitPrice) : '—'}
                            </td>
                            <td className="p-3 text-center text-purple-600 dark:text-purple-400 font-medium" dir="ltr">
                              {unitPrice > 0 ? formatRial(itemCost) : '—'}
                            </td>
                            <td className="p-3 text-center text-[var(--c-muted-fg)]">
                              {formula.total_weight > 0
                                ? toPersianNum(((item.qty_per_mixer / formula.total_weight) * 100).toFixed(1)) + '٪'
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    {/* Total Row */}
                    {(() => {
                      const totalCost = formula.items.reduce((sum, item) => {
                        const unitPrice = lastPrices.get(item.item_id) || 0;
                        return sum + (item.qty_per_mixer * unitPrice);
                      }, 0);
                      return (
                        <tr className="bg-purple-50 dark:bg-purple-900/20 font-bold">
                          <td className="p-3 text-center" colSpan={3}>جمع کل</td>
                          <td className="p-3 text-center" dir="ltr">{toPersianNum(Math.round(formula.total_weight).toLocaleString())}</td>
                          <td className="p-3 text-center"></td>
                          <td className="p-3 text-center text-purple-700 dark:text-purple-300" dir="ltr">
                            {totalCost > 0 ? formatRial(totalCost) : '—'}
                          </td>
                        </tr>
                      ))}
                    <tr className="bg-purple-50 dark:bg-purple-900/20 font-bold">
                      <td className="p-3 text-center" colSpan={3}>جمع کل</td>
                      <td className="p-3 text-center" dir="ltr">{toPersianNum(Math.round(formula.total_weight).toLocaleString())}</td>
                      <td className="p-3 text-center">۱۰۰٪</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Visual: Percentage Bar */}
            {formula.items.length > 0 && formula.total_weight > 0 && (
              <div className="mt-4">
                <p className="text-xs text-[var(--c-muted-fg)] mb-2">ترکیب فرمول:</p>
                <div className="flex rounded-lg overflow-hidden h-6">
                  {formula.items
                    .sort((a, b) => b.qty_per_mixer - a.qty_per_mixer)
                    .slice(0, 8)
                    .map((item, idx) => {
                      const pct = (item.qty_per_mixer / formula.total_weight) * 100;
                      const colors = [
                        'bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-purple-500',
                        'bg-teal-500', 'bg-red-500', 'bg-indigo-500', 'bg-amber-500',
                      ];
                      return (
                        <div
                          key={item.id}
                          className={`${colors[idx % colors.length]} flex items-center justify-center text-white text-[10px] font-medium`}
                          style={{ width: `${pct}%`, minWidth: pct > 3 ? '20px' : '4px' }}
                          title={`${item.item_name}: ${pct.toFixed(1)}%`}
                        >
                          {pct > 5 ? item.item_name?.substring(0, 6) : ''}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </motion.div>
);

/* ============= Compare Panel ============= */
const ComparePanel = ({ formulas, onClose }: { formulas: Formula[]; onClose: () => void }) => {
  const [a, b] = formulas;
  const allItemIds = new Set([...a.items.map((i) => i.item_id), ...b.items.map((i) => i.item_id)]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      className="rounded-xl border border-purple-300 dark:border-purple-700 bg-[var(--c-card)] p-4 shadow-lg"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-[var(--c-fg)] flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-purple-500" />
          مقایسه فرمول {toPersianNum(a.formula_no)} با {toPersianNum(b.formula_no)}
        </h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--c-muted)]">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--c-muted)]">
              <th className="text-right p-3">نهاده</th>
              <th className="text-center p-3 text-purple-600">فرمول {toPersianNum(a.formula_no)}</th>
              <th className="text-center p-3 text-blue-600">فرمول {toPersianNum(b.formula_no)}</th>
              <th className="text-center p-3">تفاوت</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(allItemIds).map((itemId) => {
              const ai = a.items.find((x) => x.item_id === itemId);
              const bi = b.items.find((x) => x.item_id === itemId);
              const diff = (ai?.qty_per_mixer || 0) - (bi?.qty_per_mixer || 0);
              return (
                <tr key={itemId} className="border-b border-[var(--c-border)]">
                  <td className="p-3 font-medium">{ai?.item_name || bi?.item_name}</td>
                  <td className="p-3 text-center">{ai ? toPersianNum(ai.qty_per_mixer) : '—'}</td>
                  <td className="p-3 text-center">{bi ? toPersianNum(bi.qty_per_mixer) : '—'}</td>
                  <td className={`p-3 text-center font-bold ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {diff !== 0 ? (diff > 0 ? '+' : '') + toPersianNum(diff) : '—'}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-purple-50 dark:bg-purple-900/20 font-bold">
              <td className="p-3">جمع کل</td>
              <td className="p-3 text-center">{toPersianNum(Math.round(a.total_weight))}</td>
              <td className="p-3 text-center">{toPersianNum(Math.round(b.total_weight))}</td>
              <td className="p-3 text-center">
                {toPersianNum(Math.round(a.total_weight - b.total_weight))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </motion.div>
  );
};

/* ============= Formula Form Modal ============= */
interface FormulaFormModalProps {
  farmId: string;
  farmName: string;
  formula: Formula | null;
  existingNumbers: number[];
  isSaving: boolean;
  onSave: (input: FormulaInput) => void;
  onClose: () => void;
}

const FormulaFormModal = ({ farmId, farmName, formula, existingNumbers, isSaving, onSave, onClose }: FormulaFormModalProps) => {
  const { items: feedItems, isLoading: loadingItems } = useFarmFeedItems(farmId);
  const isEdit = !!formula;

  const [formulaNo, setFormulaNo] = useState(formula?.formula_no || Math.max(0, ...existingNumbers) + 1);
  const [name, setName] = useState(formula?.name || '');
  const [mixerWeight, setMixerWeight] = useState(formula?.mixer_weight || 3000);
  const [isActive, setIsActive] = useState(formula?.is_active ?? true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    if (formula?.items) {
      const map: Record<string, number> = {};
      formula.items.forEach((i) => { map[i.item_id] = i.qty_per_mixer; });
      setQuantities(map);
    }
  }, [formula]);

  const totalWeight = Object.values(quantities).reduce((s, v) => s + (v || 0), 0);
  const itemCount = Object.values(quantities).filter((v) => v > 0).length;

  const handleSubmit = () => {
    if (!isEdit && existingNumbers.includes(formulaNo)) {
      toast.error('این شماره فرمول قبلاً وجود دارد');
      return;
    }
    if (itemCount === 0) {
      toast.error('حداقل یک نهاده باید مقداردهی شود');
      return;
    }

    const items = Object.entries(quantities)
      .filter(([, v]) => v > 0)
      .map(([item_id, qty_per_mixer]) => ({ item_id, qty_per_mixer }));

    onSave({ formula_no: formulaNo, name, mixer_weight: mixerWeight, is_active: isActive, items });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="bg-[var(--c-card)] rounded-xl w-full max-w-2xl shadow-xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--c-border)]">
          <div>
            <h3 className="text-lg font-bold text-[var(--c-fg)]">
              {isEdit ? `ویرایش فرمول ${toPersianNum(formula!.formula_no)}` : 'ایجاد فرمول جدید'}
            </h3>
            <p className="text-xs text-[var(--c-muted-fg)] mt-1">فارم: {farmName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--c-muted)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Basic Info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--c-fg)] mb-1">شماره فرمول *</label>
              <input
                type="number"
                value={formulaNo}
                onChange={(e) => setFormulaNo(parseInt(e.target.value) || 0)}
                disabled={isEdit}
                className="w-full px-3 py-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-card)] text-sm disabled:opacity-50"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--c-fg)] mb-1">نام فرمول</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: استارتر، رشد"
                className="w-full px-3 py-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-card)] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--c-fg)] mb-1">وزن میکسر (kg)</label>
              <input
                type="number"
                value={mixerWeight}
                onChange={(e) => setMixerWeight(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-card)] text-sm"
                dir="ltr"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 accent-green-600" />
                <span className="text-sm text-[var(--c-fg)]">فعال</span>
              </label>
            </div>
          </div>

          {/* Summary */}
          <div className="flex items-center gap-4 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
            <div className="text-sm">
              <span className="text-[var(--c-muted-fg)]">تعداد نهاده‌ها: </span>
              <span className="font-bold text-[var(--c-fg)]">{toPersianNum(itemCount)}</span>
            </div>
            <div className="text-sm">
              <span className="text-[var(--c-muted-fg)]">وزن کل: </span>
              <span className="font-bold text-[var(--c-fg)]">{toPersianNum(Math.round(totalWeight))} kg</span>
            </div>
            {mixerWeight > 0 && totalWeight > 0 && (
              <div className="text-sm">
                <span className="text-[var(--c-muted-fg)]">تفاوت با میکسر: </span>
                <span className={`font-bold ${Math.abs(totalWeight - mixerWeight) < 10 ? 'text-green-600' : 'text-orange-600'}`}>
                  {totalWeight > mixerWeight ? '+' : ''}{toPersianNum(Math.round(totalWeight - mixerWeight))} kg
                </span>
              </div>
            )}
          </div>

          {/* Ingredients Table */}
          <div>
            <p className="text-sm font-medium text-[var(--c-fg)] mb-3 flex items-center gap-1">
              <Beaker className="w-4 h-4 text-purple-500" />
              نهاده‌ها و مقادیر (کیلوگرم در هر میکسر)
            </p>
            {loadingItems ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              </div>
            ) : feedItems.length === 0 ? (
              <div className="text-center py-8 text-sm text-[var(--c-muted-fg)]">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-orange-400" />
                ابتدا نهاده‌ها را در بخش مدیریت فارم تعریف کنید
              </div>
            ) : (
              <div className="border border-[var(--c-border)] rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--c-muted)]">
                      <th className="text-right p-3 w-12">ردیف</th>
                      <th className="text-right p-3">نام نهاده</th>
                      <th className="text-right p-3 w-24">واحد</th>
                      <th className="text-right p-3 w-36">مقدار</th>
                      <th className="text-right p-3 w-20">درصد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedItems.map((item, idx) => {
                      const val = quantities[item.id] || 0;
                      const pct = totalWeight > 0 ? ((val / totalWeight) * 100).toFixed(1) : '0';
                      return (
                        <tr key={item.id} className={`border-b border-[var(--c-border)] ${val > 0 ? 'bg-green-50/50 dark:bg-green-900/10' : ''}`}>
                          <td className="p-3 text-[var(--c-muted-fg)]">{toPersianNum(idx + 1)}</td>
                          <td className="p-3 font-medium text-[var(--c-fg)]">{item.name}</td>
                          <td className="p-3 text-[var(--c-muted-fg)]">{item.unit}</td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={val || ''}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value) || 0;
                                setQuantities((p) => ({ ...p, [item.id]: v }));
                              }}
                              placeholder="0"
                              className="w-full px-2 py-1.5 rounded border border-[var(--c-border)] bg-[var(--c-card)] text-sm text-center"
                              dir="ltr"
                              step="0.1"
                            />
                          </td>
                          <td className="p-3 text-[var(--c-muted-fg)] text-center">
                            {val > 0 ? toPersianNum(pct) + '٪' : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-[var(--c-border)]">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-[var(--c-border)] text-[var(--c-fg)] hover:bg-[var(--c-muted)]">
            انصراف
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving || itemCount === 0}
            className="px-6 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'بروزرسانی' : 'ایجاد فرمول'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default FormulaManagementPage;
