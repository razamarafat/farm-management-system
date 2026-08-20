// Build-time identity injected by vite.config.ts via `define`.
// `BUILD_ID` is unique per build and is the value the client compares against
// the server's version.json to detect a new deploy.
export const BUILD_ID: string = import.meta.env.VITE_BUILD_ID ?? '';
export const BUILD_TIME: string = import.meta.env.VITE_BUILD_TIME ?? '';
