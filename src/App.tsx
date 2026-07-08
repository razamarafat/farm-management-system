import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/router';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

export function App() {
  const { initialize, checkSessionExpiry } = useAuthStore(
    useShallow((state) => ({
      initialize: state.initialize,
      checkSessionExpiry: state.checkSessionExpiry,
    }))
  );

  // Initialize theme
  useTheme();

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
    </ErrorBoundary>
  );
}
