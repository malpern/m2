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

  return oauth2;
}

export async function listSpreadsheets(query?: string) {
  const auth = await getAuthenticatedClient();
  if (!auth) return [];

  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.spreadsheet'${query ? ` and name contains '${query}'` : ""}`,
    fields: "files(id, name)",
    pageSize: 20,
  });
  return res.data.files ?? [];
}

export async function readSheet(spreadsheetId: string, range: string) {
  const auth = await getAuthenticatedClient();
  if (!auth) return [];

  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return res.data.values ?? [];
}

export async function getSheetNames(spreadsheetId: string) {
  const auth = await getAuthenticatedClient();
  if (!auth) return [];

  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  return res.data.sheets?.map((s) => s.properties?.title ?? "") ?? [];
}
