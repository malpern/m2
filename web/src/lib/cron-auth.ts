// Centralized cron authentication. Fails closed: if CRON_SECRET is missing or
// empty, every request is rejected — never accept a "Bearer undefined" header.

export function isCronAuthorized(request: { headers: { get(name: string): string | null } }): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
