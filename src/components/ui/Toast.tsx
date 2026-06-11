import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      position="top-left"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[var(--c-card)] group-[.toaster]:text-[var(--c-fg)] group-[.toaster]:border-[var(--c-border)] group-[.toaster]:shadow-[var(--dropdown-shadow)] group-[.toaster]:rounded-xl",
          description: "group-[.toast]:text-[var(--c-muted-fg)]",
          actionButton:
            "group-[.toast]:bg-[var(--c-primary)] group-[.toast]:text-[var(--c-primary-fg)] group-[.toast]:rounded-[10px]",
          cancelButton:
            "group-[.toast]:bg-[var(--c-muted)] group-[.toast]:text-[var(--c-muted-fg)] group-[.toast]:rounded-[10px]",
          error: "group-[.toaster]:!text-[var(--c-destructive)]",
          success: "group-[.toaster]:!text-[var(--c-success)]",
          warning: "group-[.toaster]:!text-[var(--c-warning)]",
          info: "group-[.toaster]:!text-[var(--c-info)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
