import { db } from "@/db";
import { clients, packages, sessions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { PackagesTable } from "./packages-table";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const clientPackages = db
    .select({
      clientId: clients.id,
      clientName: clients.name,
      category: clients.category,
      packageId: packages.id,
      totalSessions: packages.totalSessions,
      sessionsUsed: packages.sessionsUsed,
      status: packages.status,
    })
    .from(packages)
    .innerJoin(clients, eq(clients.id, packages.clientId))
    .where(eq(packages.status, "active"))
    .all()
    .map((p) => ({
      ...p,
      remaining: p.totalSessions - p.sessionsUsed,
    }));

  const unreconciled = db
    .select({
      sessionId: sessions.id,
      clientId: clients.id,
      clientName: clients.name,
      scheduledDate: sessions.scheduledDate,
      scheduledTime: sessions.scheduledTime,
      slot: sessions.slot,
    })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(
      and(
        eq(sessions.status, "completed"),
        eq(sessions.reconciled, false)
      )
    )
    .all();

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <PackagesTable
        clientPackages={clientPackages}
        unreconciled={unreconciled}
      />
    </div>
  );
}
