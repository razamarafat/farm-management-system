import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/router';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';

export function App() {
  const { initialize, checkSessionExpiry } = useAuthStore();

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

  return <RouterProvider router={router} />;
}
