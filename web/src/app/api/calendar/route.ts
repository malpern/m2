import { db } from "@/db";
import { clients, sessions } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const startDate = fourWeeksAgo.toISOString().split("T")[0];

  const allSessions = await db
    .select({
      id: sessions.id,
      clientName: clients.name,
      scheduledDate: sessions.scheduledDate,
      scheduledTime: sessions.scheduledTime,
      status: sessions.status,
    })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(
      and(
        gte(sessions.scheduledDate, startDate),
        eq(sessions.status, "confirmed"),
      )
    )
    .all();

  // Also include proposed sessions for upcoming dates
  const today = new Date().toISOString().split("T")[0];
  const proposedSessions = await db
    .select({
      id: sessions.id,
      clientName: clients.name,
      scheduledDate: sessions.scheduledDate,
      scheduledTime: sessions.scheduledTime,
      status: sessions.status,
    })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(
      and(
        gte(sessions.scheduledDate, today),
        eq(sessions.status, "proposed"),
      )
    )
    .all();

  const all = [...allSessions, ...proposedSessions];

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//M2 Performance//Matt Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:M2 Training Sessions",
    "X-WR-TIMEZONE:America/Los_Angeles",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];

  for (const s of all) {
    const [year, month, day] = s.scheduledDate.split("-");
    const [hour, min] = s.scheduledTime.split(":");
    const startHour = parseInt(hour);
    const endHour = startHour + 1;
    const dtStart = `${year}${month}${day}T${hour}${min}00`;
    const dtEnd = `${year}${month}${day}T${String(endHour).padStart(2, "0")}${min}00`;

    const statusLabel = s.status === "confirmed" ? "" : " (Proposed)";

    lines.push(
      "BEGIN:VEVENT",
      `DTSTART;TZID=America/Los_Angeles:${dtStart}`,
      `DTEND;TZID=America/Los_Angeles:${dtEnd}`,
      `SUMMARY:${s.clientName}${statusLabel}`,
      `UID:m2-session-${s.id}@mattscheduler`,
      `STATUS:${s.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  const ics = lines.join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="m2-schedule.ics"',
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
