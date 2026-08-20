// Pre-reload state handoff for the auto-update flow.
//
// When a new version is detected we stash the user's current route + scroll
// position in sessionStorage, reload, and restore them on the next boot.
// sessionStorage survives a page reload but is cleared when the tab closes —
// exactly the lifetime we want for this handoff.
//
// IMPORTANT: this key is used ONLY for the update handoff. It must never read
// or write the auth/session keys managed by src/lib/auth-storage.ts (Supabase
// session tokens and the "remember me" flag). A page reload preserves both
// localStorage and sessionStorage, so auth survives the update untouched.

const KEY = 'morvarid.update-state';
const MAX_AGE_MS = 60_000;

interface PreReloadState {
  hash: string;
  scrollY: number;
  savedAt: number;
}

export function savePreReloadState(): void {
  try {
    const state: PreReloadState = {
      hash: window.location.hash,
      scrollY: window.scrollY,
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable — nothing to restore later, that's fine.
  }
}

export function restorePreReloadState(): void {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return;
    // Remove immediately so a double-mount (StrictMode) or a second reload
    // can never re-apply a stale handoff.
    window.sessionStorage.removeItem(KEY);

    const state = JSON.parse(raw) as Partial<PreReloadState> | null;
    if (!state || typeof state.savedAt !== 'number' || Date.now() - state.savedAt > MAX_AGE_MS) {
      return;
    }

    if (typeof state.hash === 'string' && state.hash && state.hash !== window.location.hash) {
      // Hash router: restoring the hash navigates back to the saved route.
      // ProtectedRoute shows its loading spinner until auth re-initializes,
      // so an authenticated user is never bounced to /login by this.
      window.location.hash = state.hash;
    }

    if (typeof state.scrollY === 'number' && state.scrollY > 0) {
      // Narrow once so the closure below keeps the `number` type.
      const scrollY = state.scrollY;
      // Wait for the (possibly lazy) route to mount before scrolling.
      requestAnimationFrame(() => {
        setTimeout(() => window.scrollTo(0, scrollY), 150);
      });
    }
  } catch {
    // Ignore malformed handoff state.
  }
}
