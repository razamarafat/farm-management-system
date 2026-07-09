import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && line.includes('=') && !line.startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

process.env.SUPABASE_URL = process.env.SUPABASE_URL || env.VITE_SUPABASE_URL;
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
process.env.ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://127.0.0.1:5173,http://localhost:5173';

await import('../../services/export-api/server.mjs');
