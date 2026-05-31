import { db } from "@/db";
import { clients, sessions, outreach, weeklySkips } from "@/db/schema";
import { eq, and, gte, lte, isNotNull } from "drizzle-orm";
import { getMonday } from "@/lib/scheduler";
import {
  buildOutreachQueue,
  getNextBatchToSend,
  getNeedsMattAttention,
  getNeedsFollowUp,
  getOutreachSummary,
} from "@/lib/outreach-engine";
import { OutreachWithMessages } from "./outreach-with-messages";

export const dynamic = "force-dynamic";

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const monday = params.week
    ? getMonday(new Date(params.week + "T12:00:00"))
    : getMonday();
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

  const skips = await db
    .select({
      id: weeklySkips.id,
      clientId: weeklySkips.clientId,
      clientName: clients.name,
      reason: weeklySkips.reason,
    })
    .from(weeklySkips)
    .innerJoin(clients, eq(clients.id, weeklySkips.clientId))
    .where(eq(weeklySkips.weekOf, weekStart))
    .all();

  const skippedClientIds = new Set(skips.map((s) => s.clientId));

  const allItems = buildOutreachQueue(weekSessions, weekOutreach);
  const items = allItems.filter((i) => !skippedClientIds.has(i.clientId));
  const skippedItems = allItems.filter((i) => skippedClientIds.has(i.clientId));
  const summary = getOutreachSummary(items);
  const nextBatch = getNextBatchToSend(items);
  const needsAttention = getNeedsMattAttention(items);
  const followUpItems = getNeedsFollowUp(items);

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

  const currentMonday = getMonday();
  const currentWeekOf = currentMonday.toISOString().split("T")[0];

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <OutreachWithMessages
        outreachProps={{
          items,
          summary,
          nextBatch,
          needsAttention,
          followUpItems,
          skippedItems,
          weekOf: weekStart,
          currentWeekOf,
          hasAiBillingError,
        }}
        messages={allMessages}
      />
    </div>
  );
}
