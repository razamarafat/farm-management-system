import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Plus,
  Search,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Download,
} from 'lucide-react';
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier, useToggleSupplierStatus, useCheckSupplierUsage } from '@/hooks/useSuppliers';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';
import { toPersianNumbers } from '@/utils/persianNumbers';
import { exportSuppliersToExcel } from '@/utils/excelExportPro';
import type { Supplier, SupplierFilters, SupplierInsert } from '@/types/supplier.types';

export default function SuppliersPage() {
  const [filters, setFilters] = useState<SupplierFilters>({
    search: '',
    status: 'all',
  });

  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<SupplierInsert>({
    name: '',
    is_active: true,
  });
  const [isHardDelete, setIsHardDelete] = useState(false);
  const [usageWarning, setUsageWarning] = useState<{ hasUsage: boolean; count: number } | null>(null);

  const { suppliers, isLoading, refetch } = useSuppliers(filters);
  const { createSupplier, isCreating } = useCreateSupplier();
  const { updateSupplier, isUpdating } = useUpdateSupplier();
  const { deleteSupplier, isDeleting } = useDeleteSupplier();
  const { toggleStatus } = useToggleSupplierStatus();
  const { checkUsage } = useCheckSupplierUsage();

  const openCreateModal = () => {
    setEditingSupplier(null);
    setFormData({ name: '', is_active: true });
    setShowFormModal(true);
  };

  const openEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({ name: supplier.name, is_active: supplier.is_active });
    setShowFormModal(true);
  };

  const openDeleteDialog = async (supplier: Supplier, hard: boolean = false) => {
    setDeletingSupplier(supplier);
    setIsHardDelete(hard);

    if (hard) {
      const usage = await checkUsage(supplier.id);
      setUsageWarning(usage);
    } else {
      setUsageWarning(null);
    }

    setShowDeleteDialog(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('لطفاً نام تأمین‌کننده را وارد کنید');
      return;
    }

    let success = false;

    if (editingSupplier) {
      success = await updateSupplier(editingSupplier.id, formData);
    } else {
      success = await createSupplier(formData);
    }

    if (success) {
      setShowFormModal(false);
      refetch();
    }
  };

  const handleDelete = async () => {
    if (!deletingSupplier) return;

    const success = await deleteSupplier(deletingSupplier.id, isHardDelete);
    if (success) {
      setShowDeleteDialog(false);
      refetch();
    }
  };

  const handleToggleStatus = async (supplier: Supplier) => {
    await toggleStatus(supplier.id, supplier.is_active);
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
          <h1 className="text-2xl font-bold text-[var(--c-fg)]">مدیریت تأمین‌کنندگان</h1>
          <p className="text-sm text-[var(--c-muted-fg)] mt-1">
            ثبت و مدیریت تأمین‌کنندگان کالا
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4 ml-2" />
          تأمین‌کننده جدید
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
                  placeholder="جستجو در نام تأمین‌کننده..."
                  className="pr-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters({ ...filters, status: 'all' })}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filters.status === 'all'
                  ? 'bg-[var(--c-fg)] text-[var(--c-bg)]'
                  : 'bg-[var(--c-muted)] text-[var(--c-muted-fg)] hover:bg-[var(--c-border)]'
                  }`}
              >
                همه
              </button>
              <button
                onClick={() => setFilters({ ...filters, status: 'active' })}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filters.status === 'active'
                  ? 'bg-green-600 text-white'
                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                  }`}
              >
                فعال
              </button>
              <button
                onClick={() => setFilters({ ...filters, status: 'inactive' })}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filters.status === 'inactive'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                  }`}
              >
                غیرفعال
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suppliers List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="w-8 h-8" />
            </div>
          ) : suppliers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto text-[var(--c-muted-fg)] mb-3" />
              <p className="text-[var(--c-muted-fg)]">تأمین‌کننده‌ای یافت نشد</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--c-muted)] border-b border-[var(--c-border)]">
                  <tr>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">ردیف</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">نام تأمین‌کننده</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">وضعیت</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--c-muted-fg)]">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier, index) => (
                    <tr
                      key={supplier.id}
                      className="border-b border-[var(--c-border)] hover:bg-[var(--c-muted)] transition-colors"
                    >
                      <td className="py-3 px-4 text-center text-sm">{toPersianNumbers(index + 1)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-medium text-[var(--c-fg)]">{supplier.name}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge className={supplier.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}>
                          {supplier.is_active ? 'فعال' : 'غیرفعال'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleStatus(supplier)}
                            title={supplier.is_active ? 'غیرفعال کردن' : 'فعال کردن'}
                          >
                            {supplier.is_active ? (
                              <ToggleRight className="w-5 h-5 text-green-600" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-gray-400" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(supplier)}
                            title="ویرایش"
                          >
                            <Edit className="w-4 h-4 text-blue-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(supplier, false)}
                            title="حذف (غیرفعال)"
                            disabled={!supplier.is_active}
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

      {suppliers.length > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={async () => await exportSuppliersToExcel(suppliers, 'suppliers')}
            className="bg-green-600 hover:bg-green-700 text-white border-none"
            size="sm"
          >
            <Download className="w-4 h-4 ml-1" />
            خروجی اکسل
          </Button>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showFormModal}
        onClose={() => setShowFormModal(false)}
        title={editingSupplier ? 'ویرایش تأمین‌کننده' : 'تأمین‌کننده جدید'}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowFormModal(false)}>انصراف</Button>
            <Button onClick={handleSubmit} isLoading={isCreating || isUpdating}>
              {editingSupplier ? 'بروزرسانی' : 'ایجاد'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-[var(--c-fg)] mb-1 block">نام تأمین‌کننده *</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="نام شرکت یا تأمین‌کننده"
            />
          </div>
          {editingSupplier && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="is_active" className="text-sm text-[var(--c-fg)]">
                تأمین‌کننده فعال باشد
              </label>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title={isHardDelete ? 'حذف دائمی تأمین‌کننده' : 'غیرفعال کردن تأمین‌کننده'}
        message={
          isHardDelete
            ? (usageWarning?.hasUsage
              ? `این تأمین‌کننده دارای ${toPersianNumbers(usageWarning?.count || 0)} خرید ثبت شده است. آیا از حذف دائمی آن اطمینان دارید؟`
              : 'آیا از حذف دائمی این تأمین‌کننده اطمینان دارید؟'
            )
            : 'آیا می‌خواهید این تأمین‌کننده را غیرفعال کنید؟'
        }
        confirmLabel={isHardDelete ? 'حذف دائمی' : 'غیرفعال کردن'}
        cancelLabel="انصراف"
        onConfirm={handleDelete}
        variant={isHardDelete ? 'destructive' : 'primary'}
        isLoading={isDeleting}
      />
    </motion.div>
  );
}
