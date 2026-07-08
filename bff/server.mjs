// =====================================================================
// bff/server.mjs
//
// Minimal Render Web Service "Backend-for-Frontend".
// Holds the Supabase service-role key SERVER-SIDE ONLY.
// Exposes exactly five auth.admin endpoints:
//   POST   /api/auth-admin/users            — createUser
//   GET    /api/auth-admin/users            — listUsers
//   PATCH  /api/auth-admin/users/:id        — updateUserById
//   DELETE /api/auth-admin/users/:id        — deleteUser
//   POST   /api/auth-admin/users/:id/password — updateUserById({password})
//
// Every request must carry `Authorization: Bearer <user_access_token>`.
// The BFF verifies the token via Supabase Auth and rejects callers whose
// profile is not an active admin.
//
// Run: `node bff/server.mjs` (Render sets PORT).
// Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
//      VITE_SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGIN.
// =====================================================================
import { createServer } from 'node:http';
import { createClient } from '@supabase/supabase-js';

const PORT = Number(process.env.PORT || 10000);
const SUPABASE_URL       = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY  = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE   = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_ORIGIN     = process.env.ALLOWED_ORIGIN || '*';
const BODY_LIMIT_BYTES   = 64 * 1024; // 64 KB — small JSON payloads only.

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE) {
  console.error(
    '[bff] FATAL: missing required env (VITE_SUPABASE_URL, ' +
    'VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_SERVICE_ROLE_KEY).'
  );
  process.exit(1);
}

// One admin client for the whole process. autoRefreshToken=false and
// persistSession=false prevent any accidental on-disk persistence of the
// service-role JWT.
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
}

function send(res, status, body) {
  cors(res);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT_BYTES) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

// Verify the caller's bearer token AND confirm admin role. Reject bad or
// missing tokens with 401, non-admin callers with 403 — never expose the
// underlying admin client to anonymised callers.
async function authenticate(req) {
  const m = (req.headers['authorization'] || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: 'missing_token', status: 401 };
  const token = m[1];

  // Use the admin client to validate the JWT end-to-end (Supabase sign + exp).
  const { data: userData, error: uerr } = await admin.auth.getUser(token);
  if (uerr || !userData?.user) return { error: 'invalid_token', status: 401 };

  // Role check.
  const { data: profile } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile) return { error: 'profile_missing', status: 403 };
  if (profile.role !== 'admin') return { error: 'not_admin', status: 403 };
  if (!profile.is_active) return { error: 'inactive', status: 403 };
  return { userId: userData.user.id };
}

async function handle(req, res, pathname, ctx) {
  // ---- POST /api/auth-admin/users  (createUser) -------------------
  if (req.method === 'POST' && pathname === '/api/auth-admin/users') {
    const body = await readBody(req);
    const { email, password, role = 'operator', username, email_confirm = true } = body || {};
    if (!email || !password) return send(res, 400, { error: 'email_and_password_required' });
    if (String(password).length < 8) return send(res, 400, { error: 'password_too_short' });
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm,
      user_metadata: { role, username: (username || '').toLowerCase().trim() },
    });
    if (error) return send(res, 400, { error: error.message });
    return send(res, 200, { id: data.user?.id, user: data.user });
  }

  // ---- GET /api/auth-admin/users  (listUsers, paged) ---------------
  if (req.method === 'GET' && pathname === '/api/auth-admin/users') {
    const page    = Number(req.url.match(/[?&]page=(\d+)/)?.[1] || '1');
    const perPage = Math.min(Number(req.url.match(/[?&]perPage=(\d+)/)?.[1] || '100'), 200);
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return send(res, 400, { error: error.message });
    return send(res, 200, data);
  }

  // ---- POST /api/auth-admin/users/:id/password  (reset / change) ---
  const pwMatch = pathname.match(/^\/api\/auth-admin\/users\/([^/]+)\/password$/);
  if (req.method === 'POST' && pwMatch) {
    const id = decodeURIComponent(pwMatch[1]);
    const body = await readBody(req);
    const { password } = body || {};
    if (!password || String(password).length < 8) {
      return send(res, 400, { error: 'password_too_short' });
    }
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return send(res, 400, { error: error.message });
    return send(res, 200, { ok: true });
  }

  // ---- PATCH/DELETE /api/auth-admin/users/:id ---------------------
  const userMatch = pathname.match(/^\/api\/auth-admin\/users\/([^/]+)$/);
  if (userMatch) {
    const id = decodeURIComponent(userMatch[1]);
    if (id === ctx.userId && req.method === 'DELETE') {
      return send(res, 400, { error: 'cannot_self_delete' });
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      // Translate { role, username } into Supabase user_metadata.
      const patch = {};
      if (body?.password)   patch.password = body.password;
      if (body?.role || body?.username) {
        patch.user_metadata = {
          ...(body?.user_metadata || {}),
          ...(body?.role ? { role: body.role } : {}),
          ...(body?.username ? { username: String(body.username).toLowerCase().trim() } : {}),
        };
      }
      if (body?.email)      patch.email = body.email;
      if (body?.email_confirm !== undefined) patch.email_confirm = !!body.email_confirm;
      const { data, error } = await admin.auth.admin.updateUserById(id, patch);
      if (error) return send(res, 400, { error: error.message });
      return send(res, 200, { id: data.user?.id, user: data.user });
    }
    if (req.method === 'DELETE') {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return send(res, 400, { error: error.message });
      return send(res, 200, { ok: true });
    }
  }

  return send(res, 404, { error: 'route_not_found', path: pathname });
}

const server = createServer(async (req, res) => {
  // CORS preflight.
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }
  let pathname = '';
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'bff'}`);
    pathname = url.pathname;
  } catch {
    return send(res, 400, { error: 'bad_url' });
  }
  if (!pathname.startsWith('/api/auth-admin/')) {
    return send(res, 404, { error: 'not_found' });
  }
  let ctx;
  try { ctx = await authenticate(req); }
  catch (e) { return send(res, 500, { error: 'auth_failed', detail: String(e) }); }
  if (ctx.error) return send(res, ctx.status, { error: ctx.error });

  try {
    await handle(req, res, pathname, ctx);
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg === 'payload_too_large') return send(res, 413, { error: 'payload_too_large' });
    if (msg === 'bad_json')         return send(res, 400, { error: 'bad_json' });
    console.error('[bff] handler error:', msg);
    return send(res, 500, { error: 'internal' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[bff] listening on :${PORT}, allowed_origin=${ALLOWED_ORIGIN}`);
});
