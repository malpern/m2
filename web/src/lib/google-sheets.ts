import { google } from "googleapis";
import { getAuthenticatedClient } from "@/lib/google-auth";

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
