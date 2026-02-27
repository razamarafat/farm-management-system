import { Outlet } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { Toaster } from '@/components/ui/Toast';

export const AppLayout = () => {
  return (
    <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-fg)] transition-colors duration-300">
      <Header />
      <Sidebar />
      {/* Main content area - centered with proper max-width */}
      <main className="pt-16 md:pt-20 min-h-screen">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </div>
      </main>
      <Toaster />
    </div>
  );
};
