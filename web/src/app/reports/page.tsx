import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { ReportsDashboard } from "./reports-dashboard";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const all = db.select().from(sessions).all();

  const completed = all.filter((s) => s.status === "completed").length;
  const cancelled = all.filter((s) => s.status === "cancelled").length;
  const noShow = all.filter((s) => s.status === "no_show").length;
  const total = completed + cancelled + noShow;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const unreconciled = all.filter((s) => s.status === "completed" && !s.reconciled).length;

  const weeks = new Set(
    all
      .filter((s) => s.status === "completed")
      .map((s) => {
        const d = new Date(s.scheduledDate + "T12:00:00");
        const day = d.getDay();
        const mon = new Date(d);
        mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
        return mon.toISOString().split("T")[0];
      })
  );
  const weeklyAvg = weeks.size > 0 ? Math.round(completed / weeks.size) : 0;

  const activeClients = db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .where(eq(sessions.status, "completed"))
    .get();

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ReportsDashboard
        stats={{
          totalSessions: total,
          completed,
          cancelled,
          noShow,
          completionRate,
          unreconciled,
          activeClients: activeClients?.count ?? 0,
          weeklyAvg,
        }}
      />
    </div>
  );
}
