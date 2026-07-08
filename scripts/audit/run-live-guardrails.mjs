import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = process.cwd();
const envFile = readFileSync(resolve(root, '.env'), 'utf8');
const localEnv = Object.fromEntries(
  envFile
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx), line.slice(idx + 1)];
    }),
);

const supabaseUrl = localEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = localEnv.VITE_SUPABASE_ANON_KEY;
const username = localEnv.VITE_ADMIN_USERNAME;
const password = localEnv.VITE_ADMIN_PASSWORD;

if (!supabaseUrl || !supabaseAnonKey || !username || !password) {
  console.error('[live-guardrails] Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_ADMIN_USERNAME, or VITE_ADMIN_PASSWORD.');
  process.exit(2);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const email = `${username.toLowerCase().trim()}@morvarid.local`;
const { data, error } = await supabase.auth.signInWithPassword({ email, password });

if (error || !data?.session?.access_token) {
  console.error(`[live-guardrails] Admin sign-in failed: ${error?.message ?? 'missing session'}`);
  process.exit(3);
}

console.log(`[live-guardrails] Signed in as ${email}; running live DB guardrails with a real user JWT.`);

const childEnv = {
  ...process.env,
  SUPABASE_TEST_URL: supabaseUrl,
  SUPABASE_TEST_ANON_KEY: supabaseAnonKey,
  SUPABASE_TEST_JWT: data.session.access_token,
};

for (const script of [
  'services/export-api/reconciliation-test.mjs',
  'services/export-api/perf-budget.mjs',
]) {
  const code = await runNode(script, childEnv);
  if (code !== 0) process.exit(code);
}

function runNode(script, env) {
  return new Promise((resolveRun) => {
    console.log(`\n[live-guardrails] node ${script}`);
    const child = spawn(process.execPath, ['--import', './scripts/audit/ws-polyfill.mjs', script], {
      cwd: root,
      env,
      stdio: 'inherit',
    });
    child.on('close', (code) => resolveRun(code ?? 1));
  });
}
