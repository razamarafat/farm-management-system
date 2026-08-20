import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/router';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { useOfflineBootstrap } from '@/hooks/useOfflineBootstrap';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { AppUpdater } from '@/components/shared/AppUpdater';

export function App() {
  const { initialize, checkSessionExpiry } = useAuthStore(
    useShallow((state) => ({
      initialize: state.initialize,
      checkSessionExpiry: state.checkSessionExpiry,
    }))
  );

  // Initialize theme
  useTheme();

  // Warm the offline RxDB cache as soon as a session is authenticated
  // (fresh login or restored session). Background, non-blocking, idempotent.
  useOfflineBootstrap();

  useEffect(() => {
    initialize();
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
      <AppUpdater />
    </ErrorBoundary>
  );
}
