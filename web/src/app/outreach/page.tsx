import { db } from "@/db";
import { clients, sessions, outreach } from "@/db/schema";
import { eq, and, gte, lte, isNotNull } from "drizzle-orm";
import { getMonday } from "@/lib/scheduler";
import {
  buildOutreachQueue,
  getNextBatchToSend,
  getNeedsMattAttention,
  getOutreachSummary,
} from "@/lib/outreach-engine";
import { OutreachWithMessages } from "./outreach-with-messages";

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
  const nextBatch = getNextBatchToSend(items);
  const needsAttention = getNeedsMattAttention(items);

  const billingErrors = await db
    .select({ id: outreach.id })
    .from(outreach)
    .where(eq(outreach.sendError, "ai_billing_exhausted"))
    .all();
  const hasAiBillingError = billingErrors.length > 0;

  // All messages for the Messages tab
  const allMessages = await db
    .select({
      id: outreach.id,
      clientId: outreach.clientId,
      clientName: clients.name,
      direction: outreach.direction,
      messageText: outreach.messageText,
      interpretation: outreach.interpretation,
      status: outreach.status,
      sentAt: outreach.sentAt,
      repliedAt: outreach.repliedAt,
    })
    .from(outreach)
    .innerJoin(clients, eq(clients.id, outreach.clientId))
    .all();

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <OutreachWithMessages
        outreachProps={{
          items,
          summary,
          nextBatch,
          needsAttention,
          weekOf: weekStart,
          hasAiBillingError,
        }}
        messages={allMessages}
      />
    </div>
  );
}
