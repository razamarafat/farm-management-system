// Recovers from a lazy-loaded chunk 404ing because a deploy renamed it
// mid-session. With the current vite-plugin-singlefile build every dynamic
// import is inlined, so this path is dormant — it exists as a safety net for
// the day code-splitting is re-enabled. On a matching failure we reload
// exactly once (guarded against loops), which pulls the fresh index.html.

const RELOAD_KEY = 'morvarid.chunk-reload';
const MIN_INTERVAL_MS = 15_000;
const MAX_RELOADS = 3;

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /dynamically imported module/i,
  /dynamic-import/i,
];

function isChunkError(message: unknown): boolean {
  const text = typeof message === 'string' ? message : String(message ?? '');
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(text));
}

function canReload(): boolean {
  try {
    const raw = window.sessionStorage.getItem(RELOAD_KEY);
    if (!raw) return true;
    const rec = JSON.parse(raw) as { count: number; lastAt: number };
    if (Date.now() - rec.lastAt < MIN_INTERVAL_MS) return false;
    return rec.count < MAX_RELOADS;
  } catch {
    return true;
  }
}

function recordReload(): void {
  try {
    const raw = window.sessionStorage.getItem(RELOAD_KEY);
    const prev = raw ? (JSON.parse(raw) as { count: number; lastAt: number }) : { count: 0, lastAt: 0 };
    window.sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ count: prev.count + 1, lastAt: Date.now() }));
  } catch {
    // ignore
  }
}

function maybeReload(): void {
  if (!canReload()) return;
  recordReload();
  window.location.reload();
}

export function installChunkErrorGuard(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : reason?.message;
    if (isChunkError(message)) {
      event.preventDefault();
      maybeReload();
    }
  });

  window.addEventListener('error', (event) => {
    if (isChunkError(event.message)) {
      maybeReload();
    }
  });
}
