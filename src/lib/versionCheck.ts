// Fetches the build identity currently served by the origin, with caching
// disabled. Because vite-plugin-singlefile inlines the whole app into one
// index.html there are no hashed assets to revalidate — this version check
// is the mechanism an open session uses to learn a deploy landed.

function versionUrl(): string {
  try {
    return new URL(`${import.meta.env.BASE_URL}version.json`, window.location.href).toString();
  } catch {
    return 'version.json';
  }
}

function indexUrl(): string {
  try {
    return new URL(`${import.meta.env.BASE_URL}index.html`, window.location.href).toString();
  } catch {
    return 'index.html';
  }
}

export async function fetchRemoteBuildId(): Promise<string | null> {
  const timestamp = Date.now();

  // Strategy 1: Fetch version.json directly with no-store cache busting
  try {
    const res = await fetch(`${versionUrl()}?t=${timestamp}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });

    if (res.ok) {
      const text = await res.text();
      // Ensure the response is valid JSON and not an HTML SPA fallback rewrite
      if (text.trim().startsWith('{')) {
        const data = JSON.parse(text) as { buildId?: unknown };
        if (typeof data.buildId === 'string' && data.buildId.trim()) {
          return data.buildId.trim();
        }
      }
    }
  } catch {
    // Strategy 1 network/parse failure, fall through to Strategy 2
  }

  // Strategy 2 (Robust Fallback): Fetch index.html directly and extract build-id meta tag
  // Useful when hosting providers rewrite all paths to index.html without preserving version.json
  try {
    const res = await fetch(`${indexUrl()}?t=${timestamp}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });

    if (res.ok) {
      const html = await res.text();
      // Look for injected meta tag: <meta name="build-id" content="..." />
      const metaMatch = html.match(/<meta\s+name=["']build-id["']\s+content=["']([^"']+)["']/i);
      if (metaMatch && metaMatch[1]) {
        return metaMatch[1].trim();
      }

      // Look for inline VITE_BUILD_ID assignment
      const defineMatch = html.match(/VITE_BUILD_ID\s*:\s*["']([^"']+)["']/i);
      if (defineMatch && defineMatch[1]) {
        return defineMatch[1].trim();
      }
    }
  } catch {
    // Both strategies failed
  }

  return null;
}
