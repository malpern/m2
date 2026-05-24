import { db } from "@/db";
import { sessions, clients } from "@/db/schema";
import { and, gte, lte, eq, ne } from "drizzle-orm";
import { listEvents, isConnected } from "@/lib/google-calendar";

type TimeSlot = "3pm" | "4pm" | "5pm" | "6pm" | "7pm";

const SLOT_TIMES: Record<TimeSlot, string> = {
  "3pm": "15:00",
  "4pm": "16:00",
  "5pm": "17:00",
  "6pm": "18:00",
  "7pm": "19:00",
};

const SLOTS: TimeSlot[] = ["3pm", "4pm", "5pm", "6pm", "7pm"];

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_LABELS: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", sunday: "Sunday",
};

function getWeekDates(weekStart: string): { day: string; date: string }[] {
  const start = new Date(weekStart + "T12:00:00");
  const days = [
    { day: "monday", offset: 0 }, { day: "tuesday", offset: 1 },
    { day: "wednesday", offset: 2 }, { day: "thursday", offset: 3 },
    { day: "friday", offset: 4 }, { day: "sunday", offset: 6 },
  ];
  return days.map(({ day, offset }) => {
    const d = new Date(start);
    d.setDate(d.getDate() + offset);
    return { day, date: d.toISOString().split("T")[0] };
  });
}

function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().split("T")[0];
}

export async function getOpenSlots(
  weekOf: string,
  excludeClientId?: number,
): Promise<{ day: string; date: string; slot: TimeSlot; time: string }[]> {
  const monday = getMondayOfWeek(weekOf);
  const weekDates = getWeekDates(monday);
  const sunday = weekDates[weekDates.length - 1].date;

  const weekSessions = await db
    .select({ date: sessions.scheduledDate, time: sessions.scheduledTime, status: sessions.status })
    .from(sessions)
    .where(and(
      gte(sessions.scheduledDate, monday),
      lte(sessions.scheduledDate, sunday),
      ne(sessions.status, "cancelled"),
    ))
    .all();

  const bookedKeys = new Set(weekSessions.map((s) => `${s.date}|${s.time}`));

  let gcalKeys = new Set<string>();
  try {
    const { connected } = await isConnected();
    if (connected) {
      const events = await listEvents("f4lathletics@gmail.com", monday, sunday);
      for (const ev of events) {
        if (!ev.start?.dateTime) continue;
        const date = ev.start.dateTime.slice(0, 10);
        const time = ev.start.dateTime.slice(11, 16);
        gcalKeys.add(`${date}|${time}`);
      }
    }
  } catch { /* ignore */ }

  const today = new Date().toISOString().split("T")[0];
  const open: { day: string; date: string; slot: TimeSlot; time: string }[] = [];

  for (const { day, date } of weekDates) {
    if (date < today) continue;
    for (const slot of SLOTS) {
      const time = SLOT_TIMES[slot];
      if (!bookedKeys.has(`${date}|${time}`) && !gcalKeys.has(`${date}|${time}`)) {
        open.push({ day, date, slot, time });
      }
    }
  }

  return open;
}

export async function rankSlotsForClient(
  clientId: number,
  openSlots: { day: string; date: string; slot: TimeSlot; time: string }[],
): Promise<{ day: string; date: string; slot: TimeSlot; time: string; score: number }[]> {
  const client = await db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!client) return openSlots.map((s) => ({ ...s, score: 0 }));

  const preferredDays: string[] = client.preferredDays ? JSON.parse(client.preferredDays) : [];

  const allSessions = await db
    .select({ date: sessions.scheduledDate, time: sessions.scheduledTime })
    .from(sessions)
    .where(eq(sessions.clientId, clientId))
    .all();

  const dayCounts = new Map<string, number>();
  const slotCounts = new Map<string, number>();
  for (const s of allSessions) {
    const d = new Date(s.date + "T12:00:00");
    const day = DAY_NAMES[d.getDay()];
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    slotCounts.set(s.time, (slotCounts.get(s.time) ?? 0) + 1);
  }
  const total = allSessions.length || 1;

  return openSlots
    .map((s) => {
      const dayFreq = (dayCounts.get(s.day) ?? 0) / total;
      const slotFreq = (slotCounts.get(s.time) ?? 0) / total;
      const isPref = preferredDays.includes(s.day) ? 0.3 : 0;
      return { ...s, score: dayFreq + slotFreq + isPref };
    })
    .sort((a, b) => b.score - a.score);
}

export function formatAlternativesMessage(
  firstName: string,
  ranked: { day: string; slot: TimeSlot }[],
  maxOptions: number = 3,
): string {
  const top = ranked.slice(0, maxOptions);
  if (top.length === 0) {
    return `No worries, ${firstName}! Unfortunately I'm fully booked this week. We'll get you in next week.`;
  }

  const options = top.map((s) => `${DAY_LABELS[s.day]} at ${s.slot}`).join(", ");
  return `No worries! I also have ${options} open. Any of those work? Or if you need to skip this week, no problem.`;
}

export async function isSlotStillOpen(date: string, time: string): Promise<boolean> {
  const existing = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(
      eq(sessions.scheduledDate, date),
      eq(sessions.scheduledTime, time),
      ne(sessions.status, "cancelled"),
    ))
    .all();

  return existing.length === 0;
}
