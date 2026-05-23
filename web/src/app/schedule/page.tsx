import { db } from "@/db";
import { clients, sessions } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getMonday } from "@/lib/scheduler";
import { ScheduleCalendar } from "./schedule-calendar";
import { AddSessionButton } from "./add-session";
import { isConnected, listEvents } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  let monday: Date;

  if (params.week) {
    monday = new Date(params.week + "T12:00:00");
  } else {
    monday = getMonday();
  }

  const weekStart = monday.toISOString().split("T")[0];
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const weekEnd = sunday.toISOString().split("T")[0];

  const weekSessions = await db
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
    .where(and(gte(sessions.scheduledDate, weekStart), lte(sessions.scheduledDate, weekEnd)))
    .all();

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.category, "active"))
    .all();

  // Fetch Google Calendar events
  let googleEvents: { title: string; date: string; time: string; endTime: string }[] = [];
  try {
    const { connected } = await isConnected();
    if (connected) {
      const events = await listEvents("f4lathletics@gmail.com", weekStart, weekEnd);
      googleEvents = events
        .filter((e) => e.start?.dateTime)
        .map((e) => {
          const start = new Date(e.start!.dateTime!);
          const end = e.end?.dateTime ? new Date(e.end.dateTime) : new Date(start.getTime() + 3600000);
          return {
            title: e.summary ?? "Untitled",
            date: start.toISOString().split("T")[0],
            time: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
            endTime: `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`,
          };
        });
    }
  } catch (e) {
    console.error("Failed to fetch Google Calendar events:", e);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
      <ScheduleCalendar
        sessions={weekSessions}
        weekStart={weekStart}
        googleEvents={googleEvents}
        addSessionButton={<AddSessionButton clients={allClients} weekStart={weekStart} />}
      />
    </div>
  );
}
