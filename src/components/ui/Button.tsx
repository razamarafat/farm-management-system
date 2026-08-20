import * as React from "react";
import { Loader2 } from "lucide-react";
import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/utils/cn";

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof HTMLMotionProps<"button">>,
    HTMLMotionProps<"button"> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  isLoading?: boolean;
  isFilled?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "default", isLoading, isFilled, children, disabled, ...props }, ref) => {
    const isDisabled = isLoading || disabled;

    return (
      <motion.button
        ref={ref}
        disabled={isDisabled}
        whileHover={isDisabled ? undefined : { scale: 1.015, translateY: -1 }}
        whileTap={isDisabled ? undefined : { scale: 0.985, translateY: 0 }}
        transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          /* Base — 10px radius, smooth transitions, focus ring */
          "relative inline-flex items-center justify-center rounded-[10px] font-medium overflow-hidden select-none",
          "transition-all duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--c-bg)]",
          "disabled:opacity-50 disabled:pointer-events-none disabled:transform-none",
          /* Variants */
          {
            /* Primary — sage forest green, subtle shadow, hover brightness */
            "bg-[var(--c-primary)] text-[var(--c-primary-fg)] shadow-[0_2px_8px_color-mix(in_srgb,var(--c-primary)_25%,transparent)] hover:shadow-[0_4px_16px_color-mix(in_srgb,var(--c-primary)_35%,transparent)] hover:brightness-105":
              variant === "primary" && !isFilled,
            "bg-[var(--c-primary)] text-[var(--c-primary-fg)] shadow-[0_0_20px_color-mix(in_srgb,var(--c-primary)_45%,transparent)] hover:shadow-[0_0_25px_color-mix(in_srgb,var(--c-primary)_60%,transparent)] brightness-110":
              variant === "primary" && isFilled,
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
        {isLoading && (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
            className="ml-2 rtl:ml-0 rtl:mr-2"
          >
            <Loader2 className="h-4 w-4" />
          </motion.div>
        )}
        <span className="inline-flex items-center gap-2">{children as React.ReactNode}</span>
      </motion.button>
    );
  }
);
Button.displayName = "Button";

export { Button };
