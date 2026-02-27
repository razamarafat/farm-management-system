import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { ProfileWithFarm, ROLE_COLORS, ROLE_LABELS } from '@/types/user.types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useDeleteUser } from '@/hooks/useUsers';
import { formatUserFullName } from '@/utils/userHelpers';

interface UserDeleteDialogProps {
  user: ProfileWithFarm;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const UserDeleteDialog = ({ user, isOpen, onClose, onSuccess }: UserDeleteDialogProps) => {
  const [mode, setMode] = useState<'soft' | 'hard'>('soft');
  const [confirmText, setConfirmText] = useState('');
  const { isDeleting, deleteUser } = useDeleteUser();

  const fullName = formatUserFullName(user.first_name, user.last_name);
  const roleColor = ROLE_COLORS[user.role];

  const handleConfirm = async () => {
    try {
      await deleteUser(user.id, mode);
      toast.success(mode === 'soft' ? 'کاربر غیرفعال شد' : 'کاربر حذف شد');
      onSuccess();
    } catch {
      toast.error('خطا در حذف کاربر');
    }
  };

  const isHardAllowed = mode === 'hard' ? confirmText.trim() === user.username : true;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="حذف کاربر"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isDeleting}>انصراف</Button>
          <Button variant="destructive" onClick={handleConfirm} isLoading={isDeleting} disabled={!isHardAllowed}>
            حذف کاربر
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center dark:bg-amber-900/30 dark:text-amber-400">
            <AlertTriangle size={20} />
          </div>
          <div className="text-sm">آیا از حذف کاربر {fullName} اطمینان دارید؟</div>
        </div>

        <div className="rounded-lg border border-border p-3 text-sm space-y-2">
          <div>نام: {fullName}</div>
          <div>نام کاربری: {user.username}</div>
          <div>
            نقش: <span className={`text-xs px-2 py-1 rounded-full ${roleColor.bg} ${roleColor.text}`}>{ROLE_LABELS[user.role]}</span>
          </div>
          <div>فارم: {user.farm?.name ?? '—'}</div>
        </div>

        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" checked={mode === 'soft'} onChange={() => setMode('soft')} />
            <span>
              <div className="font-medium">غیرفعال‌سازی</div>
              <div className="text-xs text-muted-foreground">کاربر نمیتواند وارد شود اما اطلاعات حفظ میشود</div>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" checked={mode === 'hard'} onChange={() => setMode('hard')} />
            <span>
              <div className="font-medium">حذف کامل</div>
              <div className="text-xs text-muted-foreground">حذف دائمی کاربر و تمام اطلاعات مرتبط</div>
              <div className="text-xs text-destructive mt-1">این عمل غیرقابل بازگشت است</div>
            </span>
          </label>
        </div>

        {mode === 'hard' && (
          <Input
            label="برای تایید، نام کاربری را تایپ کنید"
            placeholder="نام کاربری"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
        )}
      </div>
    </Modal>
  );
};
