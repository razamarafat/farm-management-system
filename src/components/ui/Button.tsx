import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "default", isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={isLoading || disabled}
        className={cn(
          /* Base — rounded-lg (10px border-radius), smooth transitions, focus ring */
          "inline-flex items-center justify-center rounded-[10px] font-medium",
          "transition-all duration-200 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--c-bg)]",
          "disabled:opacity-50 disabled:pointer-events-none",
          "active:scale-[0.97]",
          /* Variants */
          {
            /* Primary — BluBank blue, subtle shadow, hover brightness */
            "bg-[var(--c-primary)] text-[var(--c-primary-fg)] shadow-[0_2px_8px_color-mix(in_srgb,var(--c-primary)_25%,transparent)] hover:shadow-[0_4px_16px_color-mix(in_srgb,var(--c-primary)_35%,transparent)] hover:brightness-105":
              variant === "primary",
            /* Secondary — deep navy */
            "bg-[var(--c-secondary)] text-[var(--c-secondary-fg)] hover:brightness-110":
              variant === "secondary",
            /* Outline — clean border, hover fills with primary tint */
            "border-2 border-[var(--c-border)] bg-transparent text-[var(--c-fg)] hover:bg-[var(--c-primary-light)] hover:border-[var(--c-primary)] hover:text-[var(--c-primary)]":
              variant === "outline",
            /* Ghost — no border, subtle hover */
            "text-[var(--c-fg)] hover:bg-[var(--c-muted)]":
              variant === "ghost",
            /* Destructive */
            "bg-[var(--c-destructive)] text-[var(--c-destructive-fg)] shadow-[0_2px_8px_color-mix(in_srgb,var(--c-destructive)_20%,transparent)] hover:shadow-[0_4px_16px_color-mix(in_srgb,var(--c-destructive)_30%,transparent)] hover:brightness-105":
              variant === "destructive",
            /* Sizes */
            "h-11 px-5 text-sm": size === "default",
            "h-9 px-3.5 text-xs rounded-[8px]": size === "sm",
            "h-12 px-8 text-base rounded-[12px]": size === "lg",
            "h-11 w-11": size === "icon",
          },
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
