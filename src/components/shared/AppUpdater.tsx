import { useEffect, useRef, useState, useCallback } from 'react';
import { RefreshCw, Sparkles, Clock, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { BUILD_ID } from '@/lib/buildInfo';
import { fetchRemoteBuildId } from '@/lib/versionCheck';
import { restorePreReloadState, savePreReloadState } from '@/lib/updateState';
import { toPersianDigits } from '@/utils/persianNumbers';

const CHANNEL_NAME = 'morvarid-deploys';
const BROADCAST_EVENT = 'new-version';

function toPositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Active background polling interval: default 25 seconds for fast detection after deploy.
const POLL_MS = toPositiveInt(import.meta.env.VITE_UPDATE_POLL_MS, 25_000);
// Banner countdown before the automatic reload.
const COUNTDOWN_MS = toPositiveInt(import.meta.env.VITE_UPDATE_COUNTDOWN_MS, 6_000);
const COUNTDOWN_SECONDS = Math.max(1, Math.ceil(COUNTDOWN_MS / 1000));

function hasUsableSupabaseUrl(): boolean {
  return /^https?:\/\//.test(import.meta.env.VITE_SUPABASE_URL ?? '');
}

export function AppUpdater() {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [remoteId, setRemoteId] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const triggeredRef = useRef(false);

  const executeReload = useCallback(() => {
    savePreReloadState();
    // Cache-busting reload: append timestamp and version parameter to force
    // browser to bypass disk/memory cache and pull fresh singlefile bundle.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('_v', remoteId || Date.now().toString());
      url.searchParams.set('_t', Date.now().toString());
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  }, [remoteId]);

  useEffect(() => {
    // Restore route + scroll saved before a previous update-reload.
    restorePreReloadState();

    if (!BUILD_ID) return;

    const trigger = (newBuildId: string) => {
      if (triggeredRef.current) return;
      triggeredRef.current = true;
      setRemoteId(newBuildId);
      savePreReloadState();
      setSecondsLeft(COUNTDOWN_SECONDS);
    };

    const checkNow = async () => {
      if (triggeredRef.current) return;
      const remote = await fetchRemoteBuildId();
      if (remote && remote !== BUILD_ID) {
        trigger(remote);
      }
    };

    // 1. Initial check on mount
    void checkNow();

    // 2. Realtime broadcast channel
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (hasUsableSupabaseUrl()) {
      try {
        channel = supabase
          .channel(CHANNEL_NAME)
          .on('broadcast', { event: BROADCAST_EVENT }, () => {
            void checkNow();
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') void checkNow();
          });
      } catch {
        // Realtime unavailable — polling & event listeners still cover us.
      }
    }

    // 3. Fast passive polling
    const pollTimer = window.setInterval(() => {
      void checkNow();
    }, POLL_MS);

    // 4. Instant trigger on Tab Visibility Change (user switches back to tab)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkNow();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // 5. Instant trigger on Window Focus
    const onWindowFocus = () => {
      void checkNow();
    };
    window.addEventListener('focus', onWindowFocus);

    // 6. Instant trigger on Network Online
    const onOnline = () => {
      void checkNow();
    };
    window.addEventListener('online', onOnline);

    // 7. Instant trigger on Route / Hash Change
    const onHashChange = () => {
      void checkNow();
    };
    window.addEventListener('hashchange', onHashChange);

    return () => {
      void channel?.unsubscribe();
      window.clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onWindowFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (secondsLeft === null || isDismissed) return;
    if (secondsLeft <= 0) {
      executeReload();
      return;
    }
    const t = window.setTimeout(() => setSecondsLeft((s) => (s ?? 1) - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft, isDismissed, executeReload]);

  // Handle temporary dismiss (postpone reload for 60 seconds)
  const handlePostpone = () => {
    setIsDismissed(true);
    // After 60 seconds, re-prompt the user
    window.setTimeout(() => {
      setIsDismissed(false);
      setSecondsLeft(COUNTDOWN_SECONDS);
    }, 60_000);
  };

  if (secondsLeft === null || isDismissed) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] w-[95vw] max-w-lg rounded-2xl border border-emerald-500/30 bg-[var(--c-card)] p-4 text-[var(--c-fg)] shadow-[0_15px_50px_rgba(0,0,0,0.3)] backdrop-blur-md transition-all duration-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
            <Sparkles size={20} className="animate-pulse" />
          </div>
          <div>
            <div className="font-bold text-sm text-[var(--c-fg)] flex items-center gap-1.5">
              <span>نسخه جدید سامانه منتشر شد</span>
            </div>
            <p className="text-xs text-[var(--c-muted-fg)] mt-0.5 leading-relaxed">
              تغییرات جدید با موفقیت اعمال شده است. برنامه تا{' '}
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {toPersianDigits(secondsLeft)} ثانیه
              </span>{' '}
              دیگر خودکار به‌روزرسانی می‌شود.
            </p>
          </div>
        </div>

        <button
          onClick={handlePostpone}
          className="text-[var(--c-muted-fg)] hover:text-[var(--c-fg)] p-1 rounded-lg transition-colors"
          title="بعداً"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex items-center justify-end gap-2.5 mt-3 pt-3 border-t border-[var(--c-border)]">
        <button
          onClick={handlePostpone}
          className="px-3 py-1.5 text-xs text-[var(--c-muted-fg)] hover:text-[var(--c-fg)] rounded-lg transition-colors flex items-center gap-1"
        >
          <Clock size={13} />
          <span>یک دقیقه بعد</span>
        </button>

        <button
          onClick={executeReload}
          className="px-4 py-1.5 text-xs font-semibold bg-[var(--c-primary)] text-[var(--c-primary-fg)] rounded-xl shadow-sm hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5"
        >
          <RefreshCw size={13} className="animate-spin" />
          <span>به‌روزرسانی فوری</span>
        </button>
      </div>
    </div>
  );
}

export default AppUpdater;
