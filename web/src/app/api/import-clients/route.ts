import { NextResponse } from "next/server";
import { db } from "@/db";
import { clients, packages, sessions, outreach } from "@/db/schema";
import { readSheet } from "@/lib/google-sheets";
import { listEvents } from "@/lib/google-calendar";

const SPREADSHEET_ID = "109w4fOCcwmudr5Os2Rk20mdcxbVhGZB6BNMaM8q0GCo";
const SESSIONS_2026_TAB = "Sales & Sessions Completed 2026";

function normalizeName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function extractClientName(calendarSummary: string): string | null {
  const cleaned = calendarSummary.replace(/\s*\(.*?\)\s*/g, "").trim();
  if (!cleaned || cleaned.split(/\s+/).length > 4) return null;
  if (/^(lunch|meeting|call|block|off|busy|hold)/i.test(cleaned)) return null;
  return normalizeName(cleaned);
}

async function getSheetClients(): Promise<Map<string, { sessions2026: number; lastDate: string }>> {
  const rows = await readSheet(SPREADSHEET_ID, `'${SESSIONS_2026_TAB}'`);
  if (!rows.length) return new Map();

  const clientMap = new Map<string, { sessions2026: number; lastDate: string }>();

  for (const row of rows.slice(1)) {
    const date = row[0]?.trim();
    const name = row[1]?.trim();
    if (!name || !date || !/\d/.test(date)) continue;

    const normalized = normalizeName(name);
    const existing = clientMap.get(normalized);
    if (existing) {
      existing.sessions2026++;
      if (date > existing.lastDate) existing.lastDate = date;
    } else {
      clientMap.set(normalized, { sessions2026: 1, lastDate: date });
    }
  }

  return clientMap;
}

async function getCalendarClients(): Promise<Set<string>> {
  const now = new Date();
  const fourWeeksAgo = new Date(now);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const twoWeeksAhead = new Date(now);
  twoWeeksAhead.setDate(twoWeeksAhead.getDate() + 14);

  const start = fourWeeksAgo.toISOString().split("T")[0];
  const end = twoWeeksAhead.toISOString().split("T")[0];

  const events = await listEvents("f4lathletics@gmail.com", start, end);
  const names = new Set<string>();

  for (const event of events) {
    if (!event.summary) continue;
    const name = extractClientName(event.summary);
    if (name) names.add(name);
  }

  return names;
}

export async function GET() {
  try {
    const [sheetClients, calendarNames] = await Promise.all([
      getSheetClients(),
      getCalendarClients(),
    ]);

    const merged: Array<{
      name: string;
      inSheets: boolean;
      inCalendar: boolean;
      sessions2026: number;
      lastDate: string;
    }> = [];

    const allNames = new Set([...sheetClients.keys(), ...calendarNames]);

    for (const name of allNames) {
      const sheetData = sheetClients.get(name);
      merged.push({
        name,
        inSheets: sheetClients.has(name),
        inCalendar: calendarNames.has(name),
        sessions2026: sheetData?.sessions2026 ?? 0,
        lastDate: sheetData?.lastDate ?? "",
      });
    }

    merged.sort((a, b) => {
      if (a.inSheets && a.inCalendar && !(b.inSheets && b.inCalendar)) return -1;
      if (b.inSheets && b.inCalendar && !(a.inSheets && a.inCalendar)) return 1;
      return b.sessions2026 - a.sessions2026;
    });

    const existingClients = await db.select().from(clients).all();

    return NextResponse.json({
      preview: merged,
      existingCount: existingClients.length,
      sheetsCount: sheetClients.size,
      calendarCount: calendarNames.size,
    });
  } catch (error) {
    console.error("Import preview error:", error);
    return NextResponse.json(
      { error: "Failed to fetch client data from Google" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { selectedNames } = body as { selectedNames: string[] };

    if (!selectedNames?.length) {
      return NextResponse.json({ error: "No clients selected" }, { status: 400 });
    }

    await db.delete(outreach).run();
    await db.delete(sessions).run();
    await db.delete(packages).run();
    await db.delete(clients).run();

    const inserted = await db
      .insert(clients)
      .values(
        selectedNames.map((name, i) => ({
          name,
          phone: "+15550000000",
          category: "active" as const,
          googleSheetsName: name,
          sortOrder: i,
          maxSessionsPerWeek: 1,
          behaviorScore: 5,
        }))
      )
      .returning()
      .all();

    for (const client of inserted) {
      await db
        .insert(packages)
        .values({
          clientId: client.id,
          totalSessions: 10,
          sessionsUsed: 0,
        })
        .run();
    }

    return NextResponse.json({
      imported: inserted.length,
      clients: inserted.map((c) => ({ id: c.id, name: c.name })),
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Failed to import clients" },
      { status: 500 }
    );
  }
}
