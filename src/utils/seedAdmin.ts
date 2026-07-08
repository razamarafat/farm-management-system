/**
 * DEPRECATED: This client-side admin seeding logic has been moved to the server-side database migrations.
 * Please use scripts/migrations/002_seed_admin_user.sql to bootstrap the admin user.
 *
 * Moving this to the server avoids exposing the VITE_SUPABASE_SERVICE_ROLE_KEY to the client bundle,
 * significantly improving the security posture of the application.
 */
export async function seedAdmin() {
  console.info('seedAdmin: Deprecated client-side seeding. Seeding is now handled on the server.');
}
