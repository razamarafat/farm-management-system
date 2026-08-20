// ============================================================================
// "Remember Me" aware storage.
//
// The Supabase auth session (and the zustand auth cache) are routed through
// this adapter so their persistence backend is decided by the user's "Remember
// Me" choice at login time:
//
//   - Remember me checked   -> localStorage (survives full browser/app restarts
//                              until the user explicitly logs out)
//   - Remember me unchecked -> sessionStorage (cleared when the tab/browser is
//                              closed)
//
// The choice itself is *always* stored in localStorage under a dedicated key,
// so the correct backend can be resolved BEFORE the first session read on app
// startup (auth-js calls getItem lazily, but the flag must already be there).
// ============================================================================

/** localStorage key holding the user's last "Remember Me" preference. */
export const REMEMBER_ME_STORAGE_KEY = 'morvarid.auth.remember-me';

/**
 * Minimal storage surface shared by Supabase's `SupportedStorage` and zustand's
 * `StateStorage` — both are just getItem/setItem/removeItem.
 */
export interface AuthStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

// In-memory fallback for non-browser contexts (SSR/tests) or when the real
// backends throw (private mode, storage disabled).
const memoryStore = new Map<string, string>();
const memoryStorage: AuthStorage = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, value) => {
    memoryStore.set(key, value);
  },
  removeItem: (key) => {
    memoryStore.delete(key);
  },
};

function readLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Reads the persisted "Remember Me" preference (defaults to session-only). */
export function getRememberMe(): boolean {
  const storage = readLocalStorage();
  if (!storage) return false;
  try {
    return storage.getItem(REMEMBER_ME_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Persists the user's "Remember Me" choice. MUST be called before sign-in so
 * the Supabase client writes the session to the correct backend.
 */
export function setRememberMe(remember: boolean): void {
  const storage = readLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(REMEMBER_ME_STORAGE_KEY, remember ? 'true' : 'false');
  } catch {
    // Ignore: storage unavailable (private mode / disabled). The session-only
    // fallback still applies for the current tab.
  }
}

function activeStorage(): AuthStorage {
  const target = getRememberMe() ? readLocalStorage() : readSessionStorage();
  return target ?? memoryStorage;
}

function inactiveStorage(): AuthStorage | null {
  return getRememberMe() ? readSessionStorage() : readLocalStorage();
}

/**
 * Storage adapter for both the Supabase client and zustand persist.
 *
 * - getItem    reads from the backend selected by the current "Remember Me" flag
 * - setItem    writes to the active backend and clears any stale copy from the
 *              inactive one (so a token/cache never lingers where it doesn't belong)
 * - removeItem clears BOTH backends (logout must wipe the session wherever it was)
 */
export const rememberMeStorage: AuthStorage = {
  getItem(key) {
    try {
      return activeStorage().getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      activeStorage().setItem(key, value);
      inactiveStorage()?.removeItem(key);
    } catch {
      // Ignore storage errors.
    }
  },
  removeItem(key) {
    try {
      readLocalStorage()?.removeItem(key);
    } catch {
      // ignore
    }
    try {
      readSessionStorage()?.removeItem(key);
    } catch {
      // ignore
    }
    memoryStorage.removeItem(key);
  },
};
