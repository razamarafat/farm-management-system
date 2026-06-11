import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  isLoading?: boolean;
  variant?: 'primary' | 'destructive';
}

export const ConfirmDialog = ({
  isOpen,
  onClose,
  title,
  message,
  confirmLabel = 'تایید',
  cancelLabel = 'انصراف',
  onConfirm,
  isLoading,
  variant = 'primary',
}: ConfirmDialogProps) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} isLoading={isLoading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-[var(--c-muted-fg)] leading-relaxed">{message}</p>
    </Modal>
  );
};
