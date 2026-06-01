import { google } from "googleapis";
import { getAuthenticatedClient } from "@/lib/google-auth";


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

