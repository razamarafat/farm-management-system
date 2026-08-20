// Fetches the build identity currently served by the origin, with caching
// disabled. Because vite-plugin-singlefile inlines the whole app into one
// index.html there are no hashed assets to revalidate — this tiny JSON file
// is the only thing an open session must poll to learn a deploy landed.

function versionUrl(): string {
  try {
    return new URL(`${import.meta.env.BASE_URL}version.json`, window.location.href).toString();
  } catch {
    return 'version.json';
  }
}

export async function fetchRemoteBuildId(): Promise<string | null> {
  try {
    // cache: 'no-store' + a cache-busting query keeps any intermediary from
    // serving a stale copy.
    const res = await fetch(`${versionUrl()}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      data &&
      typeof data === 'object' &&
      'buildId' in data &&
      typeof (data as { buildId: unknown }).buildId === 'string'
    ) {
      return (data as { buildId: string }).buildId;
    }
    return null;
  } catch {
    return null;
  }
}
