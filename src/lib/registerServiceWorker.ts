// =====================================================================
// src/lib/registerServiceWorker.ts
//
// Registers the offline Service Worker (public/sw.js) upon client load.
// Ensures hard reload (F5) during offline mode serves the cached App Shell
// without presenting the browser dinosaur screen.
// =====================================================================

export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // Defer registration until window load to preserve main-thread start performance
  window.addEventListener('load', () => {
    let swUrl: string;
    try {
      swUrl = new URL(`${import.meta.env.BASE_URL}sw.js`, window.location.href).toString();
    } catch {
      swUrl = './sw.js';
    }

    navigator.serviceWorker
      .register(swUrl, { scope: import.meta.env.BASE_URL })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.info('[PWA] New version installed; ready to activate.');
                } else {
                  console.info('[PWA] App shell precached for offline navigation.');
                }
              }
            });
          }
        });
      })
      .catch((err) => {
        // Safe catch: non-blocking failure in environments without SW support (e.g. non-secure HTTP)
        console.warn('[PWA] Service worker registration error:', err);
      });
  });
}
