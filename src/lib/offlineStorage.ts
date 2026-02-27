/**
 * Offline Storage using IndexedDB
 * Handles offline queue for daily sheet changes
 */

const DB_NAME = 'morvarid_farm_offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending_changes';

interface PendingChange {
  id: string;
  voucherId: string;
  lines: unknown[];
  timestamp: number;
  type: 'save' | 'submit';
  synced: boolean;
}

let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB
 */
export async function initOfflineDB(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      console.warn('IndexedDB not supported');
      resolve(false);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB');
      resolve(false);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(true);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('voucherId', 'voucherId', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * Add a pending change to the queue
 */
export async function addPendingChange(
  voucherId: string,
  lines: unknown[],
  type: 'save' | 'submit'
): Promise<string | null> {
  if (!db) {
    await initOfflineDB();
  }

  if (!db) {
    console.error('IndexedDB not available');
    return null;
  }

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const change: PendingChange = {
      id: `${voucherId}_${Date.now()}`,
      voucherId,
      lines,
      timestamp: Date.now(),
      type,
      synced: false,
    };

    const request = store.add(change);

    request.onsuccess = () => {
      resolve(change.id);
    };

    request.onerror = () => {
      reject(new Error('Failed to add pending change'));
    };
  });
}

/**
 * Get all pending (unsynced) changes
 */
export async function getPendingChanges(): Promise<PendingChange[]> {
  if (!db) {
    await initOfflineDB();
  }

  if (!db) {
    return [];
  }

  return new Promise((resolve) => {
    const transaction = db!.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('synced');
    const request = index.getAll(IDBKeyRange.only(false));

    request.onsuccess = () => {
      const results = request.result as PendingChange[];
      // Sort by timestamp ascending (oldest first)
      results.sort((a, b) => a.timestamp - b.timestamp);
      resolve(results);
    };

    request.onerror = () => {
      console.error('Failed to get pending changes');
      resolve([]);
    };
  });
}

/**
 * Mark a change as synced
 */
export async function markAsSynced(id: string): Promise<boolean> {
  if (!db) {
    return false;
  }

  return new Promise((resolve) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const change = getRequest.result as PendingChange;
      if (change) {
        change.synced = true;
        const updateRequest = store.put(change);
        updateRequest.onsuccess = () => resolve(true);
        updateRequest.onerror = () => resolve(false);
      } else {
        resolve(false);
      }
    };

    getRequest.onerror = () => resolve(false);
  });
}

/**
 * Delete a synced change
 */
export async function deleteSyncedChange(id: string): Promise<boolean> {
  if (!db) {
    return false;
  }

  return new Promise((resolve) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

/**
 * Clear all synced changes
 */
export async function clearSyncedChanges(): Promise<void> {
  if (!db) {
    return;
  }

  const transaction = db!.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  const index = store.index('synced');
  const request = index.openCursor(IDBKeyRange.only(true));

  request.onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
}

/**
 * Get pending changes count
 */
export async function getPendingCount(): Promise<number> {
  const changes = await getPendingChanges();
  return changes.length;
}

/**
 * Check if online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Listen for online/offline events
 */
export function onConnectivityChange(callback: (online: boolean) => void): () => void {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
