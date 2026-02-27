import * as React from 'react';
import { cn } from '@/utils/cn';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = ({ label, className, ...props }: CheckboxProps) => {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className={cn('h-4 w-4 rounded border-border text-primary focus:ring-primary', className)}
        {...props}
      />
      {label && <span>{label}</span>}
    </label>
  );
};
