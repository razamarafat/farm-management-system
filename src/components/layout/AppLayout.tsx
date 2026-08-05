import { Outlet } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { Toaster } from '@/components/ui/Toast';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export const AppLayout = () => {
  const isOnline = useOnlineStatus();

  return (
    <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-fg)] transition-colors duration-300">
      <Header />
      <Sidebar />
      {/* Main content area */}
      <main className="pt-16 min-h-screen">
        <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          <Outlet />
        </div>
      </main>
      <Toaster />
      <OfflineBanner
        isOnline={isOnline}
        pendingCount={0}
        isSyncing={false}
        onSync={() => {}}
      />
    </div>
  );
};
