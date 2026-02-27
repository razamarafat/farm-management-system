import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Farm } from '@/types/farm.types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useDeleteFarm } from '@/hooks/useFarms';

interface FarmDeleteDialogProps {
  farm: Farm;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const FarmDeleteDialog = ({ farm, isOpen, onClose, onSuccess }: FarmDeleteDialogProps) => {
  const [mode, setMode] = useState<'soft' | 'hard'>('soft');
  const [confirmText, setConfirmText] = useState('');
  const { isDeleting, deleteFarm } = useDeleteFarm();

  const handleConfirm = async () => {
    const ok = await deleteFarm(farm.id, mode === 'hard');
    if (ok) onSuccess();
  };

  const allowDelete = mode === 'hard' ? confirmText.trim() === farm.code : true;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="حذف فارم"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isDeleting}>انصراف</Button>
          <Button variant="destructive" onClick={handleConfirm} isLoading={isDeleting} disabled={!allowDelete}>
            حذف فارم
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center dark:bg-amber-900/30 dark:text-amber-400">
            <AlertTriangle size={20} />
          </div>
          <div className="text-sm">آیا از حذف فارم {farm.name} اطمینان دارید؟</div>
        </div>

        <div className="rounded-lg border border-border p-3 text-sm space-y-2">
          <div>نام فارم: {farm.name}</div>
          <div>کد فارم: {farm.code}</div>
          <div>وضعیت: {farm.is_active ? 'فعال' : 'غیرفعال'}</div>
        </div>

        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" checked={mode === 'soft'} onChange={() => setMode('soft')} />
            <span>
              <div className="font-medium">غیرفعال‌سازی</div>
              <div className="text-xs text-muted-foreground">فارم غیرفعال می‌شود اما اطلاعات حفظ خواهد شد</div>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" checked={mode === 'hard'} onChange={() => setMode('hard')} />
            <span>
              <div className="font-medium">حذف کامل</div>
              <div className="text-xs text-muted-foreground">حذف دائمی فارم و تمام ارتباطات</div>
              <div className="text-xs text-destructive mt-1">این عمل غیرقابل بازگشت است</div>
            </span>
          </label>
        </div>

        {mode === 'hard' && (
          <Input
            label="برای تایید، کد فارم را تایپ کنید"
            placeholder="کد فارم"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
        )}
      </div>
    </Modal>
  );
};
