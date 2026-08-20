import type { ReactNode } from 'react';
import { Wifi, WifiOff, Loader } from 'lucide-react';
import { useConnectivity, type ConnectivityStatus } from '@/hooks/useConnectivity';

/**
 * Small top-bar icon showing the REAL connectivity state (active probe,
 * not navigator.onLine alone — see useConnectivity).
 *
 *   - online:  green wifi icon
 *   - offline: amber wifi-off icon (work continues locally in the
 *              offline layer; sync resumes when the connection returns)
 *   - unknown: gray spinner (initial probe in flight)
 */
export const ConnectivityIcon = () => {
  const status: ConnectivityStatus = useConnectivity();

  const config: Record<
    ConnectivityStatus,
    { icon: ReactNode; className: string; title: string }
  > = {
    online: {
      icon: <Wifi size={16} />,
      className: 'text-[var(--c-success,#16a34a)]',
      title: 'آنلاین — اتصال برقرار است',
    },
    offline: {
      icon: <WifiOff size={16} />,
      className: 'text-[var(--c-warning,#d97706)]',
      title: 'آفلاین — تغییرات به صورت محلی ذخیره می‌شوند و پس از بازگشت اتصال همگام می‌شوند',
    },
    unknown: {
      icon: <Loader size={16} className="animate-spin" />,
      className: 'text-[var(--c-muted-foreground,#6b7280)]',
      title: 'در حال بررسی اتصال…',
    },
  };

  const { icon, className, title } = config[status];

  return (
    <span
      className="flex items-center justify-center w-8 h-8 rounded-xl transition-colors duration-200 hover:bg-[var(--c-muted)]"
      title={title}
      role="img"
      aria-label={title}
    >
      <span className={className}>{icon}</span>
    </span>
  );
};
