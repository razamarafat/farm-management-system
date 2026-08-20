/**
 * Offline local database — RxDB on IndexedDB (Dexie storage).
 *
 * This module owns the client-side RxDB database that backs the offline-first
 * feature. It is the Step B "local database wiring" scaffolding.
 *
 * Planned collections (registered here in the next step, after approval):
 *   - Replicated (offline write): daily_vouchers, daily_voucher_lines,
 *     inventory_transactions
 *   - Pull-only cache (offline read): farm_items, farm_halls,
 *     farm_feed_formulas, farm_formula_items
 *
 * The collection schemas mirror the Supabase tables (text PKs, _modified,
 * _deleted) exactly as defined by scripts/migrations/008_offline_sync.sql.
 *
 * NOTE: this supersedes the older custom queue in src/lib/offlineStorage.ts —
 * the approved architecture uses RxDB + the Supabase Replication Plugin, not a
 * hand-rolled pending-changes queue.
 */
import { createRxDatabase, addRxPlugin } from 'rxdb/plugins/core';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import type { RxDatabase } from 'rxdb';
import { offlineCollections } from './schemas';
import { startOfflineReplication } from './replication';
import { supabase } from '@/lib/supabase';

// The read facade uses the `find().where().eq()` query-builder API, which is
// provided by this plugin (not part of rxdb core).
addRxPlugin(RxDBQueryBuilderPlugin);

const DB_NAME = 'morvarid_farm_rxdb';

let dbPromise: Promise<RxDatabase | null> | null = null;

/**
 * Lazily create (once) the offline RxDB database backed by IndexedDB,
 * register the offline collections, and start Supabase replication.
 * Returns null when IndexedDB is unavailable so the app can keep running
 * online-only. Never throws.
 */
export function getOfflineDb(): Promise<RxDatabase | null> {
  if (!dbPromise) {
    dbPromise = createRxDatabase({
      name: DB_NAME,
      storage: getRxStorageDexie(),
      // closeDuplicates (not ignoreDuplicate) is the production-safe way to
      // survive Vite HMR / a stale duplicate instance with the same name.
      closeDuplicates: true,
    })
      .then(async (db) => {
        await db.addCollections(offlineCollections);
        startOfflineReplication(db, supabase);
        return db;
      })
      .catch((err) => {
        console.error('[offline] failed to open RxDB database; running online-only', err);
        return null;
      });
  }
  return dbPromise;
}

/** Convenience: true once the offline DB is open and usable. */
export async function isOfflineDbReady(): Promise<boolean> {
  const db = await getOfflineDb();
  return !!db;
}
