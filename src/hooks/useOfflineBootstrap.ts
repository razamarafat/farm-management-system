import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { warmOfflineDb } from '@/lib/offline/bootstrap';

/**
 * Warms the offline RxDB cache once the user is authenticated (Gap 1).
 *
 * `isAuthenticated` becomes true both on a fresh login (setUser) and on a
 * restored/remembered session during `initialize()`, so this single effect
 * covers both paths. The warm runs in the background and never blocks the
 * authenticated UI; RxDB is code-split behind a dynamic import and the warm
 * is idempotent.
 */
export function useOfflineBootstrap(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      void warmOfflineDb();
    }
  }, [isAuthenticated]);
}
