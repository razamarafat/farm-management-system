// ============================================================================
// "Remember Me" aware storage & credentials persistence.
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
// In accordance with standard enterprise software principles:
//   1. When "Remember Me" is enabled, the user's username/identifier is
//      remembered and pre-filled on subsequent visits to the login screen.
//   2. Session tokens survive browser restarts and do not prematurely expire
//      on short idle timers.
//   3. When "Remember Me" is unchecked, stored usernames are removed and
//      sessions are strictly tab/session-scoped.
// ============================================================================

/** localStorage key holding the user's last "Remember Me" preference. */
export const REMEMBER_ME_STORAGE_KEY = 'morvarid.auth.remember-me';

/** localStorage key holding the user's remembered login username. */
export const SAVED_USERNAME_STORAGE_KEY = 'morvarid.auth.saved-username';

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

/** Reads the persisted "Remember Me" preference (defaults to true if a username was remembered, otherwise false). */
export function getRememberMe(): boolean {
  const storage = readLocalStorage();
  if (!storage) return false;
  try {
    const pref = storage.getItem(REMEMBER_ME_STORAGE_KEY);
    if (pref === 'true') return true;
    if (pref === 'false') return false;
    // Default to true if a saved username exists
    return Boolean(storage.getItem(SAVED_USERNAME_STORAGE_KEY));
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
    if (!remember) {
      storage.removeItem(SAVED_USERNAME_STORAGE_KEY);
    }
  } catch {
    // Ignore: storage unavailable (private mode / disabled).
  }
}

/** Reads the remembered username, if any. */
export function getSavedUsername(): string {
  const storage = readLocalStorage();
  if (!storage) return '';
  try {
    return storage.getItem(SAVED_USERNAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Persists or removes the remembered username based on "Remember Me" status. */
export function setSavedUsername(username: string | null): void {
  const storage = readLocalStorage();
  if (!storage) return;
  try {
    if (username && username.trim()) {
      storage.setItem(SAVED_USERNAME_STORAGE_KEY, username.trim());
    } else {
      storage.removeItem(SAVED_USERNAME_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors.
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
 * - getItem    reads from the active backend, with a fallback to the inactive
 *              backend if the active one has no value (prevents session drop
 *              if flags race initialization).
 * - setItem    writes to the active backend and clears any stale copy from the
 *              inactive one.
 * - removeItem clears BOTH backends (logout must wipe the session wherever it was).
 */
export const rememberMeStorage: AuthStorage = {
  getItem(key) {
    try {
      const active = activeStorage();
      const val = active.getItem(key);
      if (val !== null) return val;
      // Fallback check in case the session exists in the other storage
      const inactive = inactiveStorage();
      return inactive?.getItem(key) ?? null;
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
