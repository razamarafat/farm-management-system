import { Menu, Home } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { ThemeToggle } from './ThemeToggle';
import { DateTimeDisplay } from './DateTimeDisplay';

export const Header = () => {
  const openSidebar = useUIStore((state) => state.openSidebar);
  const profile = useAuthStore((state) => state.profile);
  const location = useLocation();
  const navigate = useNavigate();

  const getDashboardPath = () => {
    if (!profile) return '/';
    switch (profile.role) {
      case 'admin': return '/admin';
      case 'supervisor': return '/supervisor';
      case 'operator': return '/operator';
      default: return '/';
    }
  };

  const dashboardPath = getDashboardPath();
  const isOnDashboard = location.pathname === dashboardPath;

  return (
    <header
      className="fixed top-0 right-0 left-0 z-40 flex items-center justify-between px-4 md:px-6 h-16"
      style={{
        background: 'var(--header-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--header-border)',
      }}
    >
      {/* Right side (RTL start): Hamburger + Home button */}
      <div className="flex items-center gap-2">
        <button
          onClick={openSidebar}
          className="flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 hover:bg-[var(--c-muted)] text-[var(--c-fg)]"
          title="منو"
        >
          <Menu size={20} />
        </button>

        {!isOnDashboard && profile && (
          <button
            onClick={() => navigate(dashboardPath)}
            className="flex items-center justify-center gap-1.5 h-9 px-4 rounded-[10px] transition-all duration-200 text-sm font-semibold bg-[var(--c-primary)] text-white shadow-[0_2px_8px_color-mix(in_srgb,var(--c-primary)_25%,transparent)] hover:shadow-[0_4px_16px_color-mix(in_srgb,var(--c-primary)_35%,transparent)] hover:brightness-105 active:scale-[0.97]"
            title="بازگشت به صفحه اصلی"
          >
            <Home size={16} />
            <span className="hidden sm:inline text-xs">صفحه اصلی</span>
          </button>
        )}
      </div>

      {/* Center: App name */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <span className="text-base font-bold text-[var(--c-fg)] tracking-tight">
          مروارید فارم
        </span>
      </div>

      {/* Left side (RTL end): DateTime + Theme toggle */}
      <div className="flex items-center gap-2">
        <DateTimeDisplay />
        <ThemeToggle />
      </div>
    </header>
  );
};
