"use server";

import { db } from "@/db";
import { outreach, sessions, clients } from "@/db/schema";
import { sendSMS } from "@/lib/twilio";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { syncSessionToCalendar } from "@/lib/gcal-sync";

export async function markConfirmed(sessionId: number) {
  await db.update(sessions).set({ status: "confirmed" }).where(eq(sessions.id, sessionId)).run();
  syncSessionToCalendar(sessionId).catch(() => {});
  revalidatePath("/outreach");
  revalidatePath("/schedule");
}

export async function markDeclined(sessionId: number) {
  await db.update(sessions).set({ status: "cancelled" }).where(eq(sessions.id, sessionId)).run();
  syncSessionToCalendar(sessionId).catch(() => {});
  revalidatePath("/outreach");
  revalidatePath("/schedule");
}

export async function overrideStatus(sessionId: number, newStatus: string) {
  const statusMap: Record<string, string> = {
    confirmed: "confirmed",
    declined: "cancelled",
    reschedule: "proposed",
    pending: "proposed",
  };
  type SessionStatus = "proposed" | "confirmed" | "completed" | "cancelled" | "no_show";
  const sessionStatus = (statusMap[newStatus] ?? "proposed") as SessionStatus;
  await db.update(sessions).set({ status: sessionStatus }).where(eq(sessions.id, sessionId)).run();
  revalidatePath("/outreach");
  revalidatePath("/schedule");
}

export async function sendOutreachBatch(sessionIds: number[], weekOf: string) {
  const results: { sessionId: number; success: boolean; error?: string }[] = [];

  const allSessions = [];
  for (const sessionId of sessionIds) {
    const session = await db.select({
      id: sessions.id,
      clientId: sessions.clientId,
      clientName: clients.name,
      clientPhone: clients.phone,
      scheduledDate: sessions.scheduledDate,
      scheduledTime: sessions.scheduledTime,
      slot: sessions.slot,
    })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(eq(sessions.id, sessionId))
    .get();

    if (session) allSessions.push(session);
  }

  const byClient = new Map<number, typeof allSessions>();
  for (const s of allSessions) {
    const group = byClient.get(s.clientId) ?? [];
    group.push(s);
    byClient.set(s.clientId, group);
  }

  for (const [, clientSessions] of byClient) {
    const first = clientSessions[0];
    const firstName = first.clientName.split(" ")[0];
    const groupId = clientSessions.length > 1
      ? `og_${first.clientId}_${Date.now()}`
      : null;

    let message: string;
    if (clientSessions.length === 1) {
      const dayLabel = formatDay(first.scheduledDate);
      const lastCompleted = await db.select({ scheduledDate: sessions.scheduledDate, slot: sessions.slot })
        .from(sessions)
        .where(and(eq(sessions.clientId, first.clientId), eq(sessions.status, "completed")))
        .orderBy(desc(sessions.scheduledDate))
        .limit(1)
        .get();

      const isSameAsLastWeek = lastCompleted
        && formatDay(lastCompleted.scheduledDate) === dayLabel
        && lastCompleted.slot === first.slot;

      message = isSameAsLastWeek
        ? `Hey ${firstName}, same time as last week — ${dayLabel} at ${first.slot}?`
        : `Hey ${firstName}, are you free ${dayLabel} at ${first.slot} for a session?`;
    } else {
      const sorted = [...clientSessions].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
      const slotList = sorted.map((s) => `${formatDay(s.scheduledDate)} at ${s.slot}`);
      const lastItem = slotList.pop()!;
      const listText = slotList.length > 0
        ? `${slotList.join(", ")}, and ${lastItem}`
        : lastItem;

      message = `Hey ${firstName}, here's your schedule this week:\n${sorted.map((s) => `• ${formatDay(s.scheduledDate)} at ${s.slot}`).join("\n")}\nAll good, or need to change anything?`;
    }

    const now = new Date().toISOString();
    const outreachRows = [];
    for (const s of clientSessions) {
      const row = await db.insert(outreach).values({
        clientId: s.clientId,
        sessionId: s.id,
        weekOf,
        direction: "sent",
        messageText: message,
        status: "awaiting_reply",
        sentAt: now,
        outreachGroupId: groupId,
      }).returning().get();
      outreachRows.push(row);
    }

    try {
      await sendSMS(first.clientPhone, message);
      for (const s of clientSessions) {
        results.push({ sessionId: s.id, success: true });
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to send SMS to ${first.clientPhone}:`, e);
      for (const row of outreachRows) {
        await db.update(outreach).set({
          status: "pending",
          sendError: errorMsg,
        }).where(eq(outreach.id, row.id)).run();
      }
      for (const s of clientSessions) {
        results.push({ sessionId: s.id, success: false, error: errorMsg });
      }
    }
  }

  revalidatePath("/outreach");
  return results;
}

export async function retrySend(outreachId: number) {
  const record = await db.select({
    id: outreach.id,
    clientId: outreach.clientId,
    sessionId: outreach.sessionId,
    messageText: outreach.messageText,
    clientPhone: clients.phone,
  })
  .from(outreach)
  .innerJoin(clients, eq(clients.id, outreach.clientId))
  .where(eq(outreach.id, outreachId))
  .get();

  if (!record) return { success: false, error: "Record not found" };

  try {
    await sendSMS(record.clientPhone, record.messageText);
    await db.update(outreach).set({
      status: "awaiting_reply",
      sendError: null,
      sentAt: new Date().toISOString(),
    }).where(eq(outreach.id, outreachId)).run();
    revalidatePath("/outreach");
    return { success: true };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    await db.update(outreach).set({ sendError: errorMsg }).where(eq(outreach.id, outreachId)).run();
    revalidatePath("/outreach");
    return { success: false, error: errorMsg };
  }
}

function formatDay(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00Z");
  return date.toLocaleDateString("en-US", { weekday: "long" });
}
