/**
 * Confirmed opt-in for text messaging.
 *
 * Matt collects phone numbers verbally at signup. That is lawful for this kind
 * of transactional scheduling message, but it produces no artifact: nothing a
 * carrier reviewer, or we ourselves, can inspect afterwards to show a
 * particular person agreed. The A2P campaign was rejected partly on exactly
 * that ground (error 30896, "rejected because of provided Opt-in information").
 *
 * So the number Matt takes verbally is treated as permission to ask ONE
 * question, not as permission to start scheduling. The client's own reply is
 * the record. That converts "he said they agreed" into "here is the message
 * they sent, at this timestamp", which is both defensible to a reviewer and
 * genuinely safer: a misheard digit can no longer reach a stranger with
 * somebody else's training schedule.
 */

export type ConsentStatus = "unknown" | "pending" | "confirmed" | "declined";

export type ConsentDecision = { allowed: true } | { allowed: false; reason: string };

/**
 * Why messages are classified rather than gated uniformly:
 *
 *  - `scheduling` is the whole point of the app, and is what consent protects.
 *  - `consent_request` is the question itself. Gating it on consent would make
 *    consent unobtainable, so it is exempt by construction — and it is the only
 *    thing an unconfirmed client can ever receive.
 *  - `operational` is a reply to a message the client just sent us, or an alert
 *    to Micah's own phone. Neither is outreach; refusing to answer somebody who
 *    texted us would be strange, and blocking our own alerts would be a bug.
 */
export type SendPurpose = "scheduling" | "consent_request" | "operational";

/** Default deliberately: an unlabelled send is treated as the restricted kind. */
export const DEFAULT_PURPOSE: SendPurpose = "scheduling";

export function canSend(purpose: SendPurpose, status: ConsentStatus): ConsentDecision {
  if (purpose === "operational") return { allowed: true };

  if (purpose === "consent_request") {
    // Asking twice is acceptable; asking someone who already said no is not.
    if (status === "declined") {
      return { allowed: false, reason: "client has opted out of text messages" };
    }
    if (status === "confirmed") {
      return { allowed: false, reason: "client has already confirmed — no need to ask again" };
    }
    return { allowed: true };
  }

  switch (status) {
    case "confirmed":
      return { allowed: true };
    case "declined":
      return { allowed: false, reason: "client has opted out of text messages" };
    case "pending":
      return { allowed: false, reason: "waiting for the client to confirm by replying YES" };
    case "unknown":
      return { allowed: false, reason: "client has not been asked to confirm text messages yet" };
  }
}

/**
 * What a client's reply means.
 *
 * Twilio enforces STOP itself at the carrier level, so a decline may never
 * reach the app — but when it does we record it, because our own record of who
 * declined is what stops us re-asking them next month.
 *
 * Anything unrecognised returns null and is left to the normal reply handling:
 * a client answering "yes Tuesday works" is scheduling, not consent, and must
 * not be silently swallowed by this.
 */
const CONFIRM_WORDS = new Set(["yes", "y", "yeah", "yep", "yup", "start", "unstop", "confirm", "ok", "okay", "sure"]);
const DECLINE_WORDS = new Set(["no", "n", "stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout"]);

export function interpretConsentReply(body: string): "confirm" | "decline" | null {
  // Only a bare keyword counts. "no thanks, can we do Thursday?" is a
  // scheduling reply that happens to start with "no", and treating it as an
  // opt-out would silently cut a client off.
  const word = body.trim().toLowerCase().replace(/[.!,]+$/, "");
  if (CONFIRM_WORDS.has(word)) return "confirm";
  if (DECLINE_WORDS.has(word)) return "decline";
  return null;
}

/**
 * The confirmation request.
 *
 * Carries every element carriers require in an opt-in disclosure — business
 * name, message purpose, frequency, rates, STOP and HELP, and a link to the
 * privacy policy — because this message IS the disclosure. Matt's verbal ask
 * cannot be relied on to include them.
 */
export function confirmationMessage(opts?: { privacyUrl?: string }): string {
  const privacy = opts?.privacyUrl ?? "m2scheduler.com/privacy";
  return (
    "M2 Performance and Therapy: you're set up for session scheduling texts. " +
    "Reply YES to confirm. Msg frequency varies, msg & data rates may apply. " +
    `Reply STOP to opt out, HELP for help. Privacy: ${privacy}`
  );
}

export function confirmedReply(): string {
  return "Thanks! You're confirmed for session scheduling texts. Reply STOP any time to opt out.";
}

export function declinedReply(): string {
  return "No problem — you won't get scheduling texts. Matt will reach out another way.";
}
