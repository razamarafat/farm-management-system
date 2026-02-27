import { useState } from 'react';
import { Copy, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { ProfileWithFarm } from '@/types/user.types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useResetPassword } from '@/hooks/useUsers';

interface UserPasswordResetProps {
  user: ProfileWithFarm;
  isOpen: boolean;
  onClose: () => void;
}

export const UserPasswordReset = ({ user, isOpen, onClose }: UserPasswordResetProps) => {
  const { isResetting, resetPassword } = useResetPassword();
  const [generated, setGenerated] = useState<string>('');
  const [customMode, setCustomMode] = useState(false);
  const [customPassword, setCustomPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleGenerate = async () => {
    const pass = await resetPassword(user.id);
    if (pass) {
      setGenerated(pass);
      toast.success('رمز عبور جدید تولید شد');
    }
  };

  const handleCopy = async () => {
    if (!generated) return;
    await navigator.clipboard.writeText(generated);
    toast.success('رمز عبور کپی شد');
  };

  const handleCustomSave = async () => {
    if (!customPassword || customPassword.length < 6) {
      toast.error('رمز عبور باید حداقل ۶ کاراکتر باشد');
      return;
    }
    if (customPassword !== confirmPassword) {
      toast.error('رمز عبور و تکرار آن یکسان نیستند');
      return;
    }

    const pass = await resetPassword(user.id, customPassword);
    if (pass) {
      toast.success('رمز عبور بروزرسانی شد');
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="بازنشانی رمز عبور"
      footer={
        <div className="flex items-center justify-end">
          <Button variant="ghost" onClick={onClose}>بستن</Button>
        </div>
      }
      className="max-w-[420px]"
    >
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          بازنشانی رمز عبور برای {user.first_name} {user.last_name}
        </div>

        <div className="rounded-lg border border-border p-3 space-y-3">
          <div className="text-sm font-semibold">تولید رمز عبور جدید</div>
          <Button onClick={handleGenerate} isLoading={isResetting} className="gap-2">
            <RefreshCcw size={16} /> تولید رمز عبور جدید
          </Button>
          {generated && (
            <div className="flex items-center gap-2">
              <Input value={generated} readOnly dir="ltr" />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                <Copy size={16} />
              </Button>
            </div>
          )}
          {generated && (
            <div className="text-xs text-muted-foreground">
              این رمز عبور را یادداشت کنید. پس از بستن نمایش داده نمیشود
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border p-3 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={customMode} onChange={(e) => setCustomMode(e.target.checked)} />
            تعیین رمز عبور دلخواه
          </label>
          {customMode && (
            <div className="space-y-3">
              <PasswordInput
                label="رمز عبور جدید"
                value={customPassword}
                onChange={(e) => setCustomPassword(e.target.value)}
                dir="ltr"
              />
              <PasswordInput
                label="تکرار رمز عبور"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                dir="ltr"
              />
              <Button onClick={handleCustomSave} isLoading={isResetting}>
                تغییر رمز عبور
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
