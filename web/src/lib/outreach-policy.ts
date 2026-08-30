/**
 * The single answer to "may we contact this person?" (#242).
 *
 * Before this, that question was answered three different ways: SMS consulted a
 * phone allowlist, calendar invites consulted only the `OUTREACH_LIVE` boolean,
 * and email consulted nothing at all. So "outreach is off" was true of one
 * channel, approximate for the second, and false for the third.
 *
 * The distinction that matters is WHO, not just whether. A boolean cannot express
 * "deliver to Micah so he can test the real thing, and to nobody else" — flipping
 * it to test an invite would simultaneously open SMS to every client. This module
 * makes the allowlist the primitive and the live/testing switch a modifier on it,
 * so realistic testing and a hard guarantee are not in tension.
 *
 * Every outbound path must ask this and nothing else. If a fourth channel is ever
 * added, it asks here too.
 */

/** Recipients reachable while outreach is off. */
const DEFAULT_TEST_PHONES = ["+14082099509"];
const DEFAULT_TEST_EMAILS = ["malpern@gmail.com"];

/**
 * Extra test recipients, comma-separated, phones and emails mixed:
 *
 *   OUTREACH_TEST_RECIPIENTS="+14155550123, someone@example.com"
 *
 * Additive to the defaults, so adding a second tester does not need a code
 * deploy — and cannot accidentally REMOVE the built-in ones.
 */
const EXTRA_ENV_VAR = "OUTREACH_TEST_RECIPIENTS";

export type Channel = "sms" | "email";

export type Recipient = { channel: Channel; address: string | null | undefined };

export type ContactDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

/** Live means "reach real clients". Requires production AND an explicit opt-in. */
export function isOutreachLive(): boolean {
  return process.env.NODE_ENV === "production" && process.env.OUTREACH_LIVE === "true";
}

/**
 * Compare phones on their last 10 digits.
 *
 * Numbers reach us in several shapes — E.164 from the schema, "(408) 209-9509"
 * from a form, "whatsapp:+1..." from Twilio — and an allowlist that only matched
 * one of them would fail open in exactly the confusing direction. This is the
 * same last-10 rule `findClient` already uses for inbound matching.
 */
function phoneKey(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function emailKey(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return e.includes("@") ? e : null;
}

function parseExtras(): { phones: string[]; emails: string[] } {
  const raw = process.env[EXTRA_ENV_VAR];
  const phones: string[] = [];
  const emails: string[] = [];
  if (!raw) return { phones, emails };
  for (const part of raw.split(",").map((p) => p.trim()).filter(Boolean)) {
    if (part.includes("@")) emails.push(part);
    else phones.push(part);
  }
  return { phones, emails };
}

/** The current test allowlist, resolved fresh so env changes are picked up. */
export function testRecipients(): { phones: string[]; emails: string[] } {
  const extra = parseExtras();
  return {
    phones: [...DEFAULT_TEST_PHONES, ...extra.phones],
    emails: [...DEFAULT_TEST_EMAILS, ...extra.emails],
  };
}

/**
 * May we contact this recipient right now?
 *
 * Returns a reason rather than a bare boolean so callers can record WHY nothing
 * was sent — a skipped send that records itself as delivered is the bug #227 was
 * about, and a silent `false` invites the same mistake.
 */
export function canContact({ channel, address }: Recipient): ContactDecision {
  if (!address || !address.trim()) {
    return { allowed: false, reason: `no ${channel === "sms" ? "phone number" : "email address"} on file` };
  }

  const key = channel === "sms" ? phoneKey(address) : emailKey(address);
  if (!key) {
    return { allowed: false, reason: `"${address}" is not a usable ${channel} address` };
  }

  if (isOutreachLive()) return { allowed: true };

  const list = testRecipients();
  const allowed =
    channel === "sms"
      ? list.phones.some((p) => phoneKey(p) === key)
      : list.emails.some((e) => emailKey(e) === key);

  if (allowed) return { allowed: true };

  return {
    allowed: false,
    reason: `outreach is not live and this ${channel} address is not on the test allowlist`,
  };
}

/**
 * Convenience predicate for call sites that only branch.
 *
 * A type predicate because it rejects null: callers that guard on it are then
 * holding a real address and should not have to re-assert that.
 */
export function canContactSms(phone: string | null | undefined): phone is string {
  return canContact({ channel: "sms", address: phone }).allowed;
}

export function canContactEmail(email: string | null | undefined): email is string {
  return canContact({ channel: "email", address: email }).allowed;
}
