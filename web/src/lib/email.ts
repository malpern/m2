import { google } from "googleapis";
import { db } from "@/db";
import { googleTokens } from "@/db/schema";
import { eq } from "drizzle-orm";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/auth/callback`
  );
}

async function getAuthenticatedClient() {
  const stored = await db.select().from(googleTokens).get();
  if (!stored) return null;

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    expiry_date: new Date(stored.expiresAt).getTime(),
  });

  if (new Date(stored.expiresAt) < new Date()) {
    const { credentials } = await oauth2.refreshAccessToken();
    await db.update(googleTokens).set({
      accessToken: credentials.access_token!,
      expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600000).toISOString(),
    }).where(eq(googleTokens.id, stored.id)).run();
    oauth2.setCredentials(credentials);
  }

  return { oauth2, email: stored.email };
}

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
  const auth = await getAuthenticatedClient();
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
