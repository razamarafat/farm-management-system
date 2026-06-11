import { cn } from "@/utils/cn";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[10px] bg-[var(--c-muted)]",
        "animate-[shimmer_2s_ease-in-out_infinite]",
        "bg-[length:200%_100%]",
        "bg-gradient-to-r from-[var(--c-muted)] via-[var(--c-border)] to-[var(--c-muted)]",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
