import { supabaseAdmin } from '@/lib/supabase-admin';

export async function seedAdmin() {
  try {
    const adminUsername = import.meta.env.VITE_ADMIN_USERNAME;
    const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
      return;
    }

    const urlValue = import.meta.env.VITE_SUPABASE_URL;
    if (!urlValue || urlValue.includes('placeholder') || urlValue === 'https://') {
      return;
    }

    // Use admin client to check profiles (bypasses RLS)
    const { data: existingAdmins, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1);

    if (checkError) {
      // Table might not exist yet, silently return
      console.warn('Could not check admins:', checkError.message);
      return;
    }

    // Admin already exists in profiles
    if (existingAdmins && existingAdmins.length > 0) {
      return;
    }

    // Check if user exists in auth (by email)
    const email = `${adminUsername}@morvarid.local`;
    
    // Try to list users with this email
    const { data: userList } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });

    const existingAuthUser = userList?.users?.find(
      (u) => u.email === email
    );

    let userId: string;

    if (existingAuthUser) {
      // User exists in auth but not in profiles - just use existing ID
      userId = existingAuthUser.id;
      
      // Update metadata if needed
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { role: 'admin', username: adminUsername },
      });
    } else {
      // Create new auth user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { role: 'admin', username: adminUsername },
      });

      if (authError) {
        console.error('Error creating admin auth user:', authError.message);
        return;
      }

      if (!authData.user) {
        console.error('No user returned from createUser');
        return;
      }

      userId = authData.user.id;
    }

    // Insert or upsert profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        username: adminUsername,
        role: 'admin',
        first_name: 'مدیر',
        last_name: 'سیستم',
        is_active: true,
      }, { onConflict: 'id' });

    if (profileError) {
      console.error('Error creating admin profile:', profileError.message);
    }
  } catch (err) {
    // Silently fail - don't crash the app
    console.warn('Seed admin skipped:', err instanceof Error ? err.message : 'Unknown error');
  }
}
