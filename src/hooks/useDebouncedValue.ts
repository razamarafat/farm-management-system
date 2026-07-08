// =====================================================================
// useDebouncedValue
//
// Tiny utility hook — returns `value` once it has been stable for at
// least `delayMs` milliseconds. Used by ReportBody to coalesce rapid
// filter edits (date picker sweep, chip toggle) so the downstream
// data hooks refetch once per burst instead of once per keystroke.
//
// Notes:
//   - First render returns the initial value immediately (no flash of
//     stale-data before debounce fires).
//   - The internal timeout resets on every fresh update — only the
//     LAST value within a burst is committed.
//   - DOM-clean: cleanup runs in useEffect so navigating away mid-burst
//     does not commit a stale snapshot.
// =====================================================================

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
