import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BUILD_ID } from '@/lib/buildInfo';
import { fetchRemoteBuildId } from '@/lib/versionCheck';
import { restorePreReloadState, savePreReloadState } from '@/lib/updateState';

const CHANNEL_NAME = 'morvarid-deploys';
const BROADCAST_EVENT = 'new-version';

function toPositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Passive fallback poll: long interval, only used if the Realtime push is
// missed (channel dropped, reconnect raced, or the deploy-side broadcast was
// never fired). Overridable for tests via VITE_UPDATE_POLL_MS.
const POLL_MS = toPositiveInt(import.meta.env.VITE_UPDATE_POLL_MS, 150_000);
// Banner countdown before the automatic reload.
const COUNTDOWN_MS = toPositiveInt(import.meta.env.VITE_UPDATE_COUNTDOWN_MS, 5_000);
const COUNTDOWN_SECONDS = Math.max(1, Math.ceil(COUNTDOWN_MS / 1000));

function hasUsableSupabaseUrl(): boolean {
  return /^https?:\/\//.test(import.meta.env.VITE_SUPABASE_URL ?? '');
}

export function AppUpdater() {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const triggeredRef = useRef(false);

  useEffect(() => {
    // Restore route + scroll saved before a previous update-reload.
    restorePreReloadState();

    if (!BUILD_ID) return;

    const trigger = () => {
      if (triggeredRef.current) return;
      triggeredRef.current = true;
      savePreReloadState();
      setSecondsLeft(COUNTDOWN_SECONDS);
    };

    const checkNow = async () => {
      const remote = await fetchRemoteBuildId();
      if (remote && remote !== BUILD_ID) trigger();
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Primary: Supabase Realtime broadcast. The deploy step publishes a
    // "new-version" message. On receipt we re-fetch version.json (so an early
    // broadcast that races the publish is a harmless no-op) and only reload
    // once the server actually reports a different build.
    if (hasUsableSupabaseUrl()) {
      try {
        channel = supabase
          .channel(CHANNEL_NAME)
          .on('broadcast', { event: BROADCAST_EVENT }, () => {
            void checkNow();
          })
          .subscribe((status) => {
            // Covers missed broadcasts while disconnected / after a reconnect.
            if (status === 'SUBSCRIBED') void checkNow();
          });
      } catch {
        // Realtime unavailable — polling below still covers us.
      }
    }

    // Fallback: passive polling with a long interval.
    const pollTimer = window.setInterval(() => {
      void checkNow();
    }, POLL_MS);

    return () => {
      void channel?.unsubscribe();
      window.clearInterval(pollTimer);
    };
  }, []);

  // Countdown → automatic reload (no click required).
  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      window.location.reload();
      return;
    }
    const t = window.setTimeout(() => setSecondsLeft((s) => (s ?? 1) - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft]);

  if (secondsLeft === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] w-max max-w-[92vw] rounded-xl border border-[color-mix(in_srgb,var(--c-fg)_14%,transparent)] bg-[var(--c-bg)] px-5 py-3 text-sm text-[var(--c-fg)] shadow-[0_10px_40px_rgba(0,0,0,0.25)] flex items-center gap-3"
    >
      <span className="font-medium">
        نسخه جدیدی منتشر شد — برنامه تا چند ثانیه دیگر به‌روزرسانی می‌شود.
      </span>
      <span className="tabular-nums whitespace-nowrap text-[var(--c-muted-fg)]">
        {secondsLeft} ثانیه
      </span>
    </div>
  );
}
