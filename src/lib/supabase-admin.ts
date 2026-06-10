import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isValidUrl = (value?: string) => {
  if (!value) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const hasValidConfig = isValidUrl(supabaseUrl);

if (!hasValidConfig) {
  console.error('Supabase URL is not valid. The application will run in offline mode.');
}

// IMPORTANT SECURITY NOTE:
// Using the service_role key in client-side code is a security risk.
// In production, admin operations should go through a secure backend API.
// For this application, ensure Row Level Security (RLS) policies are properly
// configured in Supabase to prevent unauthorized access.
// The supabaseAdmin client is used to bypass RLS for operations that need
// cross-user access. In a production environment, move admin logic to
// Edge Functions or a dedicated backend.

// Use anon key as fallback if service key is not set (safer default)
const effectiveKey = supabaseServiceKey || supabaseAnonKey || 'placeholder';

export const supabaseAdmin = createClient<Database>(
  hasValidConfig ? supabaseUrl : 'https://placeholder.supabase.co',
  effectiveKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
