import { db } from "@/db";
import { clients, sessions, outreach } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getMonday } from "@/lib/scheduler";
import {
  buildOutreachQueue,
  getNextBatchToSend,
  getNeedsMattAttention,
  getOutreachSummary,
} from "@/lib/outreach-engine";
import { OutreachDashboard } from "./outreach-dashboard";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
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
  const nextBatch = getNextBatchToSend(items);
  const needsAttention = getNeedsMattAttention(items);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <OutreachDashboard
        items={items}
        summary={summary}
        nextBatch={nextBatch}
        needsAttention={needsAttention}
        weekOf={weekStart}
      />
    </div>
  );
}
