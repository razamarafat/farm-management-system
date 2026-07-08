import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Wheat,
  Plus,
  Search,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Save,
  Package,
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
import { INPUT_CATEGORY_LABELS, INPUT_CATEGORY_COLORS, DEFAULT_UNITS } from '@/types/input.types';

export default function InputsPage() {
  const [filters, setFilters] = useState<InputFilters>({
    search: '',
    category: 'all',
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

  const openCreateModal = () => {
    setEditingInput(null);
    setFormData({
      name: '',
      category: 'feed',
      default_unit: 'کیلوگرم',
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
      toast.error('لطفاً نام نهاده را وارد کنید');
      return;
    }

    let success = false;

    if (editingInput) {
      success = await updateInput(editingInput.id, formData);
    } else {
      success = await createInput(formData);
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
    // useToggleInputStatus returns the new is_active flag from the RPC
    // so the page no longer needs to pass the prior value.
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
          <h1 className="text-2xl font-bold text-[var(--c-fg)]">تعریف نهاده‌ها</h1>
          <p className="text-sm text-[var(--c-muted-fg)] mt-1">
            مدیریت نهاده‌های خوراک دام و اقلام مصرفی — تعریف و ویرایش نهاده‌های پایه سیستم
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4 ml-2" />
          نهاده جدید
        </Button>
      </div>

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
                  placeholder="جستجو در نام نهاده..."
                  className="pr-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {/* Status filter */}
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
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
                  }`}
              >
                فعال
              </button>
              <button
                onClick={() => setFilters({ ...filters, status: 'inactive' })}
                className={`px-3 py-2 rounded-[10px] text-sm font-medium transition-colors ${filters.status === 'inactive'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                  }`}
              >
                غیرفعال
              </button>
            </div>
            {/* Category filter */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilters({ ...filters, category: 'all' })}
                className={`px-3 py-2 rounded-[10px] text-sm font-medium transition-colors ${filters.category === 'all'
                  ? 'bg-[var(--c-primary)] text-white'
                  : 'bg-[var(--c-muted)] text-[var(--c-muted-fg)] hover:bg-[var(--c-border)]'
                  }`}
              >
                همه دسته‌ها
              </button>
              <button
                onClick={() => setFilters({ ...filters, category: 'feed' })}
                className={`px-3 py-2 rounded-[10px] text-sm font-medium transition-colors ${filters.category === 'feed'
                  ? 'bg-green-600 text-white'
                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                  }`}
              >
                نهاده
              </button>
              <button
                onClick={() => setFilters({ ...filters, category: 'packaging' })}
                className={`px-3 py-2 rounded-[10px] text-sm font-medium transition-colors ${filters.category === 'packaging'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50'
                  }`}
              >
                بسته‌بندی
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inputs List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner className="w-8 h-8" />
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-[var(--c-destructive)] mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={refetch}>
                تلاش مجدد
              </Button>
            </div>
          ) : inputs.length === 0 ? (
            <div className="text-center py-16">
              <Wheat className="w-16 h-16 mx-auto text-[var(--c-muted-fg)] mb-4" />
              <p className="text-[var(--c-muted-fg)] text-lg mb-2">هیچ نهاده‌ای یافت نشد</p>
              <p className="text-sm text-[var(--c-muted-fg)] mb-6">
                {filters.search || filters.category !== 'all' || filters.status !== 'all'
                  ? 'با فیلترهای انتخاب شده نتیجه‌ای یافت نشد'
                  : 'هنوز هیچ نهاده‌ای تعریف نشده است. اولین نهاده را اضافه کنید.'}
              </p>
              {!filters.search && filters.category === 'all' && filters.status === 'all' && (
                <Button onClick={openCreateModal} variant="outline">
                  <Plus className="w-4 h-4 ml-2" />
                  افزودن اولین نهاده
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--c-muted)] border-b border-[var(--c-border)]">
                  <tr>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">ردیف</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">نام نهاده</th>
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
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
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
                              <ToggleRight className="w-5 h-5 text-emerald-600" />
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
                            <Edit2 className="w-4 h-4 text-blue-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(input)}
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
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
          {toPersianNumbers(inputs.length)} نهاده یافت شد
        </div>
      )}

      {/* ─── Create/Edit Modal ─── */}
      <Modal
        isOpen={showFormModal}
        onClose={() => setShowFormModal(false)}
        title={editingInput ? 'ویرایش نهاده' : 'نهاده جدید'}
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
              نام نهاده <span className="text-[var(--c-destructive)]">*</span>
            </label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="مثال: ذرت، سویا، گندم..."
              autoFocus
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-[var(--c-fg)] mb-1.5">دسته‌بندی</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, category: 'feed' })}
                className={`flex-1 py-2.5 rounded-[10px] text-sm font-medium transition-all duration-200 border-2 ${
                  formData.category === 'feed'
                    ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 dark:border-green-600'
                    : 'border-[var(--c-border)] text-[var(--c-muted-fg)] hover:border-green-300'
                }`}
              >
                <Wheat className="w-4 h-4 inline-block ml-1" />
                نهاده
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, category: 'packaging' })}
                className={`flex-1 py-2.5 rounded-[10px] text-sm font-medium transition-all duration-200 border-2 ${
                  formData.category === 'packaging'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-600'
                    : 'border-[var(--c-border)] text-[var(--c-muted-fg)] hover:border-blue-300'
                }`}
              >
                <Package className="w-4 h-4 inline-block ml-1" />
                بسته‌بندی
              </button>
            </div>
          </div>

          {/* Default Unit */}
          <div>
            <label className="block text-sm font-medium text-[var(--c-fg)] mb-1.5">واحد پیش‌فرض</label>
            <select
              value={formData.default_unit}
              onChange={(e) => setFormData({ ...formData, default_unit: e.target.value })}
              className="w-full h-11 rounded-[10px] border-2 border-[var(--c-input)] bg-[var(--c-card)] px-3.5 text-sm text-[var(--c-fg)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-ring)] focus-visible:ring-offset-2 focus-visible:border-[var(--c-primary)] appearance-none cursor-pointer"
            >
              {DEFAULT_UNITS.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[var(--c-fg)] mb-1.5">توضیحات</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="توضیحات اختیاری درباره این نهاده..."
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
                  formData.is_active ? 'bg-emerald-500' : 'bg-[var(--c-muted)]'
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
        title="حذف نهاده"
        message={
          deletingInput
            ? `آیا از حذف "${deletingInput.name}" اطمینان دارید؟ این عمل قابل بازگشت نیست.`
            : 'آیا از حذف این نهاده اطمینان دارید؟'
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
