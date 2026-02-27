import { WifiOff, RefreshCw, CloudOff } from 'lucide-react';
import { Button } from './Button';
import { toPersianDigits } from '@/utils/persianNumbers';

interface OfflineBannerProps {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  onSync: () => void;
}

export function OfflineBanner({ isOnline, pendingCount, isSyncing, onSync }: OfflineBannerProps) {
  // Don't show if online and no pending changes
  if (isOnline && pendingCount === 0) {
    return null;
  }

  // Offline banner
  if (!isOnline) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-auto z-50">
        <div className="bg-yellow-500 text-white rounded-lg shadow-lg px-4 py-3 flex items-center gap-3">
          <WifiOff className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-sm">حالت آفلاین</p>
            {pendingCount > 0 && (
              <p className="text-xs opacity-90">
                {toPersianDigits(pendingCount)} تغییر در صف همگام‌سازی
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Pending changes banner (online but has unsynced changes)
  if (pendingCount > 0) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-auto z-50">
        <div className="bg-blue-500 text-white rounded-lg shadow-lg px-4 py-3 flex items-center gap-3">
          <CloudOff className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-sm">
              {toPersianDigits(pendingCount)} تغییر همگام نشده
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSync}
            disabled={isSyncing}
            className="text-white hover:bg-blue-600 p-2"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
