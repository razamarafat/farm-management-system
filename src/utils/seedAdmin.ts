import { logger } from '@/utils/logger';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * seedAdmin — Bootstrap Admin User Creator
 * ==========================================
 * This function creates a default admin user on first application launch.
 * It is designed to be **idempotent** — safe to call multiple times, it only
 * creates the admin once. The caller (App.tsx) uses a localStorage flag
 * (`admin_seeded`) to avoid calling this on subsequent page loads.
 *
 * Flow:
 *  1. Validate environment variables (VITE_ADMIN_USERNAME, VITE_ADMIN_PASSWORD,
 *     VITE_SUPABASE_URL) — exit silently if missing or placeholder.
 *  2. Check the `profiles` table for an existing admin (bypasses RLS via
 *     supabaseAdmin service-role client).
 *  3. If admin profile already exists → done, exit.
 *  4. Check Supabase Auth for an existing user with the admin email.
 *  5. If auth user exists → reuse it and update metadata.
 *     If not → create a new auth user.
 *  6. Upsert the corresponding row in `profiles` to link the auth user
 *     with the admin role.
 *
 * Security notes:
 *  - Admin credentials come from VITE_ env vars (NOT hardcoded).
 *  - The service-role key is required for this to work. Without it, the
 *    supabaseAdmin client falls back to the anon key and seedAdmin exits
 *    silently.
 *  - In production, consider moving admin creation to a Supabase Edge
 *    Function or a dedicated backend to avoid shipping the service-role
 *    key to the client bundle.
 *
 * Factory Reset compatibility:
 *  - If a Factory Reset deletes the admin user from Supabase, calling
 *    `localStorage.removeItem('admin_seeded')` and reloading the app
 *    will re-trigger seedAdmin and recreate the admin.
 */
export async function seedAdmin() {
  try {
    // ── 1. Validate required environment variables ──────────────────────
    const adminUsername = import.meta.env.VITE_ADMIN_USERNAME;
    const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
      logger.info(
        'seedAdmin: VITE_ADMIN_USERNAME or VITE_ADMIN_PASSWORD not set. ' +
        'Skipping admin seed. Set these in your .env file to bootstrap an admin user.'
      );
      return;
    }

    const urlValue = import.meta.env.VITE_SUPABASE_URL;
    if (!urlValue || urlValue.includes('placeholder') || urlValue === 'https://') {
      logger.info(
        'seedAdmin: VITE_SUPABASE_URL is missing or still a placeholder. ' +
        'Skipping admin seed until Supabase is configured.'
      );
      return;
    }

    // ── 2. Check if an admin already exists in profiles ─────────────────
    // Uses supabaseAdmin (service_role) to bypass Row Level Security.
    const { data: existingAdmins, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1);

    if (checkError) {
      // Table may not exist yet (fresh database without migrations).
      // Exit silently — the admin can be seeded later.
      logger.warn(
        'seedAdmin: Could not query profiles table:',
        checkError.message,
        '(the table may not exist yet — run migrations first)'
      );
      return;
    }

    if (existingAdmins && existingAdmins.length > 0) {
      logger.info('seedAdmin: Admin user already exists in profiles. Nothing to do.');
      return;
    }

    // ── 3. Find or create the admin auth user ───────────────────────────
    const email = `${adminUsername}@morvarid.local`;

    // Fetch all users to check if the admin auth user already exists.
    // We use a generous perPage to avoid missing the admin due to pagination.
    const { data: userList } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    const existingAuthUser = userList?.users?.find(
      (u) => u.email === email
    );

    let userId: string;

    if (existingAuthUser) {
      // Auth user exists but has no profile row (possibly from an incomplete
      // previous seed attempt). Reuse the existing auth identity.
      userId = existingAuthUser.id;
      logger.info(
        'seedAdmin: Found existing auth user for',
        email,
        '— updating metadata and creating profile.'
      );

      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { role: 'admin', username: adminUsername },
      });
    } else {
      // No auth user found — create a fresh one.
      logger.info('seedAdmin: Creating new admin auth user:', email);

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { role: 'admin', username: adminUsername },
      });

      if (authError) {
        logger.error('seedAdmin: Error creating admin auth user:', authError.message);
        return;
      }

      if (!authData.user) {
        logger.error('seedAdmin: No user returned from createUser');
        return;
      }

      userId = authData.user.id;
    }

    // ── 4. Create or update the profiles row ────────────────────────────
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: userId,
          username: adminUsername,
          role: 'admin',
          first_name: 'مدیر',
          last_name: 'سیستم',
          is_active: true,
        },
        { onConflict: 'id' }
      );

    if (profileError) {
      logger.error('seedAdmin: Error creating admin profile:', profileError.message);
    } else {
      logger.info('seedAdmin: Admin user seeded successfully.');
    }
  } catch (err) {
    // Silently catch all errors — never crash the app due to seed failure.
    logger.warn(
      'seedAdmin: Unexpected error (skipped):',
      err instanceof Error ? err.message : 'Unknown error'
    );
  }
}
