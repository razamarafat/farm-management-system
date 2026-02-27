import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export const Modal = ({ isOpen, onClose, title, children, footer, className }: ModalProps) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'w-[90vw] max-w-[520px] rounded-xl bg-card text-foreground shadow-lg border border-border flex flex-col max-h-[90vh] animate-[scaleIn_200ms_ease-out]',
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="text-lg font-bold">{title}</h3>
            <button
              onClick={onClose}
              className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
              aria-label="بستن"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-4 overflow-y-auto">{children}</div>
        {footer && <div className="p-4 border-t border-border">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};
