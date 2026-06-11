import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-200",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--c-primary)] text-[var(--c-primary-fg)]",
        secondary:
          "border-transparent bg-[var(--c-secondary)] text-[var(--c-secondary-fg)]",
        destructive:
          "border-transparent bg-[var(--c-destructive)] text-[var(--c-destructive-fg)]",
        outline:
          "border-[var(--c-border)] text-[var(--c-fg)] bg-transparent",
        success:
          "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
        warning:
          "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
        info:
          "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
        muted:
          "border-transparent bg-[var(--c-muted)] text-[var(--c-muted-fg)]",
        accent:
          "border-transparent bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
