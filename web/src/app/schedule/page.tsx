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

  // Both DB queries are independent — run in parallel
  const [weekSessions, allClients] = await Promise.all([
    db
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
      .all(),
    db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.category, "active"))
      .all(),
  ]);

  // Fetch Google Calendar events and classify as training vs personal
  let googleEvents: { title: string; date: string; time: string; endTime: string; isTraining: boolean }[] = [];
  try {
    const { connected } = await isConnected();
    if (connected) {
      const clientNames = new Set(allClients.map((c) => c.name.toLowerCase()));
      const events = await listEvents(process.env.GOOGLE_CALENDAR_EMAIL ?? "f4lathletics@gmail.com", weekStart, weekEnd);
      const m2SessionKeys = new Set(
        weekSessions.map((s) => `${s.scheduledDate}|${s.scheduledTime}`)
      );
      googleEvents = events
        .filter((e) => e.start?.dateTime)
        .map((e) => {
          const title = e.summary ?? "Untitled";
          const startRaw = e.start!.dateTime!;
          const endRaw = e.end?.dateTime;
          return {
            title,
            date: startRaw.slice(0, 10),
            time: startRaw.slice(11, 16),
            endTime: endRaw ? endRaw.slice(11, 16) : `${String(parseInt(startRaw.slice(11, 13)) + 1).padStart(2, "0")}:${startRaw.slice(14, 16)}`,
            isTraining: clientNames.has(title.toLowerCase()),
          };
        })
        .filter((e) => !m2SessionKeys.has(`${e.date}|${e.time}`));
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
