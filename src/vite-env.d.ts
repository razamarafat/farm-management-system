/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_BFF_URL: string;
  readonly VITE_APP_VERSION?: string;
  /** Injected at build time by vite.config.ts. */
  readonly VITE_BUILD_ID?: string;
  /** Injected at build time by vite.config.ts. */
  readonly VITE_BUILD_TIME?: string;
  /** Optional override for the update poll interval (ms). Default 150000. */
  readonly VITE_UPDATE_POLL_MS?: string;
  /** Optional override for the update banner countdown (ms). Default 5000. */
  readonly VITE_UPDATE_COUNTDOWN_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
