import twilio from "twilio";
import { canContact, canContactSms } from "./outreach-policy";
import { canSend, DEFAULT_PURPOSE, type SendPurpose, type ConsentStatus } from "./sms-consent";

let _client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!_client) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set");
    }
    _client = twilio(sid, token);
  }
  return _client;
}

/**
 * Kept as the name every call site already uses, but the policy now lives in one
 * place shared with email and calendar invites (#242) rather than being an
 * SMS-only allowlist that the other channels did not consult.
 */
export function isDevAllowed(phone: string | null): phone is string {
  return canContactSms(phone);
}

/**
 * The outcome of an attempted send.
 *
 * This is a discriminated union on purpose. sendSMS used to return the bare
 * string "DEV_SKIPPED" when a number was blocked, which RESOLVES —
 * so a skip was indistinguishable from a delivery to every caller, including
 * the ones that only guard against a throw. Callers that record "sent" before
 * awaiting the result therefore recorded messages that were never sent, and
 * follow-ups later cancelled those sessions for going unanswered. Anything
 * that can be mistaken for a successful send will eventually be mistaken for
 * one, so the type no longer allows it.
 */

/**
 * Look up a recipient's consent by phone.
 *
 * Lazily imported so importing this module does not require a database —
 * `next build` collects routes without credentials, and twilio's own unit tests
 * mock the transport rather than standing one up.
 *
 * A number matching no client is treated as `unknown`, which blocks scheduling.
 * That is the safe direction: an unrecognised number is exactly the case where
 * we should not be sending somebody's training schedule.
 */
async function lookupConsent(phone: string): Promise<ConsentStatus> {
  try {
    const { findClient } = await import("./sms-handlers/shared");
    const client = await findClient(phone);
    if (client) return client.smsConsentStatus as ConsentStatus;
    // Not a client's own number — but it may be a parent's, whose consent
    // lives only in the events keyed by the number.
    const { phoneStatus } = await import("./consent");
    return phoneStatus(phone);
  } catch (e) {
    console.error("Consent lookup failed; refusing to send:", e);
    return "unknown";
  }
}

export type SendResult =
  | { status: "sent"; sid: string }
  | { status: "skipped"; reason: string };

/**
 * `purpose` decides whether the recipient's confirmed opt-in is required. It
 * defaults to `scheduling`, the restricted kind, so a call site that forgets to
 * say what it is sending gets the SAFE behaviour. There are fourteen call
 * sites, and the lesson of #227 is that a rule which must be remembered at each
 * of them is a rule that will be missed at one.
 *
 * `consent` is supplied by callers that already loaded the client; when it is
 * omitted for a scheduling message the status is looked up here, because "the
 * caller forgot" must not mean "no check happened".
 */
export async function sendSMS(
  to: string | null,
  body: string,
  opts?: { purpose?: SendPurpose; consent?: ConsentStatus },
): Promise<SendResult> {
  const purpose = opts?.purpose ?? DEFAULT_PURPOSE;
  // A client with no number on file is a skip, not an error. Callers already
  // handle `skipped` correctly (#227) — they demote the outreach row instead of
  // recording a message that never went out — so "no phone" flows through the
  // same path as any other refusal rather than needing its own check at 40 sites.
  const decision = canContact({ channel: "sms", address: to });
  // The `|| !to` is redundant at runtime — canContact already rejects a missing
  // address — but it is what narrows `to` to string for the rest of the function,
  // which is better than asserting it with a non-null `!`.
  if (!decision.allowed || !to) {
    console.log(`[OUTREACH GUARD] Would text ${to ?? "(no number)"}: "${body.slice(0, 80)}..."`);
    return {
      status: "skipped",
      reason: decision.allowed ? "no phone number on file" : decision.reason,
    };
  }
  // Consent is checked AFTER the allowlist so a blocked number reports the
  // allowlist reason, which is the more useful of the two while outreach is
  // still in testing.
  const status: ConsentStatus =
    opts?.consent ?? (purpose === "scheduling" ? await lookupConsent(to) : "unknown");
  const consentDecision = canSend(purpose, status);
  if (!consentDecision.allowed) {
    console.log(`[CONSENT GUARD] Would text ${to}: "${body.slice(0, 60)}..." — ${consentDecision.reason}`);
    return { status: "skipped", reason: consentDecision.reason };
  }

  // There used to be a TWILIO_USE_WHATSAPP switch here that routed every
  // message through Twilio's WhatsApp sandbox. It was a May-2026 testing relic,
  // and the first live verification text after the A2P campaign was approved
  // went out through the sandbox and failed (63015) because the switch was
  // still on in production. A sandbox toggle must not be able to hijack
  // production sends, so the only path now is SMS from the registered number.
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) throw new Error("TWILIO_PHONE_NUMBER must be set");
  const toNumber = to;

  const statusCallback = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio`
    : undefined;

  const message = await getClient().messages.create({
    body,
    from,
    to: toNumber,
    ...(statusCallback && { statusCallback }),
  });
  return { status: "sent", sid: message.sid };
}
