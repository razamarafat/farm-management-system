import * as React from "react";
import { Toaster as Sonner } from "sonner";
import { useUIStore } from "@/store/uiStore";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Resolve the app's class-based theme to 'light' | 'dark' so sonner's
 * `data-sonner-theme` (which drives description/close-button colors) follows
 * the app instead of the OS. Mirrors the resolution done in `useTheme`.
 */
function useResolvedTheme(): "light" | "dark" {
  const theme = useUIStore((state) => state.theme);
  const [resolved, setResolved] = React.useState<"light" | "dark">(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
  );

  React.useEffect(() => {
    if (theme !== "system") {
      setResolved(theme);
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setResolved(media.matches ? "dark" : "light");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);

  return resolved;
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useResolvedTheme();

  return (
    <Sonner
      theme={theme}
      position="top-right"
      className="toaster group"
      style={
        {
          // Sonner v2 hardcodes its light/dark surfaces via
          // `[data-sonner-theme]` CSS variables, which beat utility classes.
          // Override them with the app's semantic tokens so the toast surface,
          // text and border follow class-based dark mode (`--c-*` flips on
          // `.dark`) instead of sonner's pure #fff/#000 defaults.
          "--normal-bg": "var(--c-card)",
          "--normal-text": "var(--c-fg)",
          "--normal-border": "var(--c-border)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-xl group-[.toaster]:shadow-[var(--dropdown-shadow)]",
          actionButton:
            "group-[.toast]:bg-[var(--c-primary)] group-[.toast]:text-[var(--c-primary-fg)] group-[.toast]:rounded-[10px]",
          cancelButton:
            "group-[.toast]:bg-[var(--c-muted)] group-[.toast]:text-[var(--text-secondary)] group-[.toast]:rounded-[10px]",
          /* Accent the icon only (not the text) so the message stays at
             high-contrast foreground while the variant keeps its color. */
          success: "[&_[data-icon]]:text-[var(--c-success)]",
          error: "[&_[data-icon]]:text-[var(--c-error)]",
          warning: "[&_[data-icon]]:text-[var(--c-warning)]",
          info: "[&_[data-icon]]:text-[var(--c-info)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
