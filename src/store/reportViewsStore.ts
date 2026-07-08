// =====================================================================
// Morvarid-Farm — Reports Saved Views store (per-user)
//
// STORAGE STRATEGY: localStorage via zustand persist, with a single
// key `mfarms-reports-saved-views` whose value is a map keyed by
// auth.users.id. We embed user-id in the STATE rather than as part of
// the localStorage KEY because zustand persist needs a static key
// at module-init time. This matches uiStore's precedent (theme).
//
// The map shape lets us cleanly drop all of one user's data when
// they sign out (a future authStore.onLogout hook can call
// useReportViewsStore.getState().discard(userId)) without disturbing
// other signed-in users sharing the same browser.
//
// RATIONALE (see docs/reports/report-catalog.md FUTURE DIRECTION):
//   - Keeps zero DB schema cost.
//   - Works offline (matches existing offline-first architecture).
//   - Personal preference; cross-device sync is not a requirement.
//   - Migration to a Supabase table later is a one-shot read-write
//     over localStorage entries.
// =====================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SavedReportView, ReportFiltersState, SortState } from '@/types/report.types';

interface UserScope {
  savedViews: SavedReportView[];
  lastReportId: string | null;
  /** Per-report column selection: column keys in user's preferred order. */
  visibleColumns: Record<string, string[]>;
  /** Per-report last-used sort spec. */
  sortByReport: Record<string, SortState>;
}

interface ReportViewsState {
  scopes: Record<string /* userId */, UserScope>;

  /** Read or initialize a user's scope (returns an empty scope if absent). */
  getScope: (userId: string) => UserScope;
  /** Wipe one user's scope. Call on logout. */
  discard: (userId: string) => void;

  /** Persist (insert or replace-by-id) a named view. */
  saveView: (
    userId: string,
    view: SavedReportView,
  ) => void;
  /** Remove a saved view by id. */
  deleteView: (userId: string, viewId: string) => void;
  /** Get a single saved view. */
  getView: (userId: string, viewId: string) => SavedReportView | null;
  /** Rename an existing saved view. */
  renameView: (userId: string, viewId: string, name: string) => void;

  /** Set the last opened report id (for restoring selector on remount). */
  setLastReport: (userId: string, reportId: string) => void;

  /** Set the visible-column order for a report. */
  setVisibleColumns: (userId: string, reportId: string, cols: string[]) => void;
  /** Set last sort spec. */
  setSortForReport: (userId: string, reportId: string, sort: SortState | null) => void;
}

const emptyScope = (): UserScope => ({
  savedViews: [],
  lastReportId: null,
  visibleColumns: {},
  sortByReport: {},
});

const newViewId = (): string => {
  // crypto.randomUUID is universally available in modern browsers
  // (vite + react 19 baseline supports it).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `view_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

// Re-exported so ReportsHomePage can mint new ids consistently with the store.
export const generateReportViewId = newViewId;

// Helper — pure-update an inner UserScope without mutating parent map.
const patchScope = (
  scopes: Record<string, UserScope>,
  userId: string,
  patch: (s: UserScope) => UserScope,
): Record<string, UserScope> => ({
  ...scopes,
  [userId]: patch(scopes[userId] ?? emptyScope()),
});

export const useReportViewsStore = create<ReportViewsState>()(
  persist(
    (set, get) => ({
      scopes: {},

      getScope: (userId) => get().scopes[userId] ?? emptyScope(),

      discard: (userId) =>
        set((s) => {
          const next = { ...s.scopes };
          delete next[userId];
          return { scopes: next };
        }),

      saveView: (userId, view) =>
        set((s) =>
          patchScope(s.scopes, userId, (scope) => {
            const existingIdx = scope.savedViews.findIndex((v) => v.id === view.id);
            const savedViews =
              existingIdx >= 0
                ? scope.savedViews.map((v, i) => (i === existingIdx ? view : v))
                : [...scope.savedViews, view];
            return { ...scope, savedViews };
          }),
        ),

      deleteView: (userId, viewId) =>
        set((s) =>
          patchScope(s.scopes, userId, (scope) => ({
            ...scope,
            savedViews: scope.savedViews.filter((v) => v.id !== viewId),
          })),
        ),

      getView: (userId, viewId) => {
        const scope = get().scopes[userId];
        if (!scope) return null;
        return scope.savedViews.find((v) => v.id === viewId) ?? null;
      },

      renameView: (userId, viewId, name) =>
        set((s) =>
          patchScope(s.scopes, userId, (scope) => ({
            ...scope,
            savedViews: scope.savedViews.map((v) =>
              v.id === viewId ? { ...v, name } : v,
            ),
          })),
        ),

      setLastReport: (userId, reportId) =>
        set((s) => patchScope(s.scopes, userId, (scope) => ({ ...scope, lastReportId: reportId }))),

      setVisibleColumns: (userId, reportId, cols) =>
        set((s) =>
          patchScope(s.scopes, userId, (scope) => ({
            ...scope,
            visibleColumns: { ...scope.visibleColumns, [reportId]: cols },
          })),
        ),

      setSortForReport: (userId, reportId, sort) =>
        set((s) =>
          patchScope(s.scopes, userId, (scope) => {
            const sortByReport = { ...scope.sortByReport };
            if (sort) sortByReport[reportId] = sort;
            else delete sortByReport[reportId];
            return { ...scope, sortByReport };
          }),
        ),
    }),
    {
      name: 'mfarms-reports-saved-views',
      // Don't persist transient `getScope` / `getView` (those are getters).
      // persist middleware automatically only stores the data slice and
      // rehydrates functions as no-op (we set them again in the create call).
      partialize: (state) => ({ scopes: state.scopes }) as Partial<ReportViewsState>,
    },
  ),
);

// Convenience selector: typed constructor for a saved view. Used by
// ReportShell.snapshotFilters() so we don't sprinkle id-minting logic around.
export const buildSavedView = (params: {
  reportId: string;
  name: string;
  filters: ReportFiltersState;
  visibleColumns: string[];
  sort: SortState | null;
}): SavedReportView => ({
  id: newViewId(),
  reportId: params.reportId,
  name: params.name,
  filters: params.filters,
  visibleColumns: params.visibleColumns,
  sort: params.sort,
  createdAt: new Date().toISOString(),
});
