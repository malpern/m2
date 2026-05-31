import { db } from "@/db";
import { clients, packages, sessions, packageTransactions } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { ReportsWithPackages } from "./reports-with-packages";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const all = await db.select().from(sessions).all();

  const completed = all.filter((s) => s.status === "completed").length;
  const cancelled = all.filter((s) => s.status === "cancelled").length;
  const noShow = all.filter((s) => s.status === "no_show").length;
  const total = completed + cancelled + noShow;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const unreconciled = all.filter((s) => s.status === "completed" && !s.reconciled).length;

  const weeks = new Set(
    all.filter((s) => s.status === "completed").map((s) => {
      const d = new Date(s.scheduledDate + "T12:00:00");
      const day = d.getDay();
      const mon = new Date(d);
      mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      return mon.toISOString().split("T")[0];
    })
  );
  const weeklyAvg = weeks.size > 0 ? Math.round(completed / weeks.size) : 0;

  // Packages data
  const clientPackages = (await db
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
  ).map((p) => ({ ...p, remaining: p.totalSessions - p.sessionsUsed }));

  const recentTransactions = await db
    .select({
      id: packageTransactions.id,
      delta: packageTransactions.delta,
      reason: packageTransactions.reason,
      note: packageTransactions.note,
      previousBalance: packageTransactions.previousBalance,
      newBalance: packageTransactions.newBalance,
      createdAt: packageTransactions.createdAt,
      clientName: clients.name,
      clientId: clients.id,
    })
    .from(packageTransactions)
    .innerJoin(packages, eq(packages.id, packageTransactions.packageId))
    .innerJoin(clients, eq(clients.id, packages.clientId))
    .orderBy(desc(packageTransactions.id))
    .limit(20)
    .all();

  const unreconciledSessions = await db
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
    .where(and(eq(sessions.status, "completed"), eq(sessions.reconciled, false)))
    .all();

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ReportsWithPackages
        stats={{
          totalSessions: total,
          completed,
          cancelled,
          noShow,
          completionRate,
          unreconciled,
          activeClients: 0,
          weeklyAvg,
        }}
        clientPackages={clientPackages}
        recentTransactions={recentTransactions}
        unreconciledSessions={unreconciledSessions}
      />
    </div>
  );
}
