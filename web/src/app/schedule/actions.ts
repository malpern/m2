"use server";

import { db } from "@/db";
import { clients, sessions, outreach, prioritySettings, defaultAvailability, weeklyOverrides } from "@/db/schema";
import { sendSMS } from "@/lib/twilio";
import { eq, and, gte, lte, lt, ne } from "drizzle-orm";
import { generateWeek, getMonday, type LastWeekSession, type AvailabilitySlot, type DayOfWeek, type TimeSlot } from "@/lib/scheduler";
import { DEFAULT_WEIGHTS } from "@/lib/priority";
import { revalidatePath } from "next/cache";

const ALL_DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export async function generateSchedule(weekStartISO: string) {
  const weekStart = new Date(weekStartISO);
  const allClients = await db.select().from(clients).all();

  const savedWeights = await db.select().from(prioritySettings).get();
  const weights = savedWeights
    ? { collegeBoundWeight: savedWeights.collegeBoundWeight, gradeLevelWeight: savedWeights.gradeLevelWeight, effortWeight: savedWeights.effortWeight }
    : DEFAULT_WEIGHTS;

  // Get last week's sessions for continuity
  const prevMonday = new Date(weekStart);
  prevMonday.setDate(prevMonday.getDate() - 7);
  const prevSunday = new Date(prevMonday);
  prevSunday.setDate(prevSunday.getDate() + 6);
  const prevStart = prevMonday.toISOString().split("T")[0];
  const prevEnd = prevSunday.toISOString().split("T")[0];

  const prevSessions = await db.select({ clientId: sessions.clientId, date: sessions.scheduledDate, slot: sessions.slot })
    .from(sessions)
    .where(and(
      gte(sessions.scheduledDate, prevStart),
      lte(sessions.scheduledDate, prevEnd),
      ne(sessions.status, "cancelled"),
    ))
    .all();

  const lastWeekSessions: LastWeekSession[] = prevSessions.map((s) => {
    const d = new Date(s.date + "T12:00:00");
    const dayIdx = d.getDay();
    return {
      clientId: s.clientId,
      day: ALL_DAY_NAMES[dayIdx] as DayOfWeek,
      slot: s.slot as TimeSlot,
    };
  });

  // Get availability (defaults + weekly overrides)
  const defaults = await db.select().from(defaultAvailability).all();
  const overrides = await db.select().from(weeklyOverrides)
    .where(eq(weeklyOverrides.weekOf, weekStartISO))
    .all();

  const availMap = new Map<string, boolean>();
  for (const d of defaults) {
    availMap.set(`${d.day}:${d.slot}`, d.enabled);
  }
  for (const o of overrides) {
    availMap.set(`${o.day}:${o.slot}`, o.enabled);
  }

  const availability: AvailabilitySlot[] = [];
  for (const [k, enabled] of availMap) {
    const [day, slot] = k.split(":");
    availability.push({ day: day as DayOfWeek, slot: slot as TimeSlot, enabled });
  }

  // Auto-complete confirmed sessions from before today (not today — end of day)
  const today = new Date().toISOString().split("T")[0];
  const pastConfirmed = await db.select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.status, "confirmed"), lt(sessions.scheduledDate, today)))
    .all();
  if (pastConfirmed.length > 0) {
    for (const s of pastConfirmed) {
      await db.update(sessions).set({ status: "completed" }).where(eq(sessions.id, s.id)).run();
    }
  }

  const proposed = generateWeek(allClients, weekStart, weights, lastWeekSessions, availability);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const startStr = weekStart.toISOString().split("T")[0];
  const endStr = weekEnd.toISOString().split("T")[0];

  await db.delete(sessions)
    .where(
      and(
        eq(sessions.status, "proposed"),
        gte(sessions.scheduledDate, startStr),
        lte(sessions.scheduledDate, endStr)
      )
    )
    .run();

  for (const p of proposed) {
    await db.insert(sessions)
      .values({
        clientId: p.clientId,
        scheduledDate: p.date,
        scheduledTime: p.time,
        slot: p.slot,
        status: "proposed",
      })
      .run();
  }

  revalidatePath("/schedule");
}

export async function updateSessionTime(
  sessionId: number,
  newDate: string,
  newTime: string,
) {
  const hour = parseInt(newTime.split(":")[0]);
  const slotMap: Record<number, string> = { 15: "3pm", 16: "4pm", 17: "5pm", 18: "6pm", 19: "7pm" };
  type Slot = "3pm" | "4pm" | "5pm" | "6pm" | "7pm";
  const slot = (slotMap[hour] ?? "5pm") as Slot;

  await db.update(sessions)
    .set({ scheduledDate: newDate, scheduledTime: newTime, slot })
    .where(eq(sessions.id, sessionId))
    .run();

  revalidatePath("/schedule");
}

export async function addManualSession(clientId: number, date: string, time: string) {
  const hour = parseInt(time.split(":")[0]);
  const slotMap: Record<number, string> = { 10: "3pm", 11: "3pm", 12: "5pm", 13: "5pm", 14: "5pm", 15: "3pm", 16: "4pm", 17: "5pm", 18: "6pm", 19: "7pm" };
  type Slot = "3pm" | "4pm" | "5pm" | "6pm" | "7pm";
  const slot = (slotMap[hour] ?? "5pm") as Slot;

  await db.insert(sessions).values({
    clientId,
    scheduledDate: date,
    scheduledTime: time,
    slot,
    status: "confirmed",
  }).run();

  revalidatePath("/schedule");
}

export async function confirmSession(sessionId: number) {
  await db.update(sessions)
    .set({ status: "confirmed" })
    .where(eq(sessions.id, sessionId))
    .run();
  revalidatePath("/schedule");
}

export async function cancelSession(sessionId: number) {
  await db.update(sessions)
    .set({ status: "cancelled" })
    .where(eq(sessions.id, sessionId))
    .run();
  revalidatePath("/schedule");
}

export async function deleteSession(sessionId: number) {
  await db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  revalidatePath("/schedule");
}

export async function markNoShow(sessionId: number) {
  const session = await db.select({ clientId: sessions.clientId }).from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return;

  await db.update(sessions).set({ status: "no_show" }).where(eq(sessions.id, sessionId)).run();

  const client = await db.select({ noShowCount: clients.noShowCount }).from(clients).where(eq(clients.id, session.clientId)).get();
  if (client) {
    await db.update(clients).set({ noShowCount: (client.noShowCount ?? 0) + 1 }).where(eq(clients.id, session.clientId)).run();
  }

  revalidatePath("/schedule");
  revalidatePath("/clients");
}

export async function queueNotification(sessionId: number, message: string) {
  const session = await db
    .select({
      clientId: sessions.clientId,
      clientName: clients.name,
      clientPhone: clients.phone,
      scheduledDate: sessions.scheduledDate,
      scheduledTime: sessions.scheduledTime,
    })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(eq(sessions.id, sessionId))
    .get();

  if (!session) return;

  await db.insert(outreach).values({
    clientId: session.clientId,
    sessionId,
    weekOf: session.scheduledDate,
    direction: "sent",
    messageText: message,
    status: "pending",
    sentAt: new Date().toISOString(),
  }).run();

  try {
    await sendSMS(session.clientPhone, message);
  } catch (e) {
    console.error(`Failed to send SMS to ${session.clientPhone}:`, e);
  }

  revalidatePath("/schedule");
  revalidatePath("/outreach");
}

