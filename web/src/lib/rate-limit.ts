// Simple in-memory rate limiter: tracks request timestamps per key (e.g. IP).

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

export const rateLimitMap = new Map<string, number[]>();

export function isRateLimited(
  key: string,
  max: number = RATE_LIMIT_MAX,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) ?? [];
  // Prune entries older than the window
  const recent = timestamps.filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    rateLimitMap.set(key, recent);
    return true;
  }
  recent.push(now);
  rateLimitMap.set(key, recent);
  return false;
}
