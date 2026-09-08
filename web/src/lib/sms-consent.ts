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
 * The words the client agreed to on the signup form, versioned.
 *
 * Every `signed_up` event records which version was on the page, so the
 * wording can change later without orphaning the records made under the old
 * one. Bump the version whenever CONSENT_LABEL changes in substance.
 */
export const CONSENT_TEXT_VERSION = "v1";

export const CONSENT_LABEL =
  "I agree to receive text messages from M2 Performance and Therapy about scheduling my " +
  "training sessions at the number above. Message frequency varies. Message and data rates " +
  "may apply. Reply STOP at any time to opt out, or HELP for help. Texting is optional and " +
  "not required to train with M2.";

export const GUARDIAN_CONSENT_LABEL =
  "I am the parent or guardian of the athlete named above. I agree that M2 Performance and Therapy " +
  "may send text messages about scheduling their training sessions to the athlete's number above, " +
  "and to my own number above. Message frequency varies. Message and data rates may apply. Reply STOP " +
  "at any time to opt out, or HELP for help. Texting is optional and not required to train with M2.";

const DEFAULT_PRIVACY = "m2scheduler.com/privacy";
export const SIGNUP_PATH = "/text-signup";

/**
 * The verification text sent once after a form signup.
 *
 * Carries every element carriers require in an opt-in disclosure — business
 * name, purpose, frequency, rates, STOP and HELP, and the privacy link — so it
 * stands alone as a record even if the form is ever redesigned.
 */
export function confirmationMessage(opts?: { privacyUrl?: string }): string {
  const privacy = opts?.privacyUrl ?? DEFAULT_PRIVACY;
  return (
    "M2 Performance and Therapy: you signed up for session scheduling texts at m2scheduler.com. " +
    "Reply YES to confirm this is your number. Msg frequency varies, msg & data rates may apply. " +
    `Reply STOP to opt out, HELP for help. Privacy: ${privacy}`
  );
}

/**
 * The verification text for a parent or guardian's own number. They did not
 * sign themselves up for training, so the text says why it arrived.
 */
export function guardianConfirmationMessage(athleteFirstName: string, opts?: { privacyUrl?: string }): string {
  const privacy = opts?.privacyUrl ?? DEFAULT_PRIVACY;
  return (
    `M2 Performance and Therapy: you signed ${athleteFirstName} up for session scheduling texts at m2scheduler.com ` +
    "and gave this number as the parent or guardian. Reply YES to confirm we may text you here too. " +
    `Msg frequency varies, msg & data rates may apply. Reply STOP to opt out, HELP for help. Privacy: ${privacy}`
  );
}

export function confirmedReply(): string {
  return "Thanks! You're confirmed for session scheduling texts from M2 Performance and Therapy. Reply STOP any time to opt out.";
}

export function declinedReply(): string {
  return "No problem — you won't get scheduling texts from M2. Matt will reach out another way.";
}

/** A known client texted START or YES on their own: confirmed on the spot. */
export function keywordConfirmedReply(opts?: { privacyUrl?: string }): string {
  const privacy = opts?.privacyUrl ?? DEFAULT_PRIVACY;
  return (
    "M2 Performance and Therapy: you're confirmed for session scheduling texts. " +
    "Msg frequency varies, msg & data rates may apply. Reply STOP to opt out, HELP for help. " +
    `Privacy: ${privacy}`
  );
}

/** START from a number we do not have: point at the form, store nothing. */
export function unknownNumberReply(): string {
  return (
    "This number is for M2 Performance and Therapy scheduling texts. " +
    `To sign up, visit m2scheduler.com${SIGNUP_PATH}. Msg & data rates may apply. Reply STOP to opt out.`
  );
}

export function helpReply(contactPhone: string, opts?: { privacyUrl?: string }): string {
  const privacy = opts?.privacyUrl ?? DEFAULT_PRIVACY;
  return (
    "M2 Performance & Therapy — session scheduling texts. Reply STOP to opt out, START to opt in. " +
    `Contact: ${contactPhone}. Privacy: ${privacy}`
  );
}
