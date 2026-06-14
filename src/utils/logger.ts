/**
 * logger — لاگر سبک برنامه
 * در حالت توسعه (DEV) پیام‌ها را در کنسول نمایش می‌دهد و در نسخه‌ی production
 * کاملاً ساکت است تا اطلاعات داخلی برنامه در مرورگر کاربر نهایی فاش نشود.
 *
 * این تنها فایلی است که مجاز به استفاده‌ی مستقیم از `console` است.
 */
const isDev = import.meta.env.DEV;

type LogArgs = unknown[];

export const logger = {
  debug: (...args: LogArgs) => {
    if (isDev) console.debug(...args);
  },
  info: (...args: LogArgs) => {
    if (isDev) console.info(...args);
  },
  warn: (...args: LogArgs) => {
    if (isDev) console.warn(...args);
  },
  error: (...args: LogArgs) => {
    if (isDev) console.error(...args);
  },
};
