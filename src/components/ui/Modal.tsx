import { useEffect, useId, useRef } from 'react';
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
  disableBackdropClose?: boolean;
}

export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className,
  disableBackdropClose = false,
}: ModalProps) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousOverflow = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow.current ?? '';
      previousOverflow.current = null;
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) panelRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[fadeIn_200ms_ease-out]"
      onClick={(e) => {
        if (!disableBackdropClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
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
            <h3 id={titleId} className="text-lg font-bold">{title}</h3>
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
