import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Wheat,
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Save,
} from 'lucide-react';
import { useInputs, useCreateInput, useUpdateInput, useDeleteInput, useToggleInputStatus } from '@/hooks/useInputs';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';
import { toPersianNumbers } from '@/utils/persianNumbers';
import type { Input as InputType, InputInsert, InputFilters } from '@/types/input.types';
import { INPUT_CATEGORY_LABELS, INPUT_CATEGORY_COLORS, DEFAULT_UNITS, PACKAGING_UNITS } from '@/types/input.types';

type TabId = 'feed' | 'packaging';

const TAB_CONFIG: { id: TabId; label: string; icon: typeof Wheat; colorClass: string }[] = [
  { id: 'feed', label: 'نهاده‌ها', icon: Wheat, colorClass: 'sage' },
  { id: 'packaging', label: 'اقلام بسته‌بندی', icon: Package, colorClass: 'sky' },
];

function getUnitsForTab(tab: TabId): readonly string[] {
  return tab === 'packaging' ? PACKAGING_UNITS : DEFAULT_UNITS;
}

function getDefaultUnitForTab(tab: TabId): string {
  return tab === 'packaging' ? 'عدد' : 'کیلوگرم';
}

const ENTITY_LABEL: Record<TabId, string> = {
  feed: 'نهاده',
  packaging: 'قلم بسته‌بندی',
};

export default function InputsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('feed');

  const [filters, setFilters] = useState<InputFilters>({
    search: '',
    category: 'feed',
    status: 'all',
  });

  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingInput, setEditingInput] = useState<InputType | null>(null);
  const [deletingInput, setDeletingInput] = useState<InputType | null>(null);
  const [formData, setFormData] = useState<InputInsert>({
    name: '',
    category: 'feed',
    default_unit: 'کیلوگرم',
    description: '',
    is_active: true,
  });

  const { inputs, isLoading, error, refetch } = useInputs(filters);
  const { isCreating, createInput } = useCreateInput();
  const { isUpdating, updateInput } = useUpdateInput();
  const { isDeleting, deleteInput } = useDeleteInput();
  const { toggleStatus } = useToggleInputStatus();

  const isSubmitting = isCreating || isUpdating;
  const entityLabel = ENTITY_LABEL[activeTab];
  const availableUnits = getUnitsForTab(activeTab);

  const switchTab = (tab: TabId) => {
    setActiveTab(tab);
    setFilters((prev) => ({ ...prev, category: tab }));
  };

  const openCreateModal = () => {
    setEditingInput(null);
    setFormData({
      name: '',
      category: activeTab,
      default_unit: getDefaultUnitForTab(activeTab),
      description: '',
      is_active: true,
    });
    setShowFormModal(true);
  };

  const openEditModal = (input: InputType) => {
    setEditingInput(input);
    setFormData({
      name: input.name,
      category: input.category,
      default_unit: input.default_unit,
      description: input.description,
      is_active: input.is_active,
    });
    setShowFormModal(true);
  };

  const openDeleteDialog = (input: InputType) => {
    setDeletingInput(input);
    setShowDeleteDialog(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error(`لطفاً نام ${entityLabel} را وارد کنید`);
      return;
    }

    let success = false;

    if (editingInput) {
      success = await updateInput(editingInput.id, formData);
    } else {
      success = await createInput({ ...formData, category: activeTab });
    }

    if (success) {
      setShowFormModal(false);
      refetch();
    }
  };

  const handleDelete = async () => {
    if (!deletingInput) return;

    const success = await deleteInput(deletingInput.id);
    if (success) {
      setShowDeleteDialog(false);
      refetch();
    }
  };

  const handleToggleStatus = async (input: InputType) => {
    await toggleStatus(input.id);
    refetch();
  };

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
          <h1 className="text-2xl font-bold text-[var(--c-fg)]">تعریف نهاده‌ها و اقلام بسته‌بندی</h1>
          <p className="text-sm text-[var(--c-muted-fg)] mt-1">
            مدیریت نهاده‌های خوراک دام و اقلام بسته‌بندی — تعریف و ویرایش آیتم‌های پایه سیستم
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4 ml-2" />
          {`${entityLabel} جدید`}
        </Button>
      </div>

      {/* Tab Bar */}
      <Card>
        <CardContent className="p-0">
          <div className="flex" role="tablist">
            {TAB_CONFIG.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => switchTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-all duration-200 relative
                    ${isActive
                      ? 'text-[var(--c-fg)]'
                      : 'text-[var(--c-muted-fg)] hover:text-[var(--c-fg)] hover:bg-[var(--c-muted)]'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {isActive && (
                    <motion.div
                      layoutId="tab-indicator"
                      className={`absolute bottom-0 left-4 right-4 h-0.5 rounded-full
                        ${tab.id === 'feed' ? 'bg-[var(--c-success)]' : 'bg-[var(--c-info)]'}`}
                      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-muted-fg)]" />
                <Input
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  placeholder={`جستجو در نام ${entityLabel}...`}
                  className="pr-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters({ ...filters, status: 'all' })}
                className={`px-3 py-2 rounded-[10px] text-sm font-medium transition-colors ${filters.status === 'all'
                  ? 'bg-[var(--c-fg)] text-[var(--c-bg)]'
                  : 'bg-[var(--c-muted)] text-[var(--c-muted-fg)] hover:bg-[var(--c-border)]'
                  }`}
              >
                همه
              </button>
              <button
                onClick={() => setFilters({ ...filters, status: 'active' })}
                className={`px-3 py-2 rounded-[10px] text-sm font-medium transition-colors ${filters.status === 'active'
                  ? 'bg-[var(--c-success)] text-[var(--c-primary-fg)]'
                  : 'bg-[color-mix(in_srgb,var(--c-success)_16%,transparent)] text-[var(--c-success)] hover:bg-[color-mix(in_srgb,var(--c-success)_30%,transparent)]'
                  }`}
              >
                فعال
              </button>
              <button
                onClick={() => setFilters({ ...filters, status: 'inactive' })}
                className={`px-3 py-2 rounded-[10px] text-sm font-medium transition-colors ${filters.status === 'inactive'
                  ? 'bg-[var(--c-destructive)] text-[var(--c-destructive-fg)]'
                  : 'bg-[color-mix(in_srgb,var(--c-destructive)_16%,transparent)] text-[var(--c-error)] hover:bg-[color-mix(in_srgb,var(--c-destructive)_30%,transparent)]'
                  }`}
              >
                غیرفعال
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner className="w-8 h-8" />
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-[var(--c-error)] mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={refetch}>
                تلاش مجدد
              </Button>
            </div>
          ) : inputs.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 text-[var(--c-muted-fg)]">
                {activeTab === 'feed' ? (
                  <Wheat className="w-16 h-16" />
                ) : (
                  <Package className="w-16 h-16" />
                )}
              </div>
              <p className="text-[var(--c-muted-fg)] text-lg mb-2">
                {`هیچ ${entityLabel}ای یافت نشد`}
              </p>
              <p className="text-sm text-[var(--c-muted-fg)] mb-6">
                {filters.search || filters.status !== 'all'
                  ? 'با فیلترهای انتخاب شده نتیجه‌ای یافت نشد'
                  : `هنوز هیچ ${entityLabel}ای تعریف نشده است. اولین ${entityLabel} را اضافه کنید.`}
              </p>
              {!filters.search && filters.status === 'all' && (
                <Button onClick={openCreateModal} variant="outline">
                  <Plus className="w-4 h-4 ml-2" />
                  {`افزودن اولین ${entityLabel}`}
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--c-muted)] border-b border-[var(--c-border)]">
                  <tr>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">ردیف</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">
                      {activeTab === 'feed' ? 'نام نهاده' : 'نام قلم بسته‌بندی'}
                    </th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">دسته‌بندی</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">واحد پیش‌فرض</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">توضیحات</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">وضعیت</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {inputs.map((input, index) => (
                    <tr
                      key={input.id}
                      className={`border-b border-[var(--c-border)] hover:bg-[var(--c-muted)] transition-colors ${!input.is_active ? 'opacity-60' : ''}`}
                    >
                      <td className="py-3 px-4 text-center text-sm text-[var(--c-muted-fg)]">
                        {toPersianNumbers(index + 1)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-medium text-[var(--c-fg)]">{input.name}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge className={INPUT_CATEGORY_COLORS[input.category]}>
                          {INPUT_CATEGORY_LABELS[input.category]}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center text-sm text-[var(--c-muted-fg)]">
                        {input.default_unit}
                      </td>
                      <td className="py-3 px-4 text-center text-sm text-[var(--c-muted-fg)] max-w-[200px] truncate">
                        {input.description || '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge className={input.is_active
                          ? 'bg-[color-mix(in_srgb,var(--c-success)_16%,transparent)] text-[var(--c-success)]'
                          : 'bg-[color-mix(in_srgb,var(--c-destructive)_16%,transparent)] text-[var(--c-error)]'
                        }>
                          {input.is_active ? 'فعال' : 'غیرفعال'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleStatus(input)}
                            title={input.is_active ? 'غیرفعال کردن' : 'فعال کردن'}
                          >
                            {input.is_active ? (
                              <ToggleRight className="w-5 h-5 text-[var(--c-success)]" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-[var(--c-muted-fg)]" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(input)}
                            title="ویرایش"
                          >
                            <Edit2 className="w-4 h-4 text-[var(--c-info)]" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(input)}
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4 text-[var(--c-error)]" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results count */}
      {!isLoading && inputs.length > 0 && (
        <div className="text-center text-sm text-[var(--c-muted-fg)]">
          {toPersianNumbers(inputs.length)} {entityLabel} یافت شد
        </div>
      )}

      {/* ─── Create/Edit Modal ─── */}
      <Modal
        isOpen={showFormModal}
        onClose={() => setShowFormModal(false)}
        title={editingInput ? `ویرایش ${entityLabel}` : `${entityLabel} جدید`}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowFormModal(false)} disabled={isSubmitting}>
              انصراف
            </Button>
            <Button onClick={handleSubmit} isLoading={isSubmitting}>
              <Save className="w-4 h-4 ml-2" />
              {editingInput ? 'بروزرسانی' : 'ذخیره'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-[var(--c-fg)] mb-1.5">
              {`نام ${entityLabel}`} <span className="text-[var(--c-error)]">*</span>
            </label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={
                activeTab === 'feed' ? 'مثال: ذرت، سویا، گندم...' : 'مثال: کارتن، کیسه، شانه...'
              }
              autoFocus
            />
          </div>

          {/* Unit */}
          <div>
            <label className="block text-sm font-medium text-[var(--c-fg)] mb-1.5">واحد پیش‌فرض</label>
            <select
              value={
                availableUnits.includes(formData.default_unit ?? '')
                  ? formData.default_unit
                  : availableUnits[0]
              }
              onChange={(e) => setFormData({ ...formData, default_unit: e.target.value })}
              className="w-full h-11 rounded-[10px] border-2 border-[var(--c-input)] bg-[var(--c-card)] px-3.5 text-sm text-[var(--c-fg)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-ring)] focus-visible:ring-offset-2 focus-visible:border-[var(--c-primary)] appearance-none cursor-pointer"
            >
              {availableUnits.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
            {activeTab === 'packaging' && (
              <p className="text-xs text-[var(--c-muted-fg)] mt-1.5">
                اقلام بسته‌بندی فقط از واحدهای شمارشی (عددی) استفاده می‌کنند
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[var(--c-fg)] mb-1.5">توضیحات</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={`توضیحات اختیاری درباره این ${entityLabel}...`}
              rows={3}
              className="w-full rounded-[10px] border-2 border-[var(--c-input)] bg-[var(--c-card)] px-3.5 py-2.5 text-sm text-[var(--c-fg)] placeholder:text-[var(--c-muted-fg)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-ring)] focus-visible:ring-offset-2 focus-visible:border-[var(--c-primary)] resize-none"
            />
          </div>

          {/* Status (edit only) */}
          {editingInput && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-[var(--c-fg)]">وضعیت:</span>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 ${
                  formData.is_active ? 'bg-[var(--c-success)]' : 'bg-[var(--c-muted)]'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    formData.is_active ? 'translate-x-[calc(3rem-1.55rem)]' : 'translate-x-[0.15rem]'
                  }`}
                />
              </button>
              <span className="text-sm text-[var(--c-muted-fg)]">
                {formData.is_active ? 'فعال' : 'غیرفعال'}
              </span>
            </div>
          )}
        </div>
      </Modal>

      {/* ─── Delete Confirmation Dialog ─── */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title={`حذف ${entityLabel}`}
        message={
          deletingInput
            ? `آیا از حذف "${deletingInput.name}" اطمینان دارید؟ این عمل قابل بازگشت نیست.`
            : `آیا از حذف این ${entityLabel} اطمینان دارید؟`
        }
        confirmLabel="حذف"
        cancelLabel="انصراف"
        onConfirm={handleDelete}
        variant="destructive"
        isLoading={isDeleting}
      />
    </motion.div>
  );
}
