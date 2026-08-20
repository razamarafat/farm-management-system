import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';
import { rememberMeStorage } from '@/lib/auth-storage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
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

const hasValidConfig = isValidUrl(supabaseUrl) && !!supabaseAnonKey;

if (!hasValidConfig) {
  console.error('Supabase URL یا کلید ناشناس معتبر نیست. برنامه بدون اتصال به دیتابیس اجرا می‌شود.');
}

export const supabase = createClient<Database>(
  hasValidConfig ? supabaseUrl : 'https://placeholder.supabase.co',
  hasValidConfig ? supabaseAnonKey : 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Routes the session through localStorage (Remember Me checked) or
      // sessionStorage (unchecked) based on the choice made at login time.
      storage: rememberMeStorage,
    }
  }
);
