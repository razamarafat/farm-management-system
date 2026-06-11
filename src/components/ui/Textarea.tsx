import * as React from 'react';
import { cn } from '@/utils/cn';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[var(--c-fg)] mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={cn(
            'w-full rounded-[10px] border-2 border-[var(--c-input)] bg-[var(--c-card)] px-3.5 py-2.5 text-sm',
            'text-[var(--c-fg)] placeholder:text-[var(--c-muted-fg)]',
            'transition-all duration-200 ease-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-ring)] focus-visible:ring-offset-2 focus-visible:border-[var(--c-primary)]',
            'resize-none',
            error && 'border-[var(--c-destructive)] focus-visible:ring-[var(--c-destructive)]',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-xs text-[var(--c-destructive)] font-medium">{error}</p>
        )}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
