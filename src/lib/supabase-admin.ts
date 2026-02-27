// src/lib/supabase-admin.ts
// ═══════════════════════════════════════════════════════════════
// ⚠️ هشدار امنیتی Production:
// این کلاینت باید فقط روی سرور (Edge Functions) استفاده شود.
// در حال حاضر یک لایه حفاظتی نقش (role guard) اضافه شده.
// مهاجرت کامل به Edge Functions در نسخه بعدی الزامی است.
// ═══════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const isValidUrl = (value?: string) => {
  if (!value) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const hasValidConfig = isValidUrl(supabaseUrl) && !!supabaseServiceKey;

if (import.meta.env.PROD && !hasValidConfig) {
  // در Production این خطا باید به سرویس مانیتورینگ ارسال شود
  console.error('[SECURITY] پیکربندی Supabase Admin نامعتبر است.');
}

// ═══════════════════════════════════════════════════════════════
// لایه حفاظتی: نقش کاربر را قبل از هر عملیات بررسی می‌کند
// ═══════════════════════════════════════════════════════════════
const _rawClient = createClient<Database>(
  hasValidConfig ? supabaseUrl : 'https://placeholder.supabase.co',
  hasValidConfig ? supabaseServiceKey : 'placeholder',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * تابع کمکی: نقش کاربر جاری را از localStorage می‌خواند
 * بدون import چرخه‌ای از authStore
 */
function getCurrentRole(): string | null {
  try {
    const raw = localStorage.getItem('auth-storage');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.profile?.role ?? null;
  } catch {
    return null;
  }
}

/**
 * Proxy هوشمند که عملیات مخرب را برای نقش‌های غیرمجاز مسدود می‌کند
 */
function createGuardedClient() {
  // عملیات‌هایی که فقط admin مجاز است
  const ADMIN_ONLY_MUTATIONS = ['delete', 'update', 'insert', 'upsert'];
  // جداول حساس که operator نباید هیچ دسترسی مستقیمی داشته باشد
  const FINANCIAL_TABLES = ['inventory_transactions', 'suppliers'];

  return new Proxy(_rawClient, {
    get(target, prop) {
      if (prop === 'from') {
        return (tableName: string) => {
          const role = getCurrentRole();
          const tableProxy = (target.from as Function)(tableName);

          // اپراتور نمی‌تواند مستقیماً جدول مالی را دستکاری کند
          if (role === 'operator' && FINANCIAL_TABLES.includes(tableName)) {
            // اجازه SELECT می‌دهیم، اما mutations را مسدود می‌کنیم
            return new Proxy(tableProxy, {
              get(tbl, method) {
                if (ADMIN_ONLY_MUTATIONS.includes(String(method))) {
                  console.error(`[SECURITY BLOCK] نقش operator نمی‌تواند عملیات "${String(method)}" روی جدول "${tableName}" انجام دهد.`);
                  // یک تابع mock برمی‌گرداند که خطا می‌دهد
                  return () => Promise.resolve({ data: null, error: { message: 'دسترسی غیرمجاز' } });
                }
                return (tbl as any)[method];
              }
            });
          }
          return tableProxy;
        };
      }
      return (target as any)[prop];
    }
  });
}

export const supabaseAdmin = createGuardedClient();
