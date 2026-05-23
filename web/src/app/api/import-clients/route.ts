import { NextResponse } from "next/server";
import { db } from "@/db";
import { clients, packages, sessions, outreach } from "@/db/schema";
import { readSheet } from "@/lib/google-sheets";
import { listEvents } from "@/lib/google-calendar";

const SPREADSHEET_ID = "109w4fOCcwmudr5Os2Rk20mdcxbVhGZB6BNMaM8q0GCo";
const SESSIONS_2026_TAB = "Sales & Sessions Completed 2026";
const CLIENT_INFO_TAB = "Client Information";

function normalizeName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function parseDollars(raw: string): number | null {
  const match = raw?.replace(/,/g, "").match(/\$?([\d.]+)/);
  return match ? Math.round(parseFloat(match[1]) * 100) : null;
}

function classifySessionType(name: string, price: number | null): "individual" | "dual" | "group" {
  if (/semiprivate|group|class|performance class/i.test(name)) return "group";
  if (/&|and /i.test(name) && price && price > 20000) return "dual";
  if (/&|and /i.test(name)) return "dual";
  return "individual";
}

function extractClientName(calendarSummary: string): string | null {
  const cleaned = calendarSummary.replace(/\s*\(.*?\)\s*/g, "").trim();
  if (!cleaned || cleaned.split(/\s+/).length > 4) return null;
  if (/^(lunch|meeting|call|block|off|busy|hold)/i.test(cleaned)) return null;
  return normalizeName(cleaned);
}

type SheetClient = {
  sessions2026: number;
  lastDate: string;
  rate: number | null;
  sessionType: "individual" | "dual" | "group";
  lastPackage: string;
  packageSize: number;
  packagesCompleted: number;
  hasDue: boolean;
};

async function getSheetClients(): Promise<Map<string, SheetClient>> {
  const rows = await readSheet(SPREADSHEET_ID, `'${SESSIONS_2026_TAB}'`);
  if (!rows.length) return new Map();

  const clientMap = new Map<string, SheetClient>();

  for (const row of rows.slice(1)) {
    const date = row[0]?.trim();
    const name = row[1]?.trim();
    const price = row[4]?.trim();
    const pkg = row[3]?.trim();
    const payment = row[5]?.trim();
    if (!name || !date || !/\d/.test(date)) continue;

    const normalized = normalizeName(name);
    const priceCents = parseDollars(price);

    const pkgMatch = pkg?.match(/(\d+)\s*of\s*(\d+)/);
    const pkgCurrent = pkgMatch ? parseInt(pkgMatch[1]) : 0;
    const pkgTotal = pkgMatch ? parseInt(pkgMatch[2]) : 1;

    const existing = clientMap.get(normalized);
    if (existing) {
      existing.sessions2026++;
      if (date > existing.lastDate) existing.lastDate = date;
      if (priceCents) existing.rate = priceCents;
      if (pkg) existing.lastPackage = pkg;
      if (pkgTotal > 1) existing.packageSize = pkgTotal;
      if (pkgCurrent === pkgTotal && pkgTotal > 1) existing.packagesCompleted++;
      if (payment?.toUpperCase().includes("DUE")) existing.hasDue = true;
    } else {
      clientMap.set(normalized, {
        sessions2026: 1,
        lastDate: date,
        rate: priceCents,
        sessionType: classifySessionType(name, priceCents),
        lastPackage: pkg || "",
        packageSize: pkgTotal,
        packagesCompleted: pkgCurrent === pkgTotal && pkgTotal > 1 ? 1 : 0,
        hasDue: payment?.toUpperCase().includes("DUE") ?? false,
      });
    }
  }

  return clientMap;
}

type ClientInfo = {
  parentGuardian: string | null;
  phone: string | null;
  email: string | null;
  sport: string | null;
};

async function getClientInfo(): Promise<Map<string, ClientInfo>> {
  const rows = await readSheet(SPREADSHEET_ID, `'${CLIENT_INFO_TAB}'`);
  if (!rows.length) return new Map();

  const infoMap = new Map<string, ClientInfo>();
  for (const row of rows.slice(1)) {
    const first = row[0]?.trim();
    const last = row[1]?.trim();
    if (!first) continue;

    const fullName = normalizeName(`${first} ${last || ""}`);
    infoMap.set(fullName, {
      parentGuardian: row[2]?.trim() || null,
      phone: row[4]?.trim() || null,
      email: row[5]?.trim() || null,
      sport: row[9]?.trim() || null,
    });
  }
  return infoMap;
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

export type ImportPreviewClient = {
  name: string;
  inSheets: boolean;
  inCalendar: boolean;
  sessions2026: number;
  lastDate: string;
  rate: number | null;
  sessionType: "individual" | "dual" | "group";
  lastPackage: string;
  packageSize: number;
  hasDue: boolean;
  parentGuardian: string | null;
  email: string | null;
};

export async function GET() {
  try {
    const [sheetClients, calendarNames, clientInfo] = await Promise.all([
      getSheetClients(),
      getCalendarClients(),
      getClientInfo(),
    ]);

    const merged: ImportPreviewClient[] = [];
    const allNames = new Set([...sheetClients.keys(), ...calendarNames]);
    const skipPatterns = /semiprivate|youth semiprivate|ypt performance/i;

    for (const name of allNames) {
      if (skipPatterns.test(name)) continue;

      const sheetData = sheetClients.get(name);
      const info = clientInfo.get(name);

      merged.push({
        name,
        inSheets: sheetClients.has(name),
        inCalendar: calendarNames.has(name),
        sessions2026: sheetData?.sessions2026 ?? 0,
        lastDate: sheetData?.lastDate ?? "",
        rate: sheetData?.rate ?? null,
        sessionType: sheetData?.sessionType ?? "individual",
        lastPackage: sheetData?.lastPackage ?? "",
        packageSize: sheetData?.packageSize ?? 1,
        hasDue: sheetData?.hasDue ?? false,
        parentGuardian: info?.parentGuardian ?? null,
        email: info?.email ?? null,
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
    const { selectedClients } = body as { selectedClients: ImportPreviewClient[] };

    if (!selectedClients?.length) {
      return NextResponse.json({ error: "No clients selected" }, { status: 400 });
    }

    await db.delete(outreach).run();
    await db.delete(sessions).run();
    await db.delete(packages).run();
    await db.delete(clients).run();

    const inserted = await db
      .insert(clients)
      .values(
        selectedClients.map((c, i) => ({
          name: c.name,
          phone: "+15550000000",
          category: "active" as const,
          googleSheetsName: c.name,
          sessionRate: c.rate,
          sessionType: c.sessionType,
          parentGuardian: c.parentGuardian,
          email: c.email,
          sortOrder: i,
          maxSessionsPerWeek: c.sessionType === "group" ? 0 : 1,
          behaviorScore: 5,
        }))
      )
      .returning()
      .all();

    for (let i = 0; i < inserted.length; i++) {
      const client = inserted[i];
      const preview = selectedClients[i];
      const pkgSize = preview.packageSize > 1 ? preview.packageSize : 10;

      const pkgMatch = preview.lastPackage.match(/(\d+)\s*of\s*(\d+)/);
      const sessionsUsed = pkgMatch ? parseInt(pkgMatch[1]) : 0;

      await db
        .insert(packages)
        .values({
          clientId: client.id,
          totalSessions: pkgSize,
          sessionsUsed: Math.min(sessionsUsed, pkgSize),
          pricePerSession: preview.rate,
          status: preview.hasDue ? "unpaid" as const : "active" as const,
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
