import { db } from "@/db";
import { clients, packages, sessions, outreach, defaultAvailability } from "@/db/schema";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { WeeklyPlanner } from "@/components/weekly-planner";
import { SessionList } from "@/components/session-list";
import { TodayCard } from "@/components/today-card";
import { WeekRecap } from "@/components/week-recap";
import { OutreachMini } from "@/components/outreach-mini";
import Link from "next/link";
import { getMonday } from "@/lib/scheduler";
import {
  buildOutreachQueue,
  getOutreachSummary,
  getNeedsMattAttention,
} from "@/lib/outreach-engine";

export const dynamic = "force-dynamic";

type DashboardState = "plan_week" | "review_send" | "outreach_active" | "week_booked" | "end_of_week";

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

  // Tomorrow
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  // Core queries
  const activeCount = await db.select({ count: sql<number>`count(*)` }).from(clients).where(sql`${clients.category} IN ('active', 'in_season')`).get();

  const lowPackages = await db.select({
    name: clients.name, clientId: clients.id,
    remaining: sql<number>`${packages.totalSessions} - ${packages.sessionsUsed}`,
  }).from(packages).innerJoin(clients, eq(clients.id, packages.clientId)).where(and(eq(packages.status, "active"), sql`${packages.totalSessions} - ${packages.sessionsUsed} <= 2`)).all();

  const unreconciledCount = await db.select({ count: sql<number>`count(*)` }).from(sessions).where(and(eq(sessions.status, "completed"), eq(sessions.reconciled, false))).get();

  const thisWeekSessions = await db.select({
    id: sessions.id, clientId: sessions.clientId, clientName: clients.name,
    date: sessions.scheduledDate, time: sessions.scheduledTime, slot: sessions.slot, status: sessions.status,
  }).from(sessions).innerJoin(clients, eq(clients.id, sessions.clientId)).where(and(gte(sessions.scheduledDate, weekStart), lte(sessions.scheduledDate, weekEnd))).all();

  // Next week data
  const nextMonday = new Date(monday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  const nextWeekStart = nextMonday.toISOString().split("T")[0];
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextSunday.getDate() + 6);
  const nextWeekEnd = nextSunday.toISOString().split("T")[0];

  const nextWeekSessions = await db.select({ id: sessions.id, status: sessions.status }).from(sessions).where(and(gte(sessions.scheduledDate, nextWeekStart), lte(sessions.scheduledDate, nextWeekEnd))).all();

  const nextWeekOutreach = await db.select().from(outreach).where(eq(outreach.weekOf, nextWeekStart)).all();

  const hasAvailability = (await db.select().from(defaultAvailability).all()).some((a) => a.enabled);
  const totalActiveClients = activeCount?.count ?? 0;

  // Outreach data for current week
  const weekOutreach = await db.select().from(outreach).where(eq(outreach.weekOf, weekStart)).all();
  const currentWeekFullSessions = await db.select({
    id: sessions.id, clientId: sessions.clientId, clientName: clients.name, clientPhone: clients.phone,
    standingSlot: clients.standingSlot, packageId: sessions.packageId, scheduledDate: sessions.scheduledDate,
    scheduledTime: sessions.scheduledTime, slot: sessions.slot, status: sessions.status,
    gcalEventId: sessions.gcalEventId, loggedToSheets: sessions.loggedToSheets, reconciled: sessions.reconciled, createdAt: sessions.createdAt,
  }).from(sessions).innerJoin(clients, eq(clients.id, sessions.clientId)).where(and(gte(sessions.scheduledDate, weekStart), lte(sessions.scheduledDate, weekEnd))).all();

  const outreachItems = buildOutreachQueue(currentWeekFullSessions, weekOutreach);
  const outreachSummary = getOutreachSummary(outreachItems);
  const flaggedItems = getNeedsMattAttention(outreachItems);

  // Week stats
  const confirmed = thisWeekSessions.filter((s) => s.status === "confirmed").length;
  const proposed = thisWeekSessions.filter((s) => s.status === "proposed").length;
  const completed = thisWeekSessions.filter((s) => s.status === "completed").length;
  const cancelled = thisWeekSessions.filter((s) => s.status === "cancelled").length;
  const noShow = thisWeekSessions.filter((s) => s.status === "no_show").length;

  // Today/tomorrow
  const todaySessions = thisWeekSessions.filter((s) => s.date === todayStr);
  const tomorrowSessions = thisWeekSessions.filter((s) => s.date === tomorrowStr);

  // State detection
  const outreachSentCount = weekOutreach.filter((o) => o.direction === "sent").length;
  let state: DashboardState;

  if (nextWeekSessions.length === 0 && isWeekend) {
    state = "plan_week";
  } else if (nextWeekSessions.length > 0 && outreachSentCount === 0 && isWeekend) {
    state = "review_send";
  } else if (outreachSentCount > 0 && confirmed < totalActiveClients) {
    state = "outreach_active";
  } else if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    state = "week_booked";
  } else {
    state = "end_of_week";
  }

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

  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dayLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // Stat cards — reorder by urgency
  const statCards = [
    { key: "unreconciled", count: unreconciledCount?.count ?? 0, alert: true },
    { key: "lowPackages", count: lowPackages.length, alert: true },
    { key: "thisWeek", count: proposed + confirmed, alert: false },
    { key: "active", count: totalActiveClients, alert: false },
  ].sort((a, b) => {
    if (a.alert && a.count > 0 && !(b.alert && b.count > 0)) return -1;
    if (b.alert && b.count > 0 && !(a.alert && a.count > 0)) return 1;
    return 0;
  });

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{greeting}, Matt</h1>
        <p className="text-muted-foreground text-sm mt-1">{dayLabel}</p>
      </div>

      {/* State: Plan the week */}
      {state === "plan_week" && (
        <>
          <WeeklyPlanner state={plannerState} />
          {completed + cancelled + noShow > 0 && (
            <WeekRecap completed={completed} cancelled={cancelled} noShow={noShow} unreconciled={unreconciledCount?.count ?? 0} />
          )}
        </>
      )}

      {/* State: Review & Send */}
      {state === "review_send" && (
        <>
          <WeeklyPlanner state={plannerState} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard label="Active Athletes" count={totalActiveClients} href="/clients" color="purple" icon="people" />
            <StatCard label="This Week" count={proposed + confirmed} href="/schedule" color="blue" icon="calendar" />
            <StatCard label="Low Packages" count={lowPackages.length} href="/reports" color={lowPackages.length > 0 ? "amber" : "emerald"} icon="pkg" />
            <StatCard label="Unreconciled" count={unreconciledCount?.count ?? 0} href="/reports" color={(unreconciledCount?.count ?? 0) > 0 ? "red" : "emerald"} icon="alert" />
          </div>
          {thisWeekSessions.length > 0 && (
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Proposed Schedule</CardTitle>
                  <Link href="/schedule" className="text-xs text-accent hover:underline">View calendar &rarr;</Link>
                </div>
              </CardHeader>
              <CardContent>
                <SessionList sessions={thisWeekSessions} />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* State: Outreach active */}
      {state === "outreach_active" && (
        <>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard label="Active Athletes" count={totalActiveClients} href="/clients" color="purple" icon="people" />
            <StatCard label="This Week" count={proposed + confirmed} href="/schedule" color="blue" icon="calendar" />
            <StatCard label="Low Packages" count={lowPackages.length} href="/reports" color={lowPackages.length > 0 ? "amber" : "emerald"} icon="pkg" />
            <StatCard label="Unreconciled" count={unreconciledCount?.count ?? 0} href="/reports" color={(unreconciledCount?.count ?? 0) > 0 ? "red" : "emerald"} icon="alert" />
          </div>
        </>
      )}

      {/* State: Week is booked */}
      {state === "week_booked" && (
        <>
          <TodayCard todaySessions={todaySessions} tomorrowSessions={tomorrowSessions} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard label="Active Athletes" count={totalActiveClients} href="/clients" color="purple" icon="people" />
            <StatCard label="This Week" count={proposed + confirmed} href="/schedule" color="blue" icon="calendar" />
            <StatCard label="Low Packages" count={lowPackages.length} href="/reports" color={lowPackages.length > 0 ? "amber" : "emerald"} icon="pkg" />
            <StatCard label="Unreconciled" count={unreconciledCount?.count ?? 0} href="/reports" color={(unreconciledCount?.count ?? 0) > 0 ? "red" : "emerald"} icon="alert" />
          </div>
          {lowPackages.length > 0 && <PackageAlerts lowPackages={lowPackages} />}
        </>
      )}

      {/* State: End of week */}
      {state === "end_of_week" && (
        <>
          <WeekRecap completed={completed} cancelled={cancelled} noShow={noShow} unreconciled={unreconciledCount?.count ?? 0} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard label="Active Athletes" count={totalActiveClients} href="/clients" color="purple" icon="people" />
            <StatCard label="This Week" count={completed} href="/schedule" color="blue" icon="calendar" />
            <StatCard label="Low Packages" count={lowPackages.length} href="/reports" color={lowPackages.length > 0 ? "amber" : "emerald"} icon="pkg" />
            <StatCard label="Unreconciled" count={unreconciledCount?.count ?? 0} href="/reports" color={(unreconciledCount?.count ?? 0) > 0 ? "red" : "emerald"} icon="alert" />
          </div>
          {lowPackages.length > 0 && <PackageAlerts lowPackages={lowPackages} />}
          <WeeklyPlanner state={plannerState} />
        </>
      )}
    </div>
  );
}

// --- Helper components ---

function StatCard({ label, count, href, color, icon }: { label: string; count: number; href: string; color: string; icon: string }) {
  const colors: Record<string, { bg: string; text: string; iconBg: string }> = {
    purple: { bg: "from-purple-500/10", text: "", iconBg: "bg-purple-500/15" },
    blue: { bg: "from-blue-500/10", text: "text-blue-400", iconBg: "bg-blue-500/15" },
    amber: { bg: "from-amber-500/10", text: "text-amber-400", iconBg: "bg-amber-500/15" },
    red: { bg: "from-red-500/10", text: "text-red-400", iconBg: "bg-red-500/15" },
    emerald: { bg: "from-emerald-500/10", text: "text-emerald-400", iconBg: "bg-emerald-500/15" },
  };
  const c = colors[color] ?? colors.blue;

  const iconColors: Record<string, string> = {
    purple: "text-purple-400", blue: "text-blue-400", amber: "text-amber-400",
    red: "text-red-400", emerald: "text-emerald-400",
  };
  const ic = iconColors[color] ?? "text-blue-400";

  const iconSvg = (
    <svg className={`w-5 h-5 ${ic}`} viewBox="0 0 24 24" fill="currentColor">
      {icon === "people" && <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />}
      {icon === "calendar" && <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10z" />}
      {icon === "pkg" && <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />}
      {icon === "alert" && <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />}
    </svg>
  );

  return (
    <Link href={href}>
      <Card className="group relative overflow-hidden hover:border-foreground/20 transition-colors cursor-pointer">
        <div className={`absolute inset-0 bg-gradient-to-br ${c.bg} to-transparent`} />
        <CardContent className="relative pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${c.iconBg} flex items-center justify-center`}>
              {iconSvg}
            </div>
            <div>
              <div className={`text-2xl font-bold ${c.text}`}>{count}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function PackageAlerts({ lowPackages }: { lowPackages: { name: string; clientId: number; remaining: number }[] }) {
  return (
    <Card className="mb-4 border-amber-500/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-amber-400">Package Alerts</CardTitle>
          <Link href="/reports" className="text-xs text-accent hover:underline">All packages &rarr;</Link>
        </div>
      </CardHeader>
      <CardContent>
        {lowPackages.map((p) => (
          <div key={p.name} className="flex items-center justify-between py-2 text-sm border-b border-border last:border-0">
            <Link href={`/clients/${p.clientId}`} className="font-medium hover:underline">{p.name}</Link>
            <Badge className={`border-0 ${p.remaining <= 0 ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>
              {p.remaining} left
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
