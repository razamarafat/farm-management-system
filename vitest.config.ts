// =====================================================================
// vitest.config.ts
// Unit-test runner with two projects:
//   - "node": the original pure-utils suite (src/**/*.test.ts) — no DB,
//     no browser, no jsdom. Left exactly as plan 013 shipped it.
//   - "dom":  React-hook tests (src/hooks/*.test.tsx) in jsdom with the
//     module boundary doubled via vi.mock — added by plan 014.
// Alias '@' maps to src/ (mirrors tsconfig paths).
// =====================================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(rootDir, 'src'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/hooks/*.test.tsx'],
        },
      },
    ],
  },
});
