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

export async function sendSMS(to: string, body: string): Promise<string> {
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
  return message.sid;
}
