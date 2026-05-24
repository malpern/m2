import { db } from "@/db";
import { clients, sessions, outreach } from "@/db/schema";
import { eq, and, gte, lte, ne } from "drizzle-orm";
import { getMonday } from "@/lib/scheduler";
import { buildOutreachQueue, getOutreachSummary } from "@/lib/outreach-engine";
import { MissionControl } from "./mission-control";

export const dynamic = "force-dynamic";

export default async function LiveOutreachPage() {
  const monday = getMonday();
  const weekStart = monday.toISOString().split("T")[0];
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const weekEnd = sunday.toISOString().split("T")[0];

  const weekSessions = await db
    .select({
      id: sessions.id,
      clientId: sessions.clientId,
      clientName: clients.name,
      clientPhone: clients.phone,
      standingSlot: clients.standingSlot,
      packageId: sessions.packageId,
      scheduledDate: sessions.scheduledDate,
      scheduledTime: sessions.scheduledTime,
      slot: sessions.slot,
      status: sessions.status,
      sessionType: sessions.sessionType,
      gcalEventId: sessions.gcalEventId,
      loggedToSheets: sessions.loggedToSheets,
      reconciled: sessions.reconciled,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(and(gte(sessions.scheduledDate, weekStart), lte(sessions.scheduledDate, weekEnd)))
    .all();

  const weekOutreach = await db
    .select()
    .from(outreach)
    .where(eq(outreach.weekOf, weekStart))
    .all();

  const items = buildOutreachQueue(weekSessions, weekOutreach);
  const summary = getOutreachSummary(items);

  const allMessages = weekOutreach.map((o) => ({
    id: o.id,
    clientId: o.clientId,
    sessionId: o.sessionId,
    direction: o.direction,
    messageText: o.messageText,
    sentAt: o.sentAt,
    repliedAt: o.repliedAt,
  }));

  // Open slots for the mini calendar
  const bookedSlots = weekSessions
    .filter((s) => s.status !== "cancelled")
    .map((s) => ({ date: s.scheduledDate, slot: s.slot }));

  const SLOTS = ["3pm", "4pm", "5pm", "6pm", "7pm"];
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const date = d.toISOString().split("T")[0];
    const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
    if (dayName === "Sat") continue;
    const slots = SLOTS.map((slot) => ({
      slot,
      booked: bookedSlots.some((b) => b.date === date && b.slot === slot),
    }));
    days.push({ date, dayName, slots });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
      <MissionControl
        items={items}
        summary={summary}
        messages={allMessages}
        weekDays={days}
        weekOf={weekStart}
      />
    </div>
  );
}
