import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '@/store/uiStore';

export function useTheme() {
  const { theme, setTheme } = useUIStore(
    useShallow((state) => ({
      theme: state.theme,
      setTheme: state.setTheme,
    }))
  );

  useEffect(() => {
    const root = window.document.documentElement;
    const applyTheme = (next: 'light' | 'dark') => {
      root.classList.remove('light', 'dark');
      root.classList.add(next);
    };

    if (theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(media.matches ? 'dark' : 'light');
      const listener = (event: MediaQueryListEvent) => applyTheme(event.matches ? 'dark' : 'light');
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }

    applyTheme(theme);
    return undefined;
  }, [theme]);

  return { theme, setTheme };
}
