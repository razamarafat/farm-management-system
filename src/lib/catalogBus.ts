// =====================================================================
// src/lib/catalogBus.ts — universal item/catalog invalidation pipeline.
//
// PROBLEM: every item consumer in the app (`useInputs`, `useFarmFeedItems`,
// `FarmItemsPanel`, purchase/inventory selectors, the daily-sheet hook,
// report filter options) fetched its list ONCE on mount into isolated
// `useState`. Creating / editing / deleting an item anywhere else never
// notified the mounted consumers, so dropdowns and builders stayed stale
// until a hard refresh.
//
// FIX: a tiny pub/sub Single Source of Truth for "the catalog changed":
//   - `bumpCatalog(scope)` is called after EVERY successful item mutation
//     (farm_items AND the global inputs catalogue).
//   - Every consumer subscribes via `useCatalogVersion(...)` and includes
//     the version in its fetch deps, so it re-fetches immediately.
//   - Cross-tab: the bump is also mirrored through `localStorage`, so an
//     item created in one tab invalidates mounted lists in every other tab
//     of the same browser — no realtime backend required.
//
// Scopes keep the pipeline precise: 'farm-items' (per-farm `farm_items`
// rows) vs 'inputs' (global `inputs` catalogue). Bumping 'all' notifies
// every subscriber. (Suppliers/halls/formulas are out of scope by design.)
// =====================================================================

import { useEffect, useState } from 'react';

export type CatalogScope = 'farm-items' | 'inputs' | 'all';

type CatalogListener = (scope: CatalogScope) => void;

const listeners = new Set<CatalogListener>();

const STORAGE_KEY = 'morvarid:catalog-bump';

function readStoredBump(): CatalogScope | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { scope?: unknown };
    if (parsed.scope === 'farm-items' || parsed.scope === 'inputs' || parsed.scope === 'all') {
      return parsed.scope;
    }
    return null;
  } catch {
    return null;
  }
}

function notifyLocal(scope: CatalogScope): void {
  listeners.forEach((l) => {
    try {
      l(scope);
    } catch {
      // A failing subscriber must never break the pipeline for others.
    }
  });
}

// Cross-tab bridge: a bump written by ANOTHER tab arrives here as a
// `storage` event (the originating tab does not receive its own event).
// Guarded for non-browser runtimes (node unit tests, SSR).
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const scope = readStoredBump();
    if (scope) notifyLocal(scope);
  });
}

/**
 * Announce that items changed. Call AFTER the mutation is verified
 * successful (never on failure — subscribers refetch unconditionally).
 */
export function bumpCatalog(scope: CatalogScope = 'all'): void {
  notifyLocal(scope);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ scope, at: Date.now() }));
    }
  } catch {
    // Private-mode / quota failures must not break the mutation flow.
  }
}

/** Subscribe to catalog bumps. Returns an unsubscribe function. */
export function subscribeCatalog(listener: CatalogListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function scopeMatches(bump: CatalogScope, subscriptions: readonly CatalogScope[]): boolean {
  if (subscriptions.length === 0) return true;
  if (bump === 'all') return true;
  return subscriptions.includes(bump) || subscriptions.includes('all');
}

/**
 * React hook: returns a version counter that increments on every matching
 * catalog bump. Include it in fetch-effect deps to re-pull fresh lists:
 *
 *   const catalogVersion = useCatalogVersion('farm-items');
 *   const load = useCallback(async () => { ... }, [farmId, catalogVersion]);
 */
export function useCatalogVersion(...scopes: CatalogScope[]): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    return subscribeCatalog((scope) => {
      if (scopeMatches(scope, scopes)) {
        setVersion((v) => v + 1);
      }
    });
    // Subscribing once per mount is intentional — the scope filter is
    // captured from the first render (call sites pass literals).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return version;
}
