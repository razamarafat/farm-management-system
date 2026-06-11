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
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-[fadeIn_200ms_ease-out]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'w-[92vw] max-w-[520px] rounded-2xl bg-[var(--c-card)] text-[var(--c-fg)]',
          'shadow-[var(--modal-shadow)] border border-[var(--c-border)]',
          'flex flex-col max-h-[88vh]',
          'animate-[scaleIn_250ms_ease-out]',
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)]">
            <h3 className="text-lg font-bold">{title}</h3>
            <button
              onClick={onClose}
              className="h-9 w-9 flex items-center justify-center rounded-[10px] hover:bg-[var(--c-muted)] transition-colors duration-200 text-[var(--c-muted-fg)] hover:text-[var(--c-fg)]"
              aria-label="بستن"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="px-5 py-5 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-[var(--c-border)] flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
