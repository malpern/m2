import { db } from "@/db";
import { clients, packages, sessions, outreach, defaultAvailability } from "@/db/schema";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import { WeeklyPlanner } from "@/components/weekly-planner";
import { OutreachMini } from "@/components/outreach-mini";
import { PackageAlerts } from "@/components/package-alerts";
import { StatCard } from "@/components/stat-card";
import { UrgentBanner } from "@/components/urgent-banner";
import { DashboardSessionCard } from "@/components/dashboard-session-card";
import { WeeklyRecap } from "@/components/weekly-recap";
import { getMonday } from "@/lib/scheduler";
import {
  buildOutreachQueue,
  getOutreachSummary,
  getNeedsMattAttention,
} from "@/lib/outreach-engine";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const monday = getMonday();
  const weekStart = monday.toISOString().split("T")[0];
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const weekEnd = sunday.toISOString().split("T")[0];

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  // Next week date range (needed for queries below)
  const nextMonday = new Date(monday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  const nextWeekStart = nextMonday.toISOString().split("T")[0];
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextSunday.getDate() + 6);
  const nextWeekEnd = nextSunday.toISOString().split("T")[0];

  // All queries are independent — run in parallel
  const [
    activeCount,
    lowPackages,
    unreconciledCount,
    thisWeekSessions,
    nextWeekSessions,
    nextWeekOutreach,
    availabilityRows,
    weekOutreach,
    currentWeekFullSessions,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(clients).where(sql`${clients.category} IN ('active', 'in_season')`).get(),
    db.select({
      clientId: clients.id, clientName: clients.name, category: clients.category,
      remaining: sql<number>`${packages.totalSessions} - ${packages.sessionsUsed}`,
      totalSessions: packages.totalSessions, sessionsUsed: packages.sessionsUsed,
    }).from(packages).innerJoin(clients, eq(clients.id, packages.clientId)).where(and(eq(packages.status, "active"), sql`${packages.totalSessions} - ${packages.sessionsUsed} <= 2`)).all(),
    db.select({ count: sql<number>`count(*)` }).from(sessions).where(and(eq(sessions.status, "completed"), eq(sessions.reconciled, false))).get(),
    db.select({
      id: sessions.id, clientId: sessions.clientId, clientName: clients.name,
      date: sessions.scheduledDate, time: sessions.scheduledTime, slot: sessions.slot, status: sessions.status,
    }).from(sessions).innerJoin(clients, eq(clients.id, sessions.clientId)).where(and(gte(sessions.scheduledDate, weekStart), lte(sessions.scheduledDate, weekEnd))).all(),
    db.select({ id: sessions.id, status: sessions.status }).from(sessions).where(and(gte(sessions.scheduledDate, nextWeekStart), lte(sessions.scheduledDate, nextWeekEnd))).all(),
    db.select().from(outreach).where(eq(outreach.weekOf, nextWeekStart)).all(),
    db.select().from(defaultAvailability).all(),
    db.select().from(outreach).where(eq(outreach.weekOf, weekStart)).all(),
    db.select({
      id: sessions.id, clientId: sessions.clientId, clientName: clients.name, clientPhone: clients.phone,
      standingSlot: clients.standingSlot, packageId: sessions.packageId, scheduledDate: sessions.scheduledDate,
      scheduledTime: sessions.scheduledTime, slot: sessions.slot, status: sessions.status,
      gcalEventId: sessions.gcalEventId, loggedToSheets: sessions.loggedToSheets, reconciled: sessions.reconciled, createdAt: sessions.createdAt,
      sessionType: sessions.sessionType,
    }).from(sessions).innerJoin(clients, eq(clients.id, sessions.clientId)).where(and(gte(sessions.scheduledDate, weekStart), lte(sessions.scheduledDate, weekEnd))).all(),
  ]);

  const totalActiveClients = activeCount?.count ?? 0;
  const unreconciled = unreconciledCount?.count ?? 0;
  const hasAvailability = availabilityRows.some((a) => a.enabled);

  const outreachItems = buildOutreachQueue(currentWeekFullSessions, weekOutreach);
  const outreachSummary = getOutreachSummary(outreachItems);
  const flaggedItems = getNeedsMattAttention(outreachItems);

  // Stats
  const confirmed = thisWeekSessions.filter((s) => s.status === "confirmed").length;
  const proposed = thisWeekSessions.filter((s) => s.status === "proposed").length;
  const completed = thisWeekSessions.filter((s) => s.status === "completed").length;
  const cancelled = thisWeekSessions.filter((s) => s.status === "cancelled").length;
  const noShow = thisWeekSessions.filter((s) => s.status === "no_show").length;

  const todaySessions = thisWeekSessions.filter((s) => s.date === todayStr);
  const tomorrowSessions = thisWeekSessions.filter((s) => s.date === tomorrowStr);
  const outreachSentCount = weekOutreach.filter((o) => o.direction === "sent").length;

  // Planner state
  const nextWeekLabel = nextMonday.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const plannerState = {
    hasAvailability,
    hasProposedSessions: nextWeekSessions.length > 0,
    totalClients: totalActiveClients,
    confirmedCount: nextWeekSessions.filter((s) => s.status === "confirmed").length,
    proposedCount: nextWeekSessions.filter((s) => s.status === "proposed").length,
    sentCount: nextWeekOutreach.filter((o) => o.direction === "sent").length,
    needsAttentionCount: nextWeekOutreach.filter((o) => o.status === "needs_matt").length,
    weekLabel: nextWeekLabel,
  };

  // Smart banner — one urgent action
  let urgentBanner: { message: string; href: string; color: string } | null = null;
  if (flaggedItems.length > 0) {
    urgentBanner = { message: `${flaggedItems.length} repl${flaggedItems.length === 1 ? "y needs" : "ies need"} your attention`, href: "/outreach", color: "purple" };
  } else if (isWeekend && nextWeekSessions.length === 0) {
    urgentBanner = { message: "Time to plan next week", href: "/schedule", color: "emerald" };
  } else if (nextWeekSessions.length > 0 && outreachSentCount === 0 && isWeekend) {
    urgentBanner = { message: "Schedule ready — send outreach", href: "/outreach", color: "blue" };
  } else if (unreconciled > 0) {
    urgentBanner = { message: `${unreconciled} session${unreconciled !== 1 ? "s" : ""} need reconciliation`, href: "/reports", color: "red" };
  }

  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dayLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // Session list: show today if has sessions, else this week, else next week
  const sessionListData = todaySessions.length > 0
    ? { sessions: todaySessions, label: "Today", showTomorrow: true }
    : thisWeekSessions.length > 0
      ? { sessions: thisWeekSessions, label: "This Week", showTomorrow: false }
      : null;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{greeting}, Matt</h1>
        <p className="text-muted-foreground text-sm mt-1">{dayLabel}</p>
      </div>

      {urgentBanner && <UrgentBanner banner={urgentBanner} />}

      {/* Planner — show on weekends */}
      {isWeekend && <WeeklyPlanner state={plannerState} />}

      {/* Outreach mini — show when outreach is active and there are flagged items */}
      {outreachSentCount > 0 && (outreachSummary.sent > 0 || flaggedItems.length > 0) && (
        <OutreachMini
          confirmed={outreachSummary.confirmed}
          waiting={outreachSummary.sent}
          needsYou={outreachSummary.needsAttention}
          total={outreachSummary.total - outreachSummary.standing}
          flaggedItems={flaggedItems.map((i) => ({
            sessionId: i.sessionId, clientId: i.clientId, clientName: i.clientName,
            slot: i.slot, date: i.date, status: i.status, replyText: i.replyText,
          }))}
        />
      )}

      {/* Stat cards — always */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {unreconciled > 0 && (
          <StatCard label="Unreconciled" count={unreconciled} href="/reports" color="red" />
        )}
        {lowPackages.length > 0 && (
          <StatCard label="Low Packages" count={lowPackages.length} href="/reports" color="amber" />
        )}
        <StatCard label="Active Athletes" count={totalActiveClients} href="/clients" color="purple" />
        <StatCard label={todaySessions.length > 0 ? "Today" : "This Week"} count={todaySessions.length > 0 ? todaySessions.length : proposed + confirmed + completed} href="/schedule" color="blue" />
        {unreconciled === 0 && lowPackages.length === 0 && (
          <>
            <StatCard label="Completed" count={completed} href="/reports" color="emerald" />
            <StatCard label="Show-up Rate" count={completed + cancelled + noShow > 0 ? Math.round((completed / (completed + cancelled + noShow)) * 100) : 0} href="/reports" color="emerald" suffix="%" />
          </>
        )}
      </div>

      <DashboardSessionCard sessionListData={sessionListData} tomorrowSessions={tomorrowSessions} />

      {/* Package alerts — always if any */}
      <PackageAlerts items={lowPackages} />

      <WeeklyRecap completed={completed} cancelled={cancelled} noShow={noShow} />
    </div>
  );
}
