import { db } from "@/db";
import { sessions, clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createCalendarEvent, deleteCalendarEvent, isConnected } from "./google-calendar";
import { syslog } from "./logger";

export async function syncSessionToCalendar(sessionId: number): Promise<void> {
  const { connected } = await isConnected();
  if (!connected) return;

  const session = await db.select({
    id: sessions.id,
    clientName: clients.name,
    clientEmail: clients.email,
    calendarInviteOptIn: clients.calendarInviteOptIn,
    scheduledDate: sessions.scheduledDate,
    scheduledTime: sessions.scheduledTime,
    slot: sessions.slot,
    status: sessions.status,
    gcalEventId: sessions.gcalEventId,
  })
  .from(sessions)
  .innerJoin(clients, eq(clients.id, sessions.clientId))
  .where(eq(sessions.id, sessionId))
  .get();

  if (!session) return;

  if (session.status === "confirmed" && !session.gcalEventId) {
    try {
      const attendeeEmail = (session.calendarInviteOptIn && session.clientEmail) ? session.clientEmail : undefined;
      const eventId = await createCalendarEvent(
        session.clientName,
        session.scheduledDate,
        session.scheduledTime,
        { attendeeEmail },
      );
      if (eventId) {
        const wasCancelled = await db.transaction(async (tx) => {
          const fresh = await tx.select({ status: sessions.status }).from(sessions).where(eq(sessions.id, sessionId)).get();
          if (fresh && fresh.status === "cancelled") {
            return true;
          }
          await tx.update(sessions).set({ gcalEventId: eventId }).where(eq(sessions.id, sessionId)).run();
          return false;
        });
        if (wasCancelled) {
          await deleteCalendarEvent(eventId);
          syslog.info("system", `Session cancelled while creating event — deleted immediately`, `GCal event ${eventId} created then deleted for session ${sessionId}`, { sessionId });
          return;
        }
        const inviteNote = attendeeEmail ? ` (invite sent to ${attendeeEmail})` : "";
        syslog.info("system", `Added ${session.clientName}'s session to Google Calendar${inviteNote}`, `GCal event created: ${eventId} for session ${sessionId}`, { sessionId });
      } else {
        syslog.warn("system", `Calendar event creation returned empty for ${session.clientName}`, `GCal create returned null for session ${sessionId} (${session.scheduledDate} ${session.scheduledTime})`, { sessionId });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      syslog.error("system", `Couldn't add ${session.clientName}'s session to calendar`, `GCal create failed: ${msg}`, { sessionId });
    }
  }

  if (session.status === "cancelled" && session.gcalEventId) {
    try {
      await deleteCalendarEvent(session.gcalEventId);
      await db.update(sessions).set({ gcalEventId: null }).where(eq(sessions.id, sessionId)).run();
      syslog.info("system", `Removed ${session.clientName}'s cancelled session from calendar`, `GCal event deleted: ${session.gcalEventId}`, { sessionId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      syslog.error("system", `Couldn't remove cancelled session from calendar`, `GCal delete failed: ${msg}`, { sessionId });
    }
  }
}

