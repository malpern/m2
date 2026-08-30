/**
 * Routes that render without the application chrome.
 *
 * The privacy policy and terms are public — they are linked from the Google
 * OAuth consent screen, so the people reading them are typically not signed
 * in and may not be clients at all. Showing them a navigation bar full of
 * links to Schedule, Clients and Outreach (every one of which bounces to a
 * password prompt) is confusing, and a search box that 401s is worse.
 *
 * /login is included on its own merits: showing a signed-out visitor a nav bar
 * of links to Schedule, Clients, Outreach and Settings — every one of which
 * bounces them back to the password prompt — is just misleading. It also stops
 * next/link prefetching gated routes from a page where the visitor has no
 * session, which cannot hurt.
 *
 * Kept as data rather than a check inside each component so that the set of
 * public pages is stated in one place, next to the proxy's PUBLIC_EXACT.
 */
export const CHROME_FREE_PATHS = new Set(["/login", "/privacy", "/terms"]);

export function isChromeFree(pathname: string): boolean {
  return CHROME_FREE_PATHS.has(pathname);
}
