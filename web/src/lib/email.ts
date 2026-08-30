import { google } from "googleapis";
import { getAuthenticatedClientWithEmail } from "@/lib/google-auth";
import { canContact } from "@/lib/outreach-policy";

function buildRawEmail(to: string, from: string, subject: string, body: string): string {
  const lines = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body,
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

export type EmailResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string };

/**
 * Send an email as the connected Google account.
 *
 * Gated by the shared outreach policy (#242). This function previously had no
 * guard at all: it sent wherever it was pointed, and was safe only because both
 * of its callers happened to pass Micah's address. The next caller would have
 * inherited nothing.
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<EmailResult> {
  const decision = canContact({ channel: "email", address: to });
  if (!decision.allowed) {
    console.log(`[OUTREACH GUARD] Would email ${to}: "${subject}"`);
    return { status: "skipped", reason: decision.reason };
  }

  const auth = await getAuthenticatedClientWithEmail();
  if (!auth) return { status: "skipped", reason: "no Google account connected" };

  const gmail = google.gmail({ version: "v1", auth: auth.oauth2 });
  const from = auth.email ?? "noreply@m2scheduler.com";
  const raw = buildRawEmail(to, from, subject, body);

  try {
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    return { status: "sent" };
  } catch (e) {
    console.error("Failed to send email:", e);
    return { status: "skipped", reason: e instanceof Error ? e.message : String(e) };
  }
}
