import { db } from "@/db";
import { outreach, sessions, clients } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { deleteCalendarEvent, isConnected } from "./google-calendar";

export async function resetTestClient(clientId: number) {
  const { connected } = await isConnected();

  if (connected) {
    const evts = await db.select({ id: sessions.id, gcalEventId: sessions.gcalEventId })
      .from(sessions)
      .where(and(eq(sessions.clientId, clientId), gte(sessions.scheduledDate, "2026-06-01")))
      .all();

    for (const e of evts) {
      if (e.gcalEventId) {
        try {
          await deleteCalendarEvent(e.gcalEventId);
        } catch { /* already deleted */ }
      }
    }
  }

  await db.delete(outreach).where(eq(outreach.clientId, clientId)).run();
  await db.delete(sessions).where(and(eq(sessions.clientId, clientId), gte(sessions.scheduledDate, "2026-06-01"))).run();
  await db.update(clients).set({ email: null, calendarInviteOptIn: null }).where(eq(clients.id, clientId)).run();
}
