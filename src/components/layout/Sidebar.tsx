import { useEffect, useCallback, useRef, useState } from 'react';
import { LogOut, User, Warehouse, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export const Sidebar = () => {
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { profile, logout } = useAuthStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const navigate = useNavigate();
  const sidebarRef = useRef<HTMLDivElement>(null);

  const closeSidebar = useCallback(() => {
    if (sidebarOpen) {
      toggleSidebar();
    }
  }, [sidebarOpen, toggleSidebar]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSidebar();
    };
    if (sidebarOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [sidebarOpen, closeSidebar]);

  const handleLogout = async () => {
    setConfirmOpen(true);
  };

  const confirmLogout = async () => {
    setConfirmOpen(false);
    closeSidebar();
    await logout();
    navigate('/login');
  };

  const getRoleBadgeVariant = (role?: string) => {
    switch (role) {
      case 'admin': return 'destructive' as const;
      case 'supervisor': return 'info' as const;
      case 'operator': return 'success' as const;
      default: return 'secondary' as const;
    }
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'admin': return 'مدیر سیستم';
      case 'supervisor': return 'سرپرست';
      case 'operator': return 'اپراتور';
      default: return 'کاربر';
    }
  };

  return (
    <>
      {/* Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-[fadeIn_150ms_ease-out]"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        ref={sidebarRef}
        style={{
          backgroundColor: 'var(--c-card)',
          borderColor: 'var(--c-border)',
        }}
        className={`
          fixed top-0 bottom-0 right-0 z-50
          w-[85vw] sm:w-[280px]
          border-l
          flex flex-col
          shadow-2xl
          transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header with close button */}
        <div
          className="flex items-center justify-between px-4 h-14 border-b shrink-0"
          style={{ borderColor: 'var(--c-border)' }}
        >
          <span
            className="text-sm font-bold"
            style={{ color: 'var(--c-fg)' }}
          >
            منوی کاربری
          </span>
          <button
            onClick={closeSidebar}
            className="
              w-9 h-9 rounded-lg flex items-center justify-center
              transition-all duration-150
              hover:scale-105 active:scale-95
            "
            style={{
              color: 'var(--c-muted-fg)',
              backgroundColor: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--c-muted)';
              e.currentTarget.style.color = 'var(--c-fg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--c-muted-fg)';
            }}
            aria-label="بستن منو"
          >
            <X size={20} />
          </button>
        </div>

        {/* User info */}
        <div
          className="px-6 py-6 border-b flex flex-col items-center gap-3 shrink-0"
          style={{ borderColor: 'var(--c-border)' }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--c-primary) 15%, transparent)',
              color: 'var(--c-primary)',
            }}
          >
            <User size={30} />
          </div>
          <div className="text-center">
            <h3
              className="font-bold text-base"
              style={{ color: 'var(--c-fg)' }}
            >
              {profile?.first_name} {profile?.last_name || profile?.username}
            </h3>
            <div className="flex items-center justify-center gap-2 mt-2">
              <Badge variant={getRoleBadgeVariant(profile?.role)}>
                {getRoleLabel(profile?.role)}
              </Badge>
            </div>
            {profile?.farm_id && (
              <div
                className="flex items-center justify-center gap-1 mt-2 text-sm"
                style={{ color: 'var(--c-muted-fg)' }}
              >
                <Warehouse size={14} />
                <span>فارم نمونه</span>
              </div>
            )}
          </div>
        </div>

        {/* Nav area */}
        <div className="flex-1 p-4 overflow-y-auto">
          <nav className="space-y-1">
            <div
              className="text-center text-sm mt-4"
              style={{ color: 'var(--c-muted-fg)' }}
            >
              فهرست دسترسی‌ها
            </div>
          </nav>
        </div>

        {/* Logout */}
        <div
          className="p-4 border-t shrink-0"
          style={{ borderColor: 'var(--c-border)' }}
        >
          <Button
            variant="destructive"
            className="w-full gap-2 h-11"
            onClick={handleLogout}
          >
            <LogOut size={18} />
            خروج از حساب
          </Button>
        </div>
      </aside>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="خروج از حساب"
        message="آیا از خروج از حساب کاربری اطمینان دارید؟"
        confirmLabel="خروج"
        cancelLabel="انصراف"
        onConfirm={confirmLogout}
        variant="destructive"
      />

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
};
