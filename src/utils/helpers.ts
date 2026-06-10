export { cn } from './cn';

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
