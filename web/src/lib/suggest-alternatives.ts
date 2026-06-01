import { db } from "@/db";
import { sessions, clients, outreach, defaultAvailability, weeklyOverrides } from "@/db/schema";
import { and, gte, lte, eq, ne } from "drizzle-orm";
import { listEvents, isConnected } from "@/lib/google-calendar";
import { OUTREACH_DEFAULTS } from "./outreach-config";
import { syslog } from "./logger";
import { SLOT_TIMES, DAY_NAMES_BY_INDEX, DAY_LABELS, type TimeSlot } from "./constants";

const SLOTS: TimeSlot[] = ["3pm", "4pm", "5pm", "6pm", "7pm"];

function getWeekDates(weekStart: string): { day: string; date: string }[] {
  const start = new Date(weekStart + "T12:00:00Z");
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
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().split("T")[0];
}

const OFFERED_SLOTS_TAG = "[offered:";

export function tagOfferedSlots(
  message: string,
  slots: { date: string; slot: string }[],
): string {
  if (slots.length === 0) return message;
  const tags = slots.map((s) => `${s.date}|${s.slot}`).join(",");
  return `${message}\n${OFFERED_SLOTS_TAG}${tags}]`;
}

function parseOfferedSlots(messageText: string): Set<string> {
  const keys = new Set<string>();
  const match = messageText.match(/\[offered:([^\]]+)\]/);
  if (!match) return keys;
  for (const pair of match[1].split(",")) {
    keys.add(pair.trim());
  }
  return keys;
}

async function getPendingOfferKeys(weekOf: string, excludeClientId?: number): Promise<Set<string>> {
  const monday = getMondayOfWeek(weekOf);
  const allOutreach = await db.select().from(outreach).where(eq(outreach.weekOf, monday)).all();

  const pendingKeys = new Set<string>();
  const clientsSent = new Map<number, { sentAt: string; messageText: string }[]>();
  const clientsReplied = new Set<number>();

  for (const o of allOutreach) {
    if (o.direction === "sent" && o.messageText.includes(OFFERED_SLOTS_TAG)) {
      if (!clientsSent.has(o.clientId)) clientsSent.set(o.clientId, []);
      clientsSent.get(o.clientId)!.push({ sentAt: o.sentAt ?? "", messageText: o.messageText });
    }
    if (o.direction === "received") {
      clientsReplied.add(o.clientId);
    }
  }

  const expireMs = OUTREACH_DEFAULTS.moveOnAfterMinutes * 60 * 1000;
  const now = Date.now();

  for (const [clientId, messages] of clientsSent) {
    if (excludeClientId && clientId === excludeClientId) continue;

    const latestOffer = messages.sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
    const sentTime = new Date(latestOffer.sentAt).getTime();
    const expired = (now - sentTime) > expireMs;
    if (expired) continue;

    const hasRepliedAfter = allOutreach.some(
      (o) => o.clientId === clientId && o.direction === "received" &&
        (o.repliedAt ?? "") > latestOffer.sentAt
    );
    if (hasRepliedAfter) continue;

    const offered = parseOfferedSlots(latestOffer.messageText);
    for (const key of offered) pendingKeys.add(key);
  }

  return pendingKeys;
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
      const events = await listEvents(process.env.GOOGLE_CALENDAR_EMAIL ?? "f4lathletics@gmail.com", monday, sunday);
      for (const ev of events) {
        if (!ev.start?.dateTime) continue;
        const date = ev.start.dateTime.slice(0, 10);
        const time = ev.start.dateTime.slice(11, 16);
        gcalKeys.add(`${date}|${time}`);
      }
    }
  } catch (e) {
    syslog.warn("system", "Google Calendar check failed — proceeding without it", `GCal listEvents error: ${e instanceof Error ? e.message : String(e)}`);
  }

  const pendingOffers = await getPendingOfferKeys(weekOf, excludeClientId);

  const defaults = await db.select().from(defaultAvailability).all();
  const overrides = await db.select().from(weeklyOverrides).where(eq(weeklyOverrides.weekOf, monday)).all();
  const availMap = new Map<string, boolean>();
  for (const d of defaults) availMap.set(`${d.day}:${d.slot}`, d.enabled);
  for (const o of overrides) availMap.set(`${o.day}:${o.slot}`, o.enabled);

  const today = new Date().toISOString().split("T")[0];
  const open: { day: string; date: string; slot: TimeSlot; time: string }[] = [];

  for (const { day, date } of weekDates) {
    if (date < today) continue;
    for (const slot of SLOTS) {
      const availKey = `${day}:${slot}`;
      if (availMap.has(availKey) && !availMap.get(availKey)) continue;

      const time = SLOT_TIMES[slot];
      const key = `${date}|${time}`;
      if (!bookedKeys.has(key) && !gcalKeys.has(key) && !pendingOffers.has(`${date}|${slot}`)) {
        open.push({ day, date, slot, time });
      }
    }
  }

  return open;
}

export type SlotUnavailableReason = "not_a_slot" | "not_available" | "booked" | "gcal_conflict" | "already_offered";

export async function whySlotUnavailable(
  weekOf: string,
  day: string | null,
  time: string | null,
): Promise<SlotUnavailableReason> {
  if (!time || !SLOTS.includes(time as TimeSlot)) return "not_a_slot";

  const slot = time as TimeSlot;
  if (!day) return "not_a_slot";

  const monday = getMondayOfWeek(weekOf);

  const defaults = await db.select().from(defaultAvailability).all();
  const overrides = await db.select().from(weeklyOverrides).where(eq(weeklyOverrides.weekOf, monday)).all();
  const availMap = new Map<string, boolean>();
  for (const d of defaults) availMap.set(`${d.day}:${d.slot}`, d.enabled);
  for (const o of overrides) availMap.set(`${o.day}:${o.slot}`, o.enabled);

  const availKey = `${day}:${slot}`;
  if (availMap.has(availKey) && !availMap.get(availKey)) return "not_available";

  return "booked";
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
    const d = new Date(s.date + "T12:00:00Z");
    const day = DAY_NAMES_BY_INDEX[d.getDay()];
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

export function diversifyAcrossDays<T extends { day: string }>(
  ranked: T[],
  maxOptions: number = 3,
): T[] {
  if (ranked.length <= maxOptions) return ranked;

  const picked: T[] = [];
  const usedDays = new Set<string>();

  for (const slot of ranked) {
    if (picked.length >= maxOptions) break;
    if (!usedDays.has(slot.day)) {
      picked.push(slot);
      usedDays.add(slot.day);
    }
  }

  for (const slot of ranked) {
    if (picked.length >= maxOptions) break;
    if (!picked.includes(slot)) {
      picked.push(slot);
    }
  }

  return picked;
}

export function formatAlternativesMessage(
  firstName: string,
  ranked: { day: string; slot: TimeSlot }[],
  maxOptions: number = 3,
): string {
  const top = diversifyAcrossDays(ranked, maxOptions);
  if (top.length === 0) {
    return `No worries, ${firstName}! Unfortunately I'm fully booked this week. We'll get you in next week.`;
  }

  const options = formatGroupedSlots(top);
  return `No worries! I also have ${options} open. Any of those work? Or if you need to skip this week, no problem.`;
}

function formatGroupedSlots(slots: { day: string; slot: TimeSlot }[]): string {
  const slotOrder = SLOTS as readonly string[];
  const grouped = new Map<string, TimeSlot[]>();
  for (const s of slots) {
    const existing = grouped.get(s.day) ?? [];
    existing.push(s.slot);
    grouped.set(s.day, existing);
  }

  const parts: string[] = [];
  for (const [day, times] of grouped) {
    const sorted = times.sort((a, b) => slotOrder.indexOf(a) - slotOrder.indexOf(b));
    const label = DAY_LABELS[day] ?? day;
    if (sorted.length === 1) {
      parts.push(`${label} at ${sorted[0]}`);
    } else {
      const last = sorted.pop()!;
      parts.push(`${label} at ${sorted.join(", ")}, or ${last}`);
    }
  }
  return parts.join(", ");
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

export async function tryBookSlot(
  sessionId: number,
  date: string,
  time: string,
  slot: string,
  status: "proposed" | "confirmed" = "proposed",
): Promise<boolean> {
  const existing = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(
      eq(sessions.scheduledDate, date),
      eq(sessions.scheduledTime, time),
      ne(sessions.status, "cancelled"),
      ne(sessions.id, sessionId),
    ))
    .all();

  if (existing.length > 0) return false;

  await db.update(sessions).set({
    scheduledDate: date,
    scheduledTime: time,
    slot: slot as "3pm" | "4pm" | "5pm" | "6pm" | "7pm",
    status,
  }).where(eq(sessions.id, sessionId)).run();

  return true;
}
