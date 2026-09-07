// =====================================================================
// vitest.config.ts
// Pure unit-test runner over src/utils — node environment, no DB,
// no browser, no jsdom. Alias '@' maps to src/ (mirrors tsconfig
// paths). Only src/**/*.test.ts files are picked up.
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
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
