"use server";

import { db } from "@/db";
import { clients, sessions, outreach } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { generateWeek, getMonday } from "@/lib/scheduler";
import { revalidatePath } from "next/cache";

export async function generateSchedule(weekStartISO: string) {
  const weekStart = new Date(weekStartISO);
  const allClients = db.select().from(clients).all();
  const proposed = generateWeek(allClients, weekStart);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const startStr = weekStart.toISOString().split("T")[0];
  const endStr = weekEnd.toISOString().split("T")[0];

  db.delete(sessions)
    .where(
      and(
        eq(sessions.status, "proposed"),
        gte(sessions.scheduledDate, startStr),
        lte(sessions.scheduledDate, endStr)
      )
    )
    .run();

  for (const p of proposed) {
    db.insert(sessions)
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

  db.update(sessions)
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

  db.insert(sessions).values({
    clientId,
    scheduledDate: date,
    scheduledTime: time,
    slot,
    status: "confirmed",
  }).run();

  revalidatePath("/schedule");
}

export async function confirmSession(sessionId: number) {
  db.update(sessions)
    .set({ status: "confirmed" })
    .where(eq(sessions.id, sessionId))
    .run();
  revalidatePath("/schedule");
}

export async function cancelSession(sessionId: number) {
  db.update(sessions)
    .set({ status: "cancelled" })
    .where(eq(sessions.id, sessionId))
    .run();
  revalidatePath("/schedule");
}

export async function deleteSession(sessionId: number) {
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  revalidatePath("/schedule");
}

export async function queueNotification(sessionId: number, message: string) {
  const session = db
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

  db.insert(outreach).values({
    clientId: session.clientId,
    sessionId,
    weekOf: session.scheduledDate,
    direction: "sent",
    messageText: message,
    status: "pending",
    sentAt: new Date().toISOString(),
  }).run();

  // TODO: Call iMessage bridge API to send
  // await fetch("http://localhost:8787/send", { method: "POST", body: JSON.stringify({ phone: session.clientPhone, message }) });

  revalidatePath("/schedule");
  revalidatePath("/outreach");
}

export async function exportICS(weekStartISO: string): Promise<string> {
  const weekStart = new Date(weekStartISO);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const weekSessions = db
    .select({
      id: sessions.id,
      clientId: sessions.clientId,
      clientName: clients.name,
      scheduledDate: sessions.scheduledDate,
      scheduledTime: sessions.scheduledTime,
      status: sessions.status,
    })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(
      and(
        gte(sessions.scheduledDate, weekStart.toISOString().split("T")[0]),
        lte(sessions.scheduledDate, weekEnd.toISOString().split("T")[0])
      )
    )
    .all()
    .filter((s) => s.status === "confirmed" || s.status === "proposed");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//M2 Performance//Matt Scheduler//EN",
    "CALSCALE:GREGORIAN",
  ];

  for (const s of weekSessions) {
    const [year, month, day] = s.scheduledDate.split("-");
    const [hour, min] = s.scheduledTime.split(":");
    const startHour = parseInt(hour);
    const endHour = startHour + 1;
    const dtStart = `${year}${month}${day}T${hour}${min}00`;
    const dtEnd = `${year}${month}${day}T${String(endHour).padStart(2, "0")}${min}00`;

    lines.push(
      "BEGIN:VEVENT",
      `DTSTART;TZID=America/Los_Angeles:${dtStart}`,
      `DTEND;TZID=America/Los_Angeles:${dtEnd}`,
      `SUMMARY:Training - ${s.clientName}`,
      `DESCRIPTION:${s.status === "confirmed" ? "Confirmed" : "Proposed"} session`,
      `UID:matt-scheduler-${s.id}@m2`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
