import * as React from 'react';
import { cn } from '@/utils/cn';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className, children, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[var(--c-fg)] mb-1.5">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={cn(
            'h-11 w-full rounded-[10px] border-2 border-[var(--c-input)]',
            'bg-[var(--c-card)] px-3.5 text-sm text-[var(--c-fg)]',
            'transition-all duration-200 ease-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-ring)] focus-visible:ring-offset-2 focus-visible:border-[var(--c-primary)]',
            'appearance-none cursor-pointer',
            error && 'border-[var(--c-destructive)] focus-visible:ring-[var(--c-destructive)]',
            className
          )}
          {...props}
        >
          {children}
        </select>
        {error && (
          <p className="mt-1.5 text-xs text-[var(--c-destructive)] font-medium">{error}</p>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';
