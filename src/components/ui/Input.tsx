import * as React from "react";
import { cn } from "@/utils/cn";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, label, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[var(--c-fg)] mb-1.5">
            {label}
          </label>
        )}
        <input
          type={type}
          className={cn(
            /* Base — rounded-lg (10px), clean border, subtle focus ring */
            "flex h-11 w-full rounded-[10px] border-2 border-[var(--c-input)]",
            "bg-[var(--c-card)] px-3.5 py-2.5 text-sm",
            "text-[var(--c-fg)] placeholder:text-[var(--c-muted-fg)]",
            "ring-offset-[var(--c-bg)]",
            "transition-all duration-200 ease-out",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium",
            /* Focus */
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-ring)] focus-visible:ring-offset-2 focus-visible:border-[var(--c-primary)]",
            /* Disabled */
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--c-muted)]",
            /* Error */
            error && "border-[var(--c-destructive)] focus-visible:ring-[var(--c-destructive)] focus-visible:border-[var(--c-destructive)]",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-xs text-[var(--c-destructive)] font-medium">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
