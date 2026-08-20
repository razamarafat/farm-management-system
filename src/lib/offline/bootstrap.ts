/**
 * Lazy, re-entry-safe bootstrap for the offline RxDB cache (Gap 1).
 *
 * RxDB is heavy and the production build inlines everything into one HTML
 * file (vite-plugin-singlefile), so this module deliberately has NO static
 * RxDB import. The database + replication wiring is pulled in through a
 * dynamic import only when the cache is first warmed (right after auth),
 * keeping RxDB out of the main bundle.
 *
 * `warmOfflineDb()` is idempotent: every caller joins the same in-flight
 * promise, and `getOfflineDb()` itself memoizes the RxDB database and
 * replication startup, so repeated auth state changes (or React StrictMode's
 * double effect) cannot create duplicate databases or replication streams.
 */

let warming: Promise<void> | null = null;

export function warmOfflineDb(): Promise<void> {
  if (!warming) {
    warming = import('./db')
      .then(({ getOfflineDb }) => getOfflineDb())
      .then(() => undefined)
      .catch((err) => {
        // getOfflineDb() already swallows its own failures and returns null;
        // this is a final safety net so a rejected warm never poisons callers.
        console.error('[offline] failed to warm offline cache', err);
      });
  }
  return warming;
}

/** Test/QA escape hatch: reset the memo so a fresh warm can be forced. */
export function __resetOfflineWarm(): void {
  warming = null;
}
