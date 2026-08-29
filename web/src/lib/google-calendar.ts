import { google } from "googleapis";
import { db } from "@/db";
import { googleTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getOAuth2Client, getAuthenticatedClient, getAuthenticatedClientWithEmail } from "@/lib/google-auth";

export function getAuthUrl(): { url: string; state: string } {
  const state = crypto.randomUUID();
  const oauth2 = getOAuth2Client();
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      // Without this, the userinfo lookup in handleCallback fails and the stored
      // email stays null — so nothing records WHICH account is connected.
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state,
  });
  return { url, state };
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
  } catch (e) {
    console.warn("Google OAuth email lookup failed, continuing without it:", e instanceof Error ? e.message : String(e));
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

/**
 * Whether the Google connection actually works.
 *
 * This used to return `{connected: true}` for the mere existence of a row. The
 * token expired on 2026-06-01 and the Settings badge reported "Connected" for
 * three months while every calendar read silently failed and slot conflict
 * detection quietly stopped seeing Google events. A status that reports the
 * presence of a record rather than a working credential is worse than no status.
 *
 * authenticateCore refreshes an expired token and returns null when it cannot,
 * so this now answers the question the badge claims to answer.
 */
export async function isConnected(): Promise<{ connected: boolean; email?: string; reason?: string }> {
  const stored = await db.select().from(googleTokens).get();
  if (!stored) return { connected: false, reason: "No Google account connected." };

  const auth = await getAuthenticatedClientWithEmail();
  if (!auth) {
    return {
      connected: false,
      reason: "Stored Google credentials could not be refreshed — disconnect and reconnect.",
    };
  }
  return { connected: true, email: auth.email ?? stored.email ?? undefined };
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

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? "primary";
const IS_TESTING = process.env.OUTREACH_LIVE !== "true";
const EVENT_PREFIX = "🤖 ";
const TEST_SUFFIX = IS_TESTING ? " — IGNORE JUST TESTING" : "";

export async function createCalendarEvent(
  clientName: string,
  date: string,
  startTime: string,
  opts?: { durationMinutes?: number; attendeeEmail?: string },
): Promise<string | null> {
  const auth = await getAuthenticatedClient();
  if (!auth) return null;

  const durationMinutes = opts?.durationMinutes ?? 60;
  const calendar = google.calendar({ version: "v3", auth });

  const [hours, minutes] = startTime.split(":").map(Number);
  const endHours = hours + Math.floor((minutes + durationMinutes) / 60);
  const endMinutes = (minutes + durationMinutes) % 60;
  const startStr = `${date}T${startTime}:00`;
  const endStr = `${date}T${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}:00`;

  // A calendar invite is outbound mail: Google sends it to the attendee directly,
  // so it bypasses both isDevAllowed and sendSMS. OUTREACH_LIVE previously only
  // changed the event TITLE, meaning a real client could receive an invite reading
  // "IGNORE JUST TESTING" while outreach was supposedly off. Gate the attendee
  // itself, so nothing reaches a client until outreach is deliberately enabled.
  const attendeeEmail = IS_TESTING ? undefined : opts?.attendeeEmail;
  const attendees = attendeeEmail ? [{ email: attendeeEmail }] : undefined;
  if (IS_TESTING && opts?.attendeeEmail) {
    console.log(`[DEV GUARD] Would invite ${opts.attendeeEmail} to ${clientName} on ${date}`);
  }

  const description = attendees
    ? "M2 Performance & Therapy session.\n\nTo stop receiving calendar invites, reply STOP INVITES to your scheduling text."
    : undefined;

  const res = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    sendUpdates: attendeeEmail ? "all" : "none",
    requestBody: {
      summary: `${EVENT_PREFIX}${clientName}${TEST_SUFFIX}`,
      start: { dateTime: startStr, timeZone: "America/Los_Angeles" },
      end: { dateTime: endStr, timeZone: "America/Los_Angeles" },
      ...(attendees && { attendees }),
      ...(description && { description }),
    },
  });

  return res.data.id ?? null;
}

export async function updateCalendarEventAttendee(eventId: string, email: string): Promise<boolean> {
  // Same outbound path as createCalendarEvent: patching an attendee onto an event
  // makes Google mail them. Gated for the same reason.
  if (IS_TESTING) {
    console.log(`[DEV GUARD] Would add ${email} as an attendee of event ${eventId}`);
    return false;
  }

  const auth = await getAuthenticatedClient();
  if (!auth) return false;

  const calendar = google.calendar({ version: "v3", auth });
  const existing = await calendar.events.get({ calendarId: CALENDAR_ID, eventId });
  const attendees = existing.data.attendees ?? [];
  if (!attendees.some((a) => a.email === email)) {
    attendees.push({ email });
  }
  await calendar.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    sendUpdates: "all",
    requestBody: { attendees },
  });
  return true;
}

export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  const auth = await getAuthenticatedClient();
  if (!auth) return false;

  const calendar = google.calendar({ version: "v3", auth });
  try {
    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
    return true;
  } catch (e) {
    console.error("Failed to delete Google Calendar event:", eventId, e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function disconnect() {
  await db.delete(googleTokens).run();
}
