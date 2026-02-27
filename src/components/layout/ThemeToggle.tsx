import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();

  const resolveNextTheme = () => {
    if (theme === 'dark') return 'light';
    if (theme === 'light') return 'dark';
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'light' : 'dark';
  };

  const handleToggle = () => {
    const next = resolveNextTheme();
    setTheme(next);
  };

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <Button variant="ghost" size="icon" onClick={handleToggle} title={isDark ? 'حالت روشن' : 'حالت تاریک'}>
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">تغییر تم</span>
    </Button>
  );
};
