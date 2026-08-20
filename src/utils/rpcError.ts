// =====================================================================
// src/utils/rpcError.ts
// Uniform, Persian-safe mapper for any thrown shape (JS Error,
// PostgrestError, PG RAISE EXCEPTION string, or raw object with
// .message) into a string suitable for toast.error(...) and inline
// error surfaces.
//
// Rules (in order):
//   1. Network-level failures      -> Persian connection message
//   2. Already-Persian text        -> pass through verbatim
//   3. Known English RPC strings   -> mapped to Persian equivalents
//   4. `CODE: Persian` envelopes   -> code prefix stripped, Persian kept
//   5. Known Postgres error codes  -> Persian category message
//   6. Anything else               -> generic Persian
//                                      ("خطای غیرمنتظره‌ای رخ داد")
//
// The raw technical detail is always logged to the console so it stays
// available for debugging without ever reaching the end user.
// Never throws. Always returns a string or null.
// =====================================================================

const GENERIC_MESSAGE = 'خطای غیرمنتظره‌ای رخ داد';
const NETWORK_MESSAGE = 'خطا در اتصال به سرور. اتصال اینترنت خود را بررسی کنید';

const PERSIAN_RE = /[\u0600-\u06FF]/;
const ASCII_LETTER_RE = /[a-zA-Z]/;
const NETWORK_RE =
  /failed to fetch|networkerror|load failed|fetch failed|network request failed|socket hang up|econnrefused|econnreset|timed? ?out|err_internet|net::err_/i;
const CODE_PREFIX_RE = /^[A-Z0-9_]+:\s*(.+)$/;

/** Exact English strings the RPC layer could raise (defense in depth —
 *  the live functions now return Persian directly, but old cached
 *  bundles or a reverted DB must never leak English). */
const KNOWN_MESSAGES: Record<string, string> = {
  forbidden: 'دسترسی غیرمجاز',
  'forbidden: admin role required': 'دسترسی غیرمجاز',
  'duplicate input name': 'نام نهاده قبلاً ثبت شده است',
  'invalid txn_type': 'نوع تراکنش نامعتبر است',
  'adjustment requires notes': 'توضیحات تعدیل الزامی است',
  'source formula not found': 'فرمول مبدأ یافت نشد',
  'p_date_from and p_date_to are required': 'تاریخ شروع و پایان الزامی است',
  // Supabase Auth errors (login form surfaces these toasts)
  'invalid login credentials': 'نام کاربری یا رمز عبور اشتباه است',
  'email not confirmed': 'ایمیل تأیید نشده است',
  'user already registered': 'این کاربر قبلاً ثبت شده است',
  'password should be at least 6 characters': 'رمز عبور باید حداقل ۶ کاراکتر باشد',
  'user not found': 'کاربر یافت نشد',
};

/** English prefixes whose detail varies (counts, values) — mapped to a
 *  static Persian message. */
const KNOWN_PREFIXES: Array<[RegExp, string]> = [
  [/^p_group_by must be one of/, 'مقدار گروه‌بندی نامعتبر است'],
  [/^p_basis must be one of/, 'مبنای محاسبه نامعتبر است'],
  [/^p_date_to \(/, 'تاریخ پایان باید بعد از تاریخ شروع باشد'],
  [/^formula_no .*already exists/, 'شماره فرمول قبلاً وجود دارد'],
  [
    /^input is referenced by/,
    'این نهاده توسط فارم‌های دیگر استفاده شده است؛ برای حذف، ابتدا آن را غیرفعال کنید',
  ],
  [
    /^cannot change unit type/,
    'امکان تغییر واحد این آیتم به دلیل وجود سوابق موجودی وجود ندارد',
  ],
  [/^invalid role/, 'نقش نامعتبر است'],
];

function extractMessage(e: unknown): string | null {
  if (e === null || e === undefined) return null;
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  if (typeof e === 'object') {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  try {
    return String(e);
  } catch {
    return null;
  }
}

export function rpcError(e: unknown): string | null {
  const raw = extractMessage(e);
  if (raw === null) return null;
  const msg = raw.trim();
  if (!msg) return null;

  console.error('[rpcError] technical detail:', msg);

  // 1. Network-level failures (fetch threw, server unreachable, timeout)
  if (NETWORK_RE.test(msg)) return NETWORK_MESSAGE;

  // 2. Already Persian with no ASCII letters -> safe to show verbatim
  if (PERSIAN_RE.test(msg) && !ASCII_LETTER_RE.test(msg)) return msg;

  // 3. Known exact English strings from the RPC layer
  const known = KNOWN_MESSAGES[msg.toLowerCase()];
  if (known) return known;

  // 4. English prefixes with variable detail
  for (const [re, fa] of KNOWN_PREFIXES) {
    if (re.test(msg)) return fa;
  }

  // 5. `CODE: Persian` envelopes (e.g. 'VOUCHER_LOCKED: این حواله قفل شده است')
  const m = msg.match(CODE_PREFIX_RE);
  if (m && PERSIAN_RE.test(m[1])) return m[1].trim();

  // 6. Known Postgres error codes
  const code = (e as { code?: string } | null)?.code;
  if (code === '42501') return 'شما به این عملیات دسترسی ندارید';
  if (code === '23505') return 'این رکورد قبلاً ثبت شده است';
  if (code === '22P02' || code === '22007' || code === '22008') {
    return 'مقدار وارد شده نامعتبر است';
  }
  if (code === '23514') return 'مقدار وارد شده با قوانین سیستم مغایرت دارد';
  if (code === 'P0001') return GENERIC_MESSAGE;

  // 7. Generic safe fallback — never expose raw internals to the user
  return GENERIC_MESSAGE;
}
