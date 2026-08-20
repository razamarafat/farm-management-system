import { useEffect, useState } from 'react';
import {
  checkConnectivity,
  isOnline,
  markOffline,
  onConnectivityChange,
} from '@/lib/connectivity';

/**
 * React binding for the shared real-connectivity state (see lib/connectivity).
 *
 * Returns 'online' | 'offline' | 'unknown'. Re-probes on an interval (paused
 * while the tab is hidden), on the browser 'online' event (verified, since a
 * link-up does not guarantee connectivity), and on visibilitychange. The
 * browser 'offline' event is trusted immediately without a probe.
 */

export type ConnectivityStatus = 'online' | 'offline' | 'unknown';

export function useConnectivity(intervalMs = 15000): ConnectivityStatus {
  const [status, setStatus] = useState<ConnectivityStatus>(() => {
    const o = isOnline();
    return o ? 'online' : 'offline';
  });

  useEffect(() => {
    const run = async () => {
      setStatus((await checkConnectivity()) ? 'online' : 'offline');
    };

    const unsubscribe = onConnectivityChange((online) => {
      setStatus(online ? 'online' : 'offline');
    });
    void run();

    const interval = window.setInterval(() => {
      if (!document.hidden) void run();
    }, intervalMs);
    const onOnline = () => void run();
    const onOffline = () => markOffline();
    const onVisibility = () => {
      if (!document.hidden) void run();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);

  return status;
}
