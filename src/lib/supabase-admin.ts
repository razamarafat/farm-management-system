// =====================================================================
// DEPRECATED — keeps the SPA building until the hook rewrites land.
//
// This module is REFERENCED by hooks (useFarms, useInputs, useSuppliers,
// useFormulas, useInventory, useDailySheet, useUsers, FarmItemsPanel,
// FileUpload, plus the page components that call into them). The team
// has decided ("Full Approach A") to migrate EVERY call here to
// `supabase.rpc('rpc_admin_*', ...)` for table ops + a Render Web
// Service BFF (`bff/server.mjs`) for `auth.admin.*`. Until that
// refactor lands, this module is kept here ONLY to keep the JS build
// green. The service-role key is NOT a hard requirement of the SPA —
// vite-env.d.ts deliberately omits VITE_SUPABASE_SERVICE_ROLE_KEY. On
// production renders, this module will fall back to the anon key (see
// `effectiveKey` below), which means RLS-only access.
//
// After every consumer is migrated, this file MUST be deleted:
//   1. Replace every `supabaseAdmin.from('X').{select,insert,update,delete}(…)`
//      with `supabase.rpc('rpc_admin_<op>', payload)`.
//   2. Replace every `supabaseAdmin.auth.admin.{createUser,listUsers,
//      updateUserById,deleteUser}(…)` with a fetch to
//      `${VITE_BFF_URL}/api/auth-admin/users…`.
//   3. Delete this file. Update check-env.mjs and check-secrets.mjs.
//   Tracked in docs/security/incident-response.md (TODO).
// =====================================================================
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';

const supabaseUrl      = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey  = import.meta.env.VITE_SUPABASE_ANON_KEY;

// We intentionally NO LONGER read VITE_SUPABASE_SERVICE_ROLE_KEY from
// the SPA. The folder of (legacy) admin flows must migrate off this
// client. Until then, the effective key is the anon key — yes, that
// breaks admin flows, but that is the correct failure mode: it forces
// the migration rather than re-introducing a client-shipped secret.
const effectiveKey = supabaseAnonKey || 'placeholder';

const isValidUrl = (value?: string) => {
  if (!value) return false;
  try { new URL(value); return true; } catch { return false; }
};

const hasValidConfig = isValidUrl(supabaseUrl) && !!effectiveKey;

if (!hasValidConfig) {
  console.error(
    'Supabase URL یا کلید ناشناس معتبر نیست. برنامه بدون اتصال به دیتابیس اجرا می‌شود.',
  );
}

export const supabaseAdmin = createClient<Database>(
  hasValidConfig ? supabaseUrl : 'https://placeholder.supabase.co',
  effectiveKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
