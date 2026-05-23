import type { Client } from "@/db/schema";
import { sortByPriority, sortByWeightedPriority, isSchedulable, type PriorityWeights } from "./priority";

export type TimeSlot = "3pm" | "4pm" | "5pm" | "6pm" | "7pm";
export type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "sunday";

export interface ProposedSession {
  clientId: number;
  clientName: string;
  day: DayOfWeek;
  slot: TimeSlot;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
}

const SLOT_TIMES: Record<TimeSlot, string> = {
  "3pm": "15:00",
  "4pm": "16:00",
  "5pm": "17:00",
  "6pm": "18:00",
  "7pm": "19:00",
};

const SLOT_FILL_ORDER: TimeSlot[] = ["3pm", "5pm", "6pm"];

const DAYS_OF_WEEK: DayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "sunday"];

function getWeekDates(weekStart: Date): Record<DayOfWeek, string> {
  const dates: Record<string, string> = {};
  const dayOffsets: Record<DayOfWeek, number> = {
    monday: 0,
    tuesday: 1,
    wednesday: 2,
    thursday: 3,
    friday: 4,
    sunday: 6,
  };
  for (const [day, offset] of Object.entries(dayOffsets)) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + offset);
    dates[day] = d.toISOString().split("T")[0];
  }
  return dates as Record<DayOfWeek, string>;
}

function parsePreferredDays(client: Client): DayOfWeek[] {
  if (!client.preferredDays) return DAYS_OF_WEEK.filter((d) => d !== "sunday");
  try {
    return JSON.parse(client.preferredDays) as DayOfWeek[];
  } catch {
    return DAYS_OF_WEEK.filter((d) => d !== "sunday");
  }
}

const DAY_ALIASES: Record<string, DayOfWeek> = {
  mon: "monday", tue: "tuesday", wed: "wednesday",
  thu: "thursday", fri: "friday", sun: "sunday",
  monday: "monday", tuesday: "tuesday", wednesday: "wednesday",
  thursday: "thursday", friday: "friday", sunday: "sunday",
};

const SLOT_ALIASES: Record<string, TimeSlot> = {
  "3pm": "3pm", "3": "3pm", "3:00": "3pm", "15:00": "3pm",
  "4pm": "4pm", "4": "4pm", "4:00": "4pm", "16:00": "4pm",
  "5pm": "5pm", "5": "5pm", "5:00": "5pm", "17:00": "5pm",
  "6pm": "6pm", "6": "6pm", "6:00": "6pm", "18:00": "6pm",
  "7pm": "7pm", "7": "7pm", "7:00": "7pm", "19:00": "7pm",
};

function parseStandingSlot(standing: string): { day: DayOfWeek; slot: TimeSlot }[] {
  const results: { day: DayOfWeek; slot: TimeSlot }[] = [];
  const parts = standing.split(/[,;]+/).map((s) => s.trim().toLowerCase());
  for (const part of parts) {
    const tokens = part.split(/\s+/);
    if (tokens.length >= 2) {
      const day = DAY_ALIASES[tokens[0]];
      const slot = SLOT_ALIASES[tokens[1]];
      if (day && slot) results.push({ day, slot });
    }
  }
  return results;
}

function preferredSlot(client: Client): TimeSlot {
  const time = client.preferredTime?.toLowerCase() ?? "";
  if (time.includes("3")) return "3pm";
  if (time.includes("4")) return "4pm";
  if (time.includes("5")) return "5pm";
  if (time.includes("6")) return "6pm";
  if (time.includes("7")) return "7pm";
  return "5pm";
}

export function generateWeek(
  allClients: Client[],
  weekStart: Date,
  weights?: PriorityWeights,
): ProposedSession[] {
  const schedulable = allClients.filter(isSchedulable);
  const ranked = weights
    ? sortByWeightedPriority(schedulable, weights)
    : sortByPriority(schedulable);
  const weekDates = getWeekDates(weekStart);
  const proposed: ProposedSession[] = [];

  // Track filled slots: day -> slot -> clientId
  const filled = new Map<string, number>();
  const key = (day: DayOfWeek, slot: TimeSlot) => `${day}:${slot}`;

  // Track sessions assigned per client this week
  const sessionsAssigned = new Map<number, number>();

  // Pre-fill standing slots (locked clients who don't need outreach)
  for (const client of schedulable) {
    if (!client.standingSlot) continue;
    const entries = parseStandingSlot(client.standingSlot);
    for (const { day, slot } of entries) {
      if (day in weekDates && !filled.has(key(day, slot))) {
        proposed.push({
          clientId: client.id,
          clientName: client.name,
          day,
          slot,
          date: weekDates[day],
          time: SLOT_TIMES[slot],
        });
        filled.set(key(day, slot), client.id);
        sessionsAssigned.set(client.id, (sessionsAssigned.get(client.id) ?? 0) + 1);
      }
    }
  }

  // First pass: give every client their first session (skip those already at max from standing slots)
  for (const client of ranked) {
    const currentSessions = sessionsAssigned.get(client.id) ?? 0;
    if (currentSessions >= client.maxSessionsPerWeek) continue;

    const days = parsePreferredDays(client);
    const slot = preferredSlot(client);

    let placed = false;

    // Try preferred days + preferred slot
    for (const day of days) {
      if (!filled.has(key(day, slot))) {
        proposed.push({
          clientId: client.id,
          clientName: client.name,
          day,
          slot,
          date: weekDates[day],
          time: SLOT_TIMES[slot],
        });
        filled.set(key(day, slot), client.id);
        sessionsAssigned.set(client.id, 1);
        placed = true;
        break;
      }
    }

    if (placed) continue;

    // Try preferred days with slot cascade (3pm -> 5pm -> 6pm)
    for (const day of days) {
      for (const altSlot of SLOT_FILL_ORDER) {
        if (!filled.has(key(day, altSlot))) {
          proposed.push({
            clientId: client.id,
            clientName: client.name,
            day,
            slot: altSlot,
            date: weekDates[day],
            time: SLOT_TIMES[altSlot],
          });
          filled.set(key(day, altSlot), client.id);
          sessionsAssigned.set(client.id, 1);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    if (placed) continue;

    // Try any day, any slot
    for (const day of DAYS_OF_WEEK) {
      for (const altSlot of SLOT_FILL_ORDER) {
        if (!filled.has(key(day, altSlot))) {
          proposed.push({
            clientId: client.id,
            clientName: client.name,
            day,
            slot: altSlot,
            date: weekDates[day],
            time: SLOT_TIMES[altSlot],
          });
          filled.set(key(day, altSlot), client.id);
          sessionsAssigned.set(client.id, 1);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
  }

  // Second pass: give college-bound athletes with max >= 2 a second session
  for (const client of ranked) {
    if (!client.collegeBound || client.maxSessionsPerWeek < 2) continue;
    if ((sessionsAssigned.get(client.id) ?? 0) >= 2) continue;

    const days = parsePreferredDays(client);
    const slot = preferredSlot(client);
    const assignedDays = proposed
      .filter((p) => p.clientId === client.id)
      .map((p) => p.day);

    for (const day of days) {
      if (assignedDays.includes(day)) continue;
      const trySlots = [slot, ...SLOT_FILL_ORDER.filter((s) => s !== slot)];
      for (const s of trySlots) {
        if (!filled.has(key(day, s))) {
          proposed.push({
            clientId: client.id,
            clientName: client.name,
            day,
            slot: s,
            date: weekDates[day],
            time: SLOT_TIMES[s],
          });
          filled.set(key(day, s), client.id);
          sessionsAssigned.set(client.id, 2);
          break;
        }
      }
      if ((sessionsAssigned.get(client.id) ?? 0) >= 2) break;
    }
  }

  return proposed;
}

export function getMonday(date: Date = new Date()): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}
