export { cn } from './cn';

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize a user-authored name for storage: trim surrounding whitespace and
 * collapse runs of internal whitespace (including non-breaking spaces) to a
 * single ASCII space. Prevents whitespace-variant duplicates such as
 * «آنزیم  روابیو اکسل» vs «آنزیم روابیو اکسل» that slip past the unique
 * name constraint. Apply before every name insert/update.
 */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
