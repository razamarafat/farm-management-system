import { Menu, Home } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { ThemeToggle } from './ThemeToggle';
import { DateTimeDisplay } from './DateTimeDisplay';

export const Header = () => {
  const { openSidebar } = useUIStore();
  const { profile } = useAuthStore();
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
      className="fixed top-0 right-0 left-0 z-40 flex items-center justify-between px-4 md:px-6"
      style={{
        height: '64px',
        background: 'var(--c-card)',
        borderBottom: '1px solid var(--c-border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {/* Right side (RTL start): Hamburger + Home button */}
      <div className="flex items-center gap-2">
        {/* Hamburger menu button */}
        <button
          onClick={openSidebar}
          className="flex items-center justify-center w-10 h-10 rounded-lg transition-colors"
          style={{ color: 'var(--c-fg)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-muted)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          title="منو"
        >
          <Menu size={20} />
        </button>

        {/* Home button - only visible when NOT on dashboard */}
        {!isOnDashboard && profile && (
          <button
            onClick={() => navigate(dashboardPath)}
            className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg transition-all text-sm font-medium"
            style={{
              background: 'var(--c-primary)',
              color: '#ffffff',
            }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.9)')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
            title="بازگشت به صفحه اصلی"
          >
            <Home size={16} />
            <span className="hidden sm:inline text-xs font-semibold">صفحه اصلی</span>
          </button>
        )}
      </div>

      {/* Center: App name */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <span
          className="text-base font-bold"
          style={{ color: 'var(--c-fg)' }}
        >
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
