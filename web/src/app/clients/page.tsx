import { db } from "@/db";
import { clients, packages, sessions } from "@/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import { ClientTable } from "./client-table";
import Link from "next/link";

const GRADE_RANK: Record<string, number> = {
  adult: 0,
  freshman: 1,
  sophomore: 2,
  junior: 3,
  senior: 4,
  post_grad: 5,
};

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const allClients = await db
    .select({
      id: clients.id,
      name: clients.name,
      phone: clients.phone,
      category: clients.category,
      gradeLevel: clients.gradeLevel,
      collegeBound: clients.collegeBound,
      behaviorScore: clients.behaviorScore,
      preferredDays: clients.preferredDays,
      preferredTime: clients.preferredTime,
      maxSessionsPerWeek: clients.maxSessionsPerWeek,
      standingSlot: clients.standingSlot,
      sortOrder: clients.sortOrder,
      notes: clients.notes,
      googleSheetsName: clients.googleSheetsName,
      sessionRate: clients.sessionRate,
      sessionType: clients.sessionType,
      parentGuardian: clients.parentGuardian,
      email: clients.email,
      calendarInviteOptIn: clients.calendarInviteOptIn,
      noShowCount: clients.noShowCount,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
      sessionsRemaining: sql<number>`${packages.totalSessions} - ${packages.sessionsUsed}`.as(
        "sessions_remaining"
      ),
    })
    .from(clients)
    .leftJoin(packages, eq(packages.clientId, clients.id))
    .all();

  const allSessions = await db
    .select({
      clientId: sessions.clientId,
      date: sessions.scheduledDate,
      time: sessions.scheduledTime,
      status: sessions.status,
    })
    .from(sessions)
    .orderBy(desc(sessions.scheduledDate))
    .all();

  const sessionsByClient = new Map<number, { date: string; time: string; status: string }[]>();
  for (const s of allSessions) {
    if (!sessionsByClient.has(s.clientId)) sessionsByClient.set(s.clientId, []);
    sessionsByClient.get(s.clientId)!.push({ date: s.date, time: s.time, status: s.status });
  }

  const hasManualOrder = allClients.some((c) => c.sortOrder != null);

  const sorted = allClients.sort((a, b) => {
    if (hasManualOrder) {
      const orderA = a.sortOrder ?? 999;
      const orderB = b.sortOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
    }
    if (a.collegeBound !== b.collegeBound) return a.collegeBound ? -1 : 1;
    const gradeA = GRADE_RANK[a.gradeLevel ?? ""] ?? 0;
    const gradeB = GRADE_RANK[b.gradeLevel ?? ""] ?? 0;
    if (gradeA !== gradeB) return gradeB - gradeA;
    return b.behaviorScore - a.behaviorScore;
  });

  const active = sorted.filter(
    (c) => c.category === "active" || c.category === "in_season"
  );
  const inactive = sorted.filter(
    (c) => c.category !== "active" && c.category !== "in_season"
  );

  const lowPackages = (await db
    .select({
      clientId: clients.id,
      clientName: clients.name,
      remaining: sql<number>`${packages.totalSessions} - ${packages.sessionsUsed}`.as("remaining"),
      totalSessions: packages.totalSessions,
      sessionsUsed: packages.sessionsUsed,
    })
    .from(packages)
    .innerJoin(clients, eq(clients.id, packages.clientId))
    .where(eq(packages.status, "active"))
    .all()
  ).filter((p) => p.remaining <= 2);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
      {lowPackages.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 animate-in fade-in duration-500">
          <div className="text-sm font-semibold text-amber-400 mb-2">Package Alerts</div>
          {lowPackages.map((p) => (
            <div key={p.clientId} className="flex items-center justify-between py-1.5">
              <Link href={`/clients/${p.clientId}`} className="text-sm hover:underline">{p.clientName}</Link>
              <span className={`text-xs font-medium ${p.remaining <= 0 ? "text-red-400" : "text-amber-400"}`}>
                {p.remaining <= 0 ? "Package used up" : `${p.remaining} session${p.remaining === 1 ? "" : "s"} left`}
              </span>
            </div>
          ))}
        </div>
      )}
      <ClientTable activeClients={active} inactiveClients={inactive} sessionsByClient={Object.fromEntries(sessionsByClient)} />
    </div>
  );
}
