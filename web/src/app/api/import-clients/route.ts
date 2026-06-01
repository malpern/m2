import { NextResponse } from "next/server";
import { db } from "@/db";
import { clients, packages, sessions, outreach } from "@/db/schema";
import { readSheet } from "@/lib/google-sheets";
import { listEvents } from "@/lib/google-calendar";
import { DAY_NAMES_BY_INDEX } from "@/lib/constants";

const SPREADSHEET_ID = "109w4fOCcwmudr5Os2Rk20mdcxbVhGZB6BNMaM8q0GCo";
const SESSIONS_2026_TAB = "Sales & Sessions Completed 2026";
const CLIENT_INFO_TAB = "Client Information";

// Non-client calendar entries: personal events, family activities, business ops.
// Matched case-insensitively against normalized names.
const BLOCKED_NAMES = new Set([
  "Melody Gymnastics",
  "Melody Swim",
  "Syd Bridal Shower",
  "Grammy Can't Pick Up",
  "Car Show Sfhs",
  "Oscar Senior Night",
  "Marcus Soccer",
  "Marcus Haircut",
  "Matt Haircut",
  "Date Night",
  "Mother's Day @ Woodhaven",
  "M2 Cleaning",
  "Semi Group",
  "Semi-group",
  "Mc",
  "James La Crosse",
].map((n) => n.toLowerCase()));

// Calendar names that map to a different canonical Sheets name.
const CALENDAR_ALIASES: Record<string, string> = {
  "Mm-colin Hyrne": "Colin Hyrne",
  "Elena Itskovich": "Elena Itskovi",
  "Sunbin And Andrew": "Andrew & Sunbin",
  "Andrew And Sunbin": "Andrew & Sunbin",
  "Dhruv And Krish": "Dhruv Gupta",
  "Chuck And Eileen Ma": "Chuck Ma",
  "Maariyah Alizai": "Maariyah Alazai",
};

function normalizeName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function isBlockedName(name: string): boolean {
  const lower = name.toLowerCase();
  if (BLOCKED_NAMES.has(lower)) return true;
  // Pattern-based filters for recurring junk categories
  if (/\b(haircut|gymnastics|swim|soccer|lacrosse|bridal|wedding)\b/i.test(name)) return true;
  if (/\b(cleaning|date night|senior night|pick up|mother.?s day|father.?s day)\b/i.test(name)) return true;
  if (/^(semi[- ]?group|mc)$/i.test(name)) return true;
  if (/semiprivate training|ypt performance/i.test(name)) return true;
  return false;
}

function resolveCalendarAlias(name: string): string {
  for (const [alias, canonical] of Object.entries(CALENDAR_ALIASES)) {
    if (normalizeName(alias) === name) return canonical;
  }
  return name;
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
  const normalized = normalizeName(cleaned);
  if (isBlockedName(normalized)) return null;
  return resolveCalendarAlias(normalized);
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

type CalendarSession = {
  date: string;
  time: string;
  dayOfWeek: string;
  durationMin: number;
};

type CalendarClientData = {
  sessions: CalendarSession[];
  preferredDays: string[];
  preferredTime: string;
};


function formatHour(hour: number, min: number): string {
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  const suffix = hour >= 12 ? "pm" : "am";
  return min === 0 ? `${h}${suffix}` : `${h}:${String(min).padStart(2, "0")}${suffix}`;
}

async function getCalendarHistory(): Promise<Map<string, CalendarClientData>> {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - 12);

  const allEvents: { summary: string; startRaw: string; endRaw: string | null; durationMin: number }[] = [];
  const cursor = new Date(start);
  while (cursor < now) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + 13);
    if (chunkEnd > now) chunkEnd.setTime(now.getTime());

    const s = cursor.toISOString().split("T")[0];
    const e = chunkEnd.toISOString().split("T")[0];
    const events = await listEvents("f4lathletics@gmail.com", s, e);

    for (const ev of events) {
      if (!ev.summary || !ev.start?.dateTime) continue;
      const startMs = new Date(ev.start.dateTime).getTime();
      const endMs = ev.end?.dateTime ? new Date(ev.end.dateTime).getTime() : startMs + 3600000;
      allEvents.push({
        summary: ev.summary,
        startRaw: ev.start.dateTime,
        endRaw: ev.end?.dateTime ?? null,
        durationMin: Math.round((endMs - startMs) / 60000),
      });
    }

    cursor.setDate(cursor.getDate() + 14);
  }

  const clientMap = new Map<string, CalendarClientData>();

  for (const { summary, startRaw, durationMin } of allEvents) {
    const name = extractClientName(summary);
    if (!name) continue;

    // Extract local date/time directly from ISO string to avoid UTC conversion
    const localDate = startRaw.slice(0, 10);
    const localTime = startRaw.slice(11, 16);
    const [year, month, day] = localDate.split("-").map(Number);
    const localDt = new Date(year, month - 1, day);
    const dayOfWeek = DAY_NAMES_BY_INDEX[localDt.getDay()];

    const session: CalendarSession = {
      date: localDate,
      time: localTime,
      dayOfWeek,
      durationMin,
    };

    if (!clientMap.has(name)) {
      clientMap.set(name, { sessions: [], preferredDays: [], preferredTime: "" });
    }
    clientMap.get(name)!.sessions.push(session);
  }

  for (const [, data] of clientMap) {
    const dayCounts = new Map<string, number>();
    const timeCounts = new Map<string, number>();

    for (const s of data.sessions) {
      dayCounts.set(s.dayOfWeek, (dayCounts.get(s.dayOfWeek) ?? 0) + 1);
      const hour = parseInt(s.time.split(":")[0]);
      const min = parseInt(s.time.split(":")[1]);
      const timeSlot = formatHour(hour, min);
      timeCounts.set(timeSlot, (timeCounts.get(timeSlot) ?? 0) + 1);
    }

    const total = data.sessions.length;
    const threshold = Math.max(2, total * 0.2);

    data.preferredDays = [...dayCounts.entries()]
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([day]) => day);

    const topTime = [...timeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topTime && topTime[1] >= threshold) {
      data.preferredTime = topTime[0];
    }
  }

  return clientMap;
}

export type ImportPreviewClient = {
  name: string;
  inSheets: boolean;
  inCalendar: boolean;
  sessions2026: number;
  calendarSessions: number;
  lastDate: string;
  rate: number | null;
  sessionType: "individual" | "dual" | "group";
  lastPackage: string;
  packageSize: number;
  hasDue: boolean;
  parentGuardian: string | null;
  email: string | null;
  preferredDays: string[];
  preferredTime: string;
  history: { date: string; dayOfWeek: string; time: string }[];
};

export async function GET() {
  try {
    const [sheetClients, calendarData, clientInfo] = await Promise.all([
      getSheetClients(),
      getCalendarHistory(),
      getClientInfo(),
    ]);

    const merged: ImportPreviewClient[] = [];
    const allNames = new Set([...sheetClients.keys(), ...calendarData.keys()]);

    for (const name of allNames) {
      if (isBlockedName(name)) continue;
      if (!sheetClients.has(name)) continue;

      const sheetData = sheetClients.get(name);
      const calData = calendarData.get(name);
      const info = clientInfo.get(name);

      merged.push({
        name,
        inSheets: sheetClients.has(name),
        inCalendar: calendarData.has(name),
        sessions2026: sheetData?.sessions2026 ?? 0,
        calendarSessions: calData?.sessions.length ?? 0,
        lastDate: sheetData?.lastDate ?? "",
        rate: sheetData?.rate ?? null,
        sessionType: sheetData?.sessionType ?? "individual",
        lastPackage: sheetData?.lastPackage ?? "",
        packageSize: sheetData?.packageSize ?? 1,
        hasDue: sheetData?.hasDue ?? false,
        parentGuardian: info?.parentGuardian ?? null,
        email: info?.email ?? null,
        preferredDays: calData?.preferredDays ?? [],
        preferredTime: calData?.preferredTime ?? "",
        history: (calData?.sessions ?? [])
          .map((s) => ({ date: s.date, dayOfWeek: s.dayOfWeek, time: s.time }))
          .sort((a, b) => b.date.localeCompare(a.date)),
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
      calendarCount: calendarData.size,
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

    const fourMonthsAgo = new Date();
    fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
    const cutoff = fourMonthsAgo.toISOString().split("T")[0];

    const calendarData = await getCalendarHistory();

    const { inserted, totalSessions } = await db.transaction(async (tx) => {
      await tx.delete(outreach).run();
      await tx.delete(sessions).run();
      await tx.delete(packages).run();
      await tx.delete(clients).run();

      const ins = await tx
        .insert(clients)
        .values(
          selectedClients.map((c, i) => ({
            name: c.name,
            phone: "+15550000000",
            category: (c.lastDate && c.lastDate >= cutoff ? "active" : "inactive") as "active" | "inactive",
            googleSheetsName: c.name,
            sessionRate: c.rate,
            sessionType: c.sessionType,
            parentGuardian: c.parentGuardian,
            email: c.email,
            sortOrder: i,
            maxSessionsPerWeek: c.sessionType === "group" ? 0 : 1,
            behaviorScore: 5,
            preferredDays: c.preferredDays.length > 0 ? JSON.stringify(c.preferredDays) : null,
            preferredTime: c.preferredTime || null,
          }))
        )
        .returning()
        .all();

      let sessCount = 0;

      for (let i = 0; i < ins.length; i++) {
        const client = ins[i];
        const preview = selectedClients[i];
        const pkgSize = preview.packageSize > 1 ? preview.packageSize : 10;

        const pkgMatch = preview.lastPackage.match(/(\d+)\s*of\s*(\d+)/);
        const sessionsUsed = pkgMatch ? parseInt(pkgMatch[1]) : 0;

        await tx
          .insert(packages)
          .values({
            clientId: client.id,
            totalSessions: pkgSize,
            sessionsUsed: Math.min(sessionsUsed, pkgSize),
            pricePerSession: preview.rate,
            status: "active" as const,
          })
          .run();

        const calSessions = calendarData.get(preview.name)?.sessions ?? [];
        if (calSessions.length > 0) {
          for (const s of calSessions) {
            const hour = parseInt(s.time.split(":")[0]);
            const slotMap: Record<number, "3pm" | "4pm" | "5pm" | "6pm" | "7pm"> = {
              15: "3pm", 16: "4pm", 17: "5pm", 18: "6pm", 19: "7pm",
            };
            const slot = slotMap[hour] ?? (hour < 15 ? "3pm" : "7pm");

            await tx
              .insert(sessions)
              .values({
                clientId: client.id,
                scheduledDate: s.date,
                scheduledTime: s.time,
                slot,
                status: "completed" as const,
                sessionType: preview.sessionType === "dual" ? "group" : preview.sessionType,
              })
              .run();
          }
          sessCount += calSessions.length;
        }
      }

      return { inserted: ins, totalSessions: sessCount };
    });

    return NextResponse.json({
      imported: inserted.length,
      totalSessions,
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
