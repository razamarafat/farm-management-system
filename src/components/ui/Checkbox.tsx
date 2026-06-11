import * as React from 'react';
import { cn } from '@/utils/cn';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = ({ label, className, ...props }: CheckboxProps) => {
  return (
    <label className="inline-flex items-center gap-2.5 text-sm cursor-pointer">
      <input
        type="checkbox"
        className={cn(
          'h-4 w-4 rounded-[5px] border-2 border-[var(--c-border)]',
          'text-[var(--c-primary)] focus:ring-2 focus:ring-[var(--c-ring)] focus:ring-offset-1',
          'cursor-pointer transition-colors duration-150',
          className
        )}
        {...props}
      />
      {label && <span className="text-[var(--c-fg)]">{label}</span>}
    </label>
  );
};
