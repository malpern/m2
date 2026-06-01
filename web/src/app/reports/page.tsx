import { db } from "@/db";
import { clients, packages, sessions, packageTransactions } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { ReportsWithPackages } from "./reports-with-packages";
import { calculateRevenue, type CompletedSessionWithRate } from "@/lib/revenue";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  // All five queries are independent — run in parallel
  const [all, clientPackagesRaw, recentTransactions, unreconciledSessions, completedWithRates] = await Promise.all([
    db.select().from(sessions).all(),
    db
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
      .all(),
    db
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
      .all(),
    db
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
      .all(),
    // Revenue: join completed sessions with client rates and package rates
    db
      .select({
        sessionId: sessions.id,
        clientId: sessions.clientId,
        clientSessionRate: clients.sessionRate,
        packagePricePerSession: packages.pricePerSession,
        scheduledDate: sessions.scheduledDate,
      })
      .from(sessions)
      .innerJoin(clients, eq(clients.id, sessions.clientId))
      .leftJoin(packages, eq(packages.id, sessions.packageId))
      .where(eq(sessions.status, "completed"))
      .all(),
  ]);

  const clientPackages = clientPackagesRaw.map((p) => ({ ...p, remaining: p.totalSessions - p.sessionsUsed }));

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

  // Revenue calculation
  const revenueData: CompletedSessionWithRate[] = completedWithRates.map((r) => ({
    sessionId: r.sessionId,
    clientId: r.clientId,
    clientSessionRate: r.clientSessionRate,
    packagePricePerSession: r.packagePricePerSession,
    scheduledDate: r.scheduledDate,
  }));
  const revenue = calculateRevenue(revenueData);

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
        revenue={revenue}
        clientPackages={clientPackages}
        recentTransactions={recentTransactions}
        unreconciledSessions={unreconciledSessions}
      />
    </div>
  );
}
