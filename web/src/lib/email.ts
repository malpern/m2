import { google } from "googleapis";
import { getAuthenticatedClientWithEmail } from "@/lib/google-auth";

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

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<boolean> {
  const auth = await getAuthenticatedClientWithEmail();
  if (!auth) return false;

  const gmail = google.gmail({ version: "v1", auth: auth.oauth2 });
  const from = auth.email ?? "noreply@m2scheduler.com";
  const raw = buildRawEmail(to, from, subject, body);

  try {
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    return true;
  } catch (e) {
    console.error("Failed to send email:", e);
    return false;
  }
}
