import { useEffect, useCallback, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { LogOut, User, Warehouse, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { supabase } from '@/lib/supabase';

export const Sidebar = () => {
  const { sidebarOpen, toggleSidebar } = useUIStore(
    useShallow((state) => ({
      sidebarOpen: state.sidebarOpen,
      toggleSidebar: state.toggleSidebar,
    }))
  );
  const { profile, logout } = useAuthStore(
    useShallow((state) => ({
      profile: state.profile,
      logout: state.logout,
    }))
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [farmName, setFarmName] = useState('');
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

  useEffect(() => {
    let cancelled = false;

    async function loadFarmName() {
      if (!profile?.farm_id) {
        setFarmName('');
        return;
      }

      setFarmName('در حال دریافت نام فارم');
      const { data, error } = await supabase
        .from('farms')
        .select('name')
        .eq('id', profile.farm_id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('Error loading sidebar farm name:', error);
        setFarmName('فارم قابل شناسایی نیست');
        return;
      }

      setFarmName(data?.name || 'فارم قابل شناسایی نیست');
    }

    loadFarmName();
    return () => {
      cancelled = true;
    };
  }, [profile?.farm_id]);

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
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-[fadeIn_200ms_ease-out]"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        ref={sidebarRef}
        className={`
          fixed top-0 bottom-0 right-0 z-50
          w-[85vw] sm:w-[288px]
          border-l border-[var(--c-border)]
          flex flex-col
          shadow-[var(--modal-shadow)]
          transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        style={{ backgroundColor: 'var(--c-card)' }}
      >
        {/* Header with close button */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-[var(--c-border)] shrink-0">
          <span className="text-sm font-bold text-[var(--c-fg)]">منوی کاربری</span>
          <button
            onClick={closeSidebar}
            className="w-9 h-9 rounded-[10px] flex items-center justify-center transition-all duration-150 hover:bg-[var(--c-muted)] text-[var(--c-muted-fg)] hover:text-[var(--c-fg)] hover:scale-105 active:scale-95"
            aria-label="بستن منو"
          >
            <X size={18} />
          </button>
        </div>

        {/* User info */}
        <div className="px-5 py-6 border-b border-[var(--c-border)] flex flex-col items-center gap-3 shrink-0">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-[0_4px_12px_rgba(37,99,235,0.15)]"
            style={{
              background: 'linear-gradient(135deg, var(--c-primary), var(--c-secondary))',
              color: 'white',
            }}
          >
            <User size={28} />
          </div>
          <div className="text-center">
            <h3 className="font-bold text-base text-[var(--c-fg)]">
              {profile?.first_name} {profile?.last_name || profile?.username}
            </h3>
            <div className="flex items-center justify-center gap-2 mt-2">
              <Badge variant={getRoleBadgeVariant(profile?.role)}>
                {getRoleLabel(profile?.role)}
              </Badge>
            </div>
            {profile?.farm_id && (
              <div className="flex items-center justify-center gap-1 mt-2 text-sm text-[var(--c-muted-fg)]">
                <Warehouse size={14} />
                <span>{farmName || 'در حال دریافت نام فارم'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Nav area */}
        <div className="flex-1 p-4 overflow-y-auto">
          <nav className="space-y-1">
            <div className="text-center text-sm mt-4 text-[var(--c-muted-fg)]">
              فهرست دسترسی‌ها
            </div>
          </nav>
        </div>

        {/* Logout */}
        <div className="p-4 border-t border-[var(--c-border)] shrink-0">
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
    </>
  );
};
