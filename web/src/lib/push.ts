/**
 * Operator notifications via Pushover.
 *
 * This replaces sending mail through the connected Google account. The reason
 * is scope tiering, not preference: `gmail.send` is one of Google's RESTRICTED
 * scopes, the tier that turns OAuth verification into a paid third-party CASA
 * security assessment repeated annually. It was the only restricted scope left,
 * and its entire job was mailing two notifications to the operator — a daily
 * digest and an error-burst alert. Carrying Google's most expensive permission
 * class to deliver our own status messages was a bad trade, so the transport
 * moved and the scope went away.
 *
 * NO OUTREACH GUARD HERE, DELIBERATELY. `canContact` exists to stop the app
 * contacting CLIENTS while outreach is off; it keys on a recipient address.
 * Pushover has no recipient parameter — a message goes to whoever owns
 * PUSHOVER_USER_KEY, which is the operator, and there is no input that could
 * redirect it to a client. Adding a guard would suggest a risk that the
 * transport cannot express.
 *
 * Pushover is also what the machine watchdogs already page through, so alerts
 * from the app and alerts about the app now arrive the same way.
 */

const PUSHOVER_URL = "https://api.pushover.net/1/messages.json";

/** Pushover truncates silently past this; we truncate visibly instead. */
const MAX_MESSAGE = 1024;
const MAX_TITLE = 250;

export type PushPriority =
  /** Quiet: no sound, respects the phone's do-not-disturb. */
  | -1
  /** Normal. */
  | 0
  /** Bypasses quiet hours. Reserve for things that need waking someone. */
  | 1;

export type PushResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string };

/**
 * Truncate with a visible marker.
 *
 * The daily digest grows with activity and will eventually exceed Pushover's
 * limit. A silently clipped digest reads as a complete one that happens to end
 * mid-sentence, which is worse than an obviously cut one — the reader cannot
 * tell whether the missing section was empty or dropped.
 */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const marker = "\n… (truncated)";
  return text.slice(0, max - marker.length) + marker;
}

export async function sendPush(
  title: string,
  message: string,
  priority: PushPriority = 0,
): Promise<PushResult> {
  const token = process.env.PUSHOVER_TOKEN?.trim();
  const user = process.env.PUSHOVER_USER_KEY?.trim();

  // Unconfigured is a skip, not a throw. Callers alert on failures; an alerting
  // path that throws when it cannot alert turns one problem into two.
  if (!token || !user) {
    return { status: "skipped", reason: "PUSHOVER_TOKEN / PUSHOVER_USER_KEY not set" };
  }

  const body = new URLSearchParams({
    token,
    user,
    title: clip(title, MAX_TITLE),
    message: clip(message, MAX_MESSAGE),
    priority: String(priority),
  });

  try {
    const res = await fetch(PUSHOVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    // Pushover answers 200 with {"status":1} on success and 4xx with a reasons
    // array. A non-2xx here is a real delivery failure and must not be reported
    // as sent — note that `status: 1` means ACCEPTED, not delivered.
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { status: "skipped", reason: `Pushover HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { status: "sent" };
  } catch (e) {
    return { status: "skipped", reason: e instanceof Error ? e.message : String(e) };
  }
}
