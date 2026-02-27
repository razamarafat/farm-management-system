import { Menu, Home, ChevronLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { ThemeToggle } from './ThemeToggle';
import { DateTimeDisplay } from './DateTimeDisplay';

export const Header = () => {
  const { openSidebar, moduleReset } = useUIStore();
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

  // Determine menu root: e.g. /admin/consumption/feed -> /admin/consumption
  const getMenuRoot = (pathname: string) => {
    if (!profile) return null;
    const rolePath = `/${profile.role}`;
    if (!pathname.startsWith(rolePath + '/')) return null;
    const rest = pathname.slice(rolePath.length + 1); // remove '/admin/'
    if (!rest) return null;
    const firstSeg = rest.split('/')[0];
    if (!firstSeg) return null;
    return `${rolePath}/${firstSeg}`;
  };

  const menuRoot = getMenuRoot(location.pathname);

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
      {/* Right side (RTL start): Hamburger + Back-to-menu + Home button */}
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

        {/* Back-to-menu button: navigates to the menu root (e.g. /admin/inventory) */}
        {menuRoot && location.pathname !== menuRoot && (
          <button
            onClick={() => {
              // reset any module UI state if provided, then navigate to menu root
              try { if (moduleReset) moduleReset(); } catch {}
              navigate(menuRoot);
            }}
            className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg transition-all text-sm font-medium"
            style={{
              background: 'var(--c-secondary)',
              color: '#ffffff',
            }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.9)')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
            title="بازگشت به منوی اصلی"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline text-xs font-semibold">منوی اصلی</span>
          </button>
        )}

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

      {/* Center: Brand Identity (Text Only) */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
        <span
          className="text-2xl font-normal select-none"
          style={{
            fontFamily: "'Lalezar', cursive",
            color: 'var(--c-fg)',
            textShadow: '0 1px 2px rgba(0,0,0,0.1)'
          }}
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
