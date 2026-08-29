import twilio from "twilio";

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

const USE_WHATSAPP = process.env.TWILIO_USE_WHATSAPP === "true";
const WHATSAPP_SANDBOX = "whatsapp:+14155238886";

const DEV_ALLOWED_PHONES = new Set(["+14082099509"]);

export function isDevAllowed(phone: string): boolean {
  if (process.env.NODE_ENV === "production" && process.env.OUTREACH_LIVE === "true") return true;
  return DEV_ALLOWED_PHONES.has(phone);
}

/**
 * The outcome of an attempted send.
 *
 * This is a discriminated union on purpose. sendSMS used to return the bare
 * string "DEV_SKIPPED" when the dev guard blocked a number, which RESOLVES —
 * so a skip was indistinguishable from a delivery to every caller, including
 * the ones that only guard against a throw. Callers that record "sent" before
 * awaiting the result therefore recorded messages that were never sent, and
 * follow-ups later cancelled those sessions for going unanswered. Anything
 * that can be mistaken for a successful send will eventually be mistaken for
 * one, so the type no longer allows it.
 */
export type SendResult =
  | { status: "sent"; sid: string }
  | { status: "skipped"; reason: string };

export async function sendSMS(to: string, body: string): Promise<SendResult> {
  if (!isDevAllowed(to)) {
    console.log(`[DEV GUARD] Would send to ${to}: "${body.slice(0, 80)}..."`);
    return {
      status: "skipped",
      reason: "dev guard: number not on the allowlist and OUTREACH_LIVE is not enabled",
    };
  }
  const from = USE_WHATSAPP
    ? WHATSAPP_SANDBOX
    : process.env.TWILIO_PHONE_NUMBER;

  if (!from) throw new Error("TWILIO_PHONE_NUMBER must be set");

  const toNumber = USE_WHATSAPP ? `whatsapp:${to}` : to;

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
