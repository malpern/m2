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

export function getAuthUrl(): string {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
}

export async function handleCallback(code: string) {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.access_token) {
    throw new Error("Missing access token from Google");
  }

  const refreshToken = tokens.refresh_token ?? "";
  const expiresAt = new Date(tokens.expiry_date ?? Date.now() + 3600000).toISOString();

  // Try to get email, but don't fail if we can't
  let email: string | null = null;
  try {
    oauth2.setCredentials(tokens);
    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
    const userInfo = await oauth2Api.userinfo.get();
    email = userInfo.data.email ?? null;
  } catch {
    // Email lookup failed, continue without it
  }

  // Store in DB (upsert)
  const existing = await db.select().from(googleTokens).get();
  if (existing) {
    await db.update(googleTokens).set({
      accessToken: tokens.access_token,
      refreshToken: refreshToken || existing.refreshToken,
      expiresAt,
      email,
    }).where(eq(googleTokens.id, existing.id)).run();
  } else {
    await db.insert(googleTokens).values({
      accessToken: tokens.access_token,
      refreshToken: refreshToken,
      expiresAt,
      email,
    }).run();
  }

  return email;
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

  // Refresh if expired
  if (new Date(stored.expiresAt) < new Date()) {
    const { credentials } = await oauth2.refreshAccessToken();
    await db.update(googleTokens).set({
      accessToken: credentials.access_token!,
      expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600000).toISOString(),
    }).where(eq(googleTokens.id, stored.id)).run();
    oauth2.setCredentials(credentials);
  }

  return oauth2;
}

export async function isConnected(): Promise<{ connected: boolean; email?: string }> {
  const stored = await db.select().from(googleTokens).get();
  if (!stored) return { connected: false };
  return { connected: true, email: stored.email ?? undefined };
}

export async function listCalendars() {
  const auth = await getAuthenticatedClient();
  if (!auth) return [];

  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.calendarList.list();
  return res.data.items ?? [];
}

export async function listEvents(calendarId: string, startDate: string, endDate: string) {
  const auth = await getAuthenticatedClient();
  if (!auth) return [];

  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.list({
    calendarId,
    timeMin: `${startDate}T00:00:00Z`,
    timeMax: `${endDate}T23:59:59Z`,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 100,
  });
  return res.data.items ?? [];
}

export async function disconnect() {
  await db.delete(googleTokens).run();
}
