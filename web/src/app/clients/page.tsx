import { db } from "@/db";
import { clients, packages } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { ClientTable } from "./client-table";

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
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
      sessionsRemaining: sql<number>`${packages.totalSessions} - ${packages.sessionsUsed}`.as(
        "sessions_remaining"
      ),
    })
    .from(clients)
    .leftJoin(packages, eq(packages.clientId, clients.id))
    .all();

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

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
      <ClientTable activeClients={active} inactiveClients={inactive} />
    </div>
  );
}
