"use server";

import { db } from "@/db";
import { outreach, sessions, clients } from "@/db/schema";
import { sendSMS } from "@/lib/twilio";
import { eq, and, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function markConfirmed(sessionId: number) {
  await db.update(sessions).set({ status: "confirmed" }).where(eq(sessions.id, sessionId)).run();
  revalidatePath("/outreach");
  revalidatePath("/schedule");
}

export async function markDeclined(sessionId: number) {
  await db.update(sessions).set({ status: "cancelled" }).where(eq(sessions.id, sessionId)).run();
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

    if (!session) continue;

    const message = `Hey ${session.clientName.split(" ")[0]}, are you free ${formatDay(session.scheduledDate)} at ${session.slot} for a session?`;

    const row = await db.insert(outreach).values({
      clientId: session.clientId,
      sessionId: session.id,
      weekOf,
      direction: "sent",
      messageText: message,
      status: "awaiting_reply",
      sentAt: new Date().toISOString(),
    }).returning().get();

    try {
      await sendSMS(session.clientPhone, message);
      results.push({ sessionId, success: true });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to send SMS to ${session.clientPhone}:`, e);
      await db.update(outreach).set({
        status: "pending",
        sendError: errorMsg,
      }).where(eq(outreach.id, row.id)).run();
      results.push({ sessionId, success: false, error: errorMsg });
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
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", { weekday: "long" });
}
