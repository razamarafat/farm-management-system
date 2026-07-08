// Shared audit helpers: real user JWT + Management API SQL.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envPath = new URL('../../.env', import.meta.url);
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

export const SUPABASE_URL = env.VITE_SUPABASE_URL;
export const ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
export const PROJECT_REF = new URL(SUPABASE_URL).host.split('.')[0];
export const MGMT_TOKEN = process.env.SB_MGMT_TOKEN;

const ADMIN_EMAIL = `${env.VITE_ADMIN_USERNAME.toLowerCase().trim()}@morvarid.local`;
const ADMIN_PASSWORD = env.VITE_ADMIN_PASSWORD;

export async function signIn(email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn(${email}) failed: ${error.message}`);
  return { jwt: data.session.access_token, user: data.user, client: sb };
}

export function clientWithJwt(jwt) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Run arbitrary SQL via the Supabase Management API (service-role equivalent,
// bypasses RLS — use as the independent "raw DB" oracle).
export async function sql(query) {
  if (!MGMT_TOKEN) throw new Error('SB_MGMT_TOKEN not set');
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MGMT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text}`);
  return JSON.parse(text);
}
