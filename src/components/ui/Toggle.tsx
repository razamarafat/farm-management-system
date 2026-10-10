import React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const Toggle = ({
  checked,
  onChange,
  disabled = false,
  label,
  size = 'md',
  className,
}: ToggleProps) => {
  const isSm = size === 'sm';

  return (
    <button
      type="button"
      role="switch"
      dir="ltr"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'group relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-all duration-200 ease-in-out select-none border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--c-primary)]',
        isSm ? 'h-5 w-9 p-0.5' : 'h-7 w-12 p-1',
        checked
          ? 'bg-emerald-500 border-emerald-600 dark:bg-emerald-600 dark:border-emerald-500 shadow-sm'
          : 'bg-slate-300 border-slate-300 dark:bg-slate-700 dark:border-slate-600 hover:bg-slate-350 dark:hover:bg-slate-650',
        disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
        className
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-flex transform items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out',
          isSm ? 'h-4 w-4' : 'h-5 w-5',
          isSm
            ? checked ? 'translate-x-4' : 'translate-x-0'
            : checked ? 'translate-x-5' : 'translate-x-0'
        )}
      >
        {checked ? (
          <Check
            size={isSm ? 10 : 13}
            strokeWidth={3}
            className="text-emerald-600"
          />
        ) : (
          <X
            size={isSm ? 9 : 12}
            strokeWidth={2.5}
            className="text-slate-400"
          />
        )}
      </span>
    </button>
  );
};

export default Toggle;
