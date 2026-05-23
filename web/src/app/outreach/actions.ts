"use server";

import { db } from "@/db";
import { outreach, sessions, clients } from "@/db/schema";
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

    await db.insert(outreach).values({
      clientId: session.clientId,
      sessionId: session.id,
      weekOf,
      direction: "sent",
      messageText: message,
      status: "awaiting_reply",
      sentAt: new Date().toISOString(),
    }).run();

    // TODO: Call iMessage bridge API to actually send
    // await fetch("http://localhost:8787/send", { method: "POST", body: JSON.stringify({ phone: session.clientPhone, message }) });
  }

  revalidatePath("/outreach");
}

function formatDay(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", { weekday: "long" });
}
