// Pre-deploy / pre-build env var check.
// Runs on any Node (no TS loader required) because the package is type:"module".
//
// Mirrors EXACTLY the variables the application reads at build time:
//   - src/lib/supabase.ts           → VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
//   - src/lib/supabase-admin.ts     → VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
//                                     VITE_SUPABASE_SERVICE_ROLE_KEY
//   - src/utils/constants.ts        → VITE_APP_VERSION (optional — falls back to "1.0.2")
//
// VITE_SUPABASE_SERVICE_ROLE_KEY is listed as REQUIRED because admin UI flows
// (voucher write paths, user create/update, hard deletes) call supabaseAdmin.
// Without it the user-management and inventory tabs will not function even
// though the build succeeds.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_FILES = ['.env', '.env.local', '.env.production', '.env.production.local'];
const REQUIRED = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  // The auth.admin flow now lives in the BFF (bff/server.mjs). The SPA
  // must NEVER read or expose VITE_SUPABASE_SERVICE_ROLE_KEY at build
  // time. We still require the BFF URL so reviewers can confirm the
  // SPA knows where to proxy auth.admin calls.
  'VITE_BFF_URL',
];
const OPTIONAL = ['VITE_APP_VERSION'];
const STALE_REJECTED = [
  'VITE_ADMIN_USERNAME',
  'VITE_ADMIN_PASSWORD',
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
];

function loadEnvFiles() {
  const accum = {};
  for (const name of ENV_FILES) {
    const full = resolve(process.cwd(), name);
    if (!existsSync(full)) continue;
    const contents = readFileSync(full, 'utf8');
    for (const raw of contents.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      // Strip surrounding quotes if present.
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      accum[key] = val;
    }
  }
  return accum;
}

export function checkEnvVariables(envSource = loadEnvFiles()) {
  const missing = REQUIRED.filter((k) => !envSource[k] || envSource[k].length === 0);
  const rejectedStale = STALE_REJECTED.filter((k) => k in envSource);
  const missingOptional = OPTIONAL.filter((k) => !envSource[k]);

  let ok = true;

  if (missing.length > 0) {
    console.error('\n[check-env] MISSING required environment variables:');
    for (const k of missing) console.error(`  - ${k}`);
    console.error('\nCopy .env.example to .env and fill in the values, or set them in Render.');
    ok = false;
  }

  if (rejectedStale.length > 0) {
    console.error(
      '\n[check-env] DEPRECATED / FORBIDDEN variables detected (no longer read by the app):',
    );
    for (const k of rejectedStale) console.error(`  - ${k}`);
    console.error(
      'Remove VITE_SUPABASE_SERVICE_ROLE_KEY from .env / Render SPA env. ' +
      'The service-role key is now held server-side by the BFF Web Service ' +
      '(bff/server.mjs). See docs/deploy/render.md §POST-DEPLOY.',
    );
  }

  if (missingOptional.length > 0) {
    for (const k of missingOptional) {
      console.warn(`[check-env] (optional) ${k} not set; a built-in default will be used.`);
    }
  }

  if (ok) {
    console.log('[check-env] Environment variables check passed.');
  }
  return { ok, missing, rejectedStale, missingOptional };
}

// Run when invoked directly (not when imported elsewhere).
const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);

if (invokedDirectly) {
  const result = checkEnvVariables();
  if (!result.ok) process.exit(1);
}
