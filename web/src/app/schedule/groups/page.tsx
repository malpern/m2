import { db } from "@/db";
import { clients, sessions, sessionAttendees } from "@/db/schema";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import Link from "next/link";
import { getMonday } from "@/lib/scheduler";
import { RosterCard } from "./roster-card";
import { EmptyState } from "@/components/empty-state";
import type { GroupSession } from "@/lib/group-attendance";

export const dynamic = "force-dynamic";

/**
 * Semi-group rosters for the week (#13).
 *
 * A separate page rather than an addition to the calendar: the calendar is built
 * around one-client-per-event and drag-to-move, neither of which fits a roster.
 */
export default async function GroupsPage() {
  const monday = getMonday();
  const weekStart = monday.toISOString().split("T")[0];
  const end = new Date(monday);
  end.setDate(end.getDate() + 6);
  const weekEnd = end.toISOString().split("T")[0];

  const [groupSessions, attendeeRows, allClients] = await Promise.all([
    db
      .select({
        sessionId: sessions.id,
        ownerClientId: sessions.clientId,
        ownerClientName: clients.name,
        scheduledDate: sessions.scheduledDate,
        slot: sessions.slot,
        durationMinutes: sessions.durationMinutes,
      })
      .from(sessions)
      .innerJoin(clients, eq(clients.id, sessions.clientId))
      .where(
        and(
          eq(sessions.sessionType, "group"),
          gte(sessions.scheduledDate, weekStart),
          lte(sessions.scheduledDate, weekEnd),
          ne(sessions.status, "cancelled"),
        ),
      )
      .orderBy(sessions.scheduledDate)
      .all(),
    db
      .select({
        sessionId: sessionAttendees.sessionId,
        clientId: sessionAttendees.clientId,
        clientName: clients.name,
      })
      .from(sessionAttendees)
      .innerJoin(clients, eq(clients.id, sessionAttendees.clientId))
      .all(),
    db.select({ clientId: clients.id, clientName: clients.name }).from(clients).all(),
  ]);

  const bySession = new Map<number, { clientId: number; clientName: string }[]>();
  for (const a of attendeeRows) {
    if (!bySession.has(a.sessionId)) bySession.set(a.sessionId, []);
    bySession.get(a.sessionId)!.push({ clientId: a.clientId, clientName: a.clientName });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Semi-Group Rosters</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Week of {weekStart}. Neither Google Calendar nor the Sheets export records who
          attends a semi-group, so it is tracked here.{" "}
          <Link href="/schedule" className="underline hover:text-foreground">
            Back to the schedule
          </Link>
        </p>
      </div>

      {groupSessions.length === 0 ? (
        <EmptyState
          illustration="people"
          heading="No semi-group sessions this week"
          description="Sessions with their type set to Group appear here once the week is generated."
          ctaLabel="Go to the schedule"
          ctaHref="/schedule"
        />
      ) : (
        groupSessions.map((s) => {
          const session: GroupSession = {
            sessionId: s.sessionId,
            ownerClientId: s.ownerClientId,
            ownerClientName: s.ownerClientName,
            attendees: bySession.get(s.sessionId) ?? [],
          };
          const when = new Date(s.scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            timeZone: "America/Los_Angeles",
          });
          return (
            <RosterCard
              key={s.sessionId}
              session={session}
              when={`${when} at ${s.slot}`}
              durationMinutes={s.durationMinutes}
              allClients={allClients}
            />
          );
        })
      )}
    </div>
  );
}
