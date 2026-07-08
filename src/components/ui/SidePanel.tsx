// =====================================================================
// SidePanel
//
// Generic slide-in side panel for RTL layouts. Anchored to the LEFT edge
// because in an RTL reading flow the "end" of the page is the left.
//
// Pattern mirrors Modal.tsx:
//   - Portal to body
//   - Backdrop click + Escape close
//   - body scroll lock while open
//   - animates in / out via framer-motion (slide-in from x=-100%
//     → 0, fade backdrop).
// =====================================================================

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Tailwind width utility; default 'max-w-[560px]'. */
  widthClass?: string;
  /** Disable backdrop click to close. Default: false (backdrop closes). */
  disableBackdropClose?: boolean;
}

export const SidePanel = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  className,
  widthClass = 'max-w-[560px]',
  disableBackdropClose = false,
}: SidePanelProps) => {
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

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80]">
          {/* Backdrop */}
          <motion.div
            key="side-panel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
            onClick={() => {
              if (!disableBackdropClose) onClose();
            }}
          />

          {/* Panel — anchored LEFT (RTL flow end); slides IN from left */}
          <motion.div
            key="side-panel-content"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.26, ease: 'easeOut' }}
            className={cn(
              'absolute top-0 left-0 h-full w-full flex flex-col',
              'bg-[var(--c-card)] text-[var(--c-fg)]',
              'border-l border-[var(--c-border)] shadow-[var(--modal-shadow)]',
              widthClass,
              className,
            )}
            dir="rtl"
            role="dialog"
            aria-modal="true"
          >
            {(title || subtitle) && (
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--c-border)]">
                <div className="min-w-0">
                  {title && <h3 className="text-lg font-bold truncate">{title}</h3>}
                  {subtitle && (
                    <p className="text-xs text-[var(--c-muted-fg)] mt-0.5 truncate" dir="ltr">
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 w-9 flex items-center justify-center rounded-[10px] hover:bg-[var(--c-muted)] transition-colors duration-200 text-[var(--c-muted-fg)] hover:text-[var(--c-fg)] shrink-0"
                  aria-label="بستن"
                >
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="flex-1 px-5 py-4 overflow-y-auto">{children}</div>
            {footer && (
              <div className="px-5 py-4 border-t border-[var(--c-border)] flex items-center justify-end gap-3">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

SidePanel.displayName = 'SidePanel';
