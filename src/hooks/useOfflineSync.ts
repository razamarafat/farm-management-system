import { logger } from '@/utils/logger';
import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  initOfflineDB,
  addPendingChange,
  getPendingChanges,
  markAsSynced,
  deleteSyncedChange,
  isOnline,
  onConnectivityChange,
} from '@/lib/offlineStorage';

interface SyncState {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: Date | null;
}

interface RpcSaveResult {
  success: boolean;
  message: string;
}

export function useOfflineSync() {
  const [syncState, setSyncState] = useState<SyncState>({
    isOnline: isOnline(),
    pendingCount: 0,
    isSyncing: false,
    lastSyncAt: null,
  });

  const syncInProgressRef = useRef(false);
  const dbInitializedRef = useRef(false);

  // Initialize IndexedDB
  useEffect(() => {
    if (!dbInitializedRef.current) {
      initOfflineDB().then(() => {
        dbInitializedRef.current = true;
        updatePendingCount();
      });
    }
  }, []);

  // Listen for connectivity changes
  useEffect(() => {
    const unsubscribe = onConnectivityChange((online) => {
      setSyncState((prev) => ({ ...prev, isOnline: online }));
      
      if (online) {
        toast.info('اتصال برقرار شد. در حال همگام‌سازی...');
        syncPendingChanges();
      } else {
        toast.warning('اتصال قطع شد. تغییرات به صورت آفلاین ذخیره می‌شوند.');
      }
    });

    return unsubscribe;
  }, []);

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    const changes = await getPendingChanges();
    setSyncState((prev) => ({ ...prev, pendingCount: changes.length }));
  }, []);

  // Add change to offline queue
  const queueChange = useCallback(async (
    voucherId: string,
    lines: unknown[],
    type: 'save' | 'submit'
  ) => {
    await addPendingChange(voucherId, lines, type);
    await updatePendingCount();
  }, [updatePendingCount]);

  // Sync pending changes to server
  const syncPendingChanges = useCallback(async () => {
    if (syncInProgressRef.current || !isOnline()) {
      return;
    }

    syncInProgressRef.current = true;
    setSyncState((prev) => ({ ...prev, isSyncing: true }));

    try {
      const pendingChanges = await getPendingChanges();

      for (const change of pendingChanges) {
        try {
          if (change.type === 'save') {
            const { data: result, error } = await supabase
              .rpc('save_daily_sheet', {
                p_voucher_id: change.voucherId,
                p_lines: change.lines,
              } as unknown as undefined);

            if (error) {
              // Check if voucher is locked
              if (error.message.includes('VOUCHER_LOCKED')) {
                toast.error(`حواله قفل شده است و تغییرات آفلاین قابل اعمال نیست.`);
                await deleteSyncedChange(change.id);
                continue;
              }
              throw error;
            }

            const rpcResult = result as unknown as RpcSaveResult;
            if (rpcResult && rpcResult.success) {
              await markAsSynced(change.id);
              await deleteSyncedChange(change.id);
            }
          } else if (change.type === 'submit') {
            // For submit, just mark as synced since the full submit should be done online
            toast.warning('ثبت نهایی حواله نیاز به اتصال اینترنت دارد.');
            await deleteSyncedChange(change.id);
          }
        } catch (err) {
          logger.error('Failed to sync change:', change.id, err);
          // Don't delete failed changes, they'll be retried
        }
      }

      await updatePendingCount();
      setSyncState((prev) => ({ 
        ...prev, 
        lastSyncAt: new Date(),
      }));

      const remaining = await getPendingChanges();
      if (remaining.length === 0) {
        toast.success('همگام‌سازی با موفقیت انجام شد');
      }
    } catch (err) {
      logger.error('Sync failed:', err);
      toast.error('خطا در همگام‌سازی');
    } finally {
      syncInProgressRef.current = false;
      setSyncState((prev) => ({ ...prev, isSyncing: false }));
    }
  }, [updatePendingCount]);

  // Manual sync trigger
  const triggerSync = useCallback(() => {
    if (isOnline()) {
      syncPendingChanges();
    } else {
      toast.warning('اتصال اینترنت برقرار نیست');
    }
  }, [syncPendingChanges]);

  return {
    ...syncState,
    queueChange,
    triggerSync,
    updatePendingCount,
  };
}
