/**
 * Routes that render without the application chrome.
 *
 * The privacy policy and terms are public — they are linked from the Google
 * OAuth consent screen, so the people reading them are typically not signed
 * in and may not be clients at all. Showing them a navigation bar full of
 * links to Schedule, Clients and Outreach (every one of which bounces to a
 * password prompt) is confusing, and a search box that 401s is worse.
 *
 * Kept as data rather than a check inside each component so that the set of
 * public pages is stated in one place, next to the proxy's PUBLIC_EXACT.
 */
export const CHROME_FREE_PATHS = new Set(["/privacy", "/terms"]);

export function isChromeFree(pathname: string): boolean {
  return CHROME_FREE_PATHS.has(pathname);
}
