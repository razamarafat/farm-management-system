import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/router';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

export function App() {
  const { initialize, checkSessionExpiry } = useAuthStore();

  // Initialize theme
  useTheme();

  useEffect(() => {
    initialize();
    // Seed admin user on first run only
    const seeded = localStorage.getItem('admin_seeded');
    if (!seeded) {
      import('@/utils/seedAdmin').then((m) => {
        m.seedAdmin().then(() => {
          localStorage.setItem('admin_seeded', 'true');
        });
      });
    }
  }, [initialize]);

  // Check session expiry every minute for non-admin users
  useEffect(() => {
    const interval = setInterval(() => {
      checkSessionExpiry();
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [checkSessionExpiry]);

  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
