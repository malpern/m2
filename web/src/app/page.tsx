import { db } from "@/db";
import { clients, packages, sessions, outreach, defaultAvailability } from "@/db/schema";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WeeklyPlanner } from "@/components/weekly-planner";
import { SessionList } from "@/components/session-list";
import { OutreachMini } from "@/components/outreach-mini";
import Link from "next/link";
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

  // Queries
  const activeCount = await db.select({ count: sql<number>`count(*)` }).from(clients).where(sql`${clients.category} IN ('active', 'in_season')`).get();
  const totalActiveClients = activeCount?.count ?? 0;

  const lowPackages = await db.select({
    name: clients.name, clientId: clients.id,
    remaining: sql<number>`${packages.totalSessions} - ${packages.sessionsUsed}`,
  }).from(packages).innerJoin(clients, eq(clients.id, packages.clientId)).where(and(eq(packages.status, "active"), sql`${packages.totalSessions} - ${packages.sessionsUsed} <= 2`)).all();

  const unreconciledCount = await db.select({ count: sql<number>`count(*)` }).from(sessions).where(and(eq(sessions.status, "completed"), eq(sessions.reconciled, false))).get();
  const unreconciled = unreconciledCount?.count ?? 0;

  const thisWeekSessions = await db.select({
    id: sessions.id, clientId: sessions.clientId, clientName: clients.name,
    date: sessions.scheduledDate, time: sessions.scheduledTime, slot: sessions.slot, status: sessions.status,
  }).from(sessions).innerJoin(clients, eq(clients.id, sessions.clientId)).where(and(gte(sessions.scheduledDate, weekStart), lte(sessions.scheduledDate, weekEnd))).all();

  // Next week
  const nextMonday = new Date(monday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  const nextWeekStart = nextMonday.toISOString().split("T")[0];
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextSunday.getDate() + 6);
  const nextWeekEnd = nextSunday.toISOString().split("T")[0];

  const nextWeekSessions = await db.select({ id: sessions.id, status: sessions.status }).from(sessions).where(and(gte(sessions.scheduledDate, nextWeekStart), lte(sessions.scheduledDate, nextWeekEnd))).all();
  const nextWeekOutreach = await db.select().from(outreach).where(eq(outreach.weekOf, nextWeekStart)).all();
  const hasAvailability = (await db.select().from(defaultAvailability).all()).some((a) => a.enabled);

  // Outreach for current week
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

      {/* Urgent action banner */}
      {urgentBanner && (
        <Link href={urgentBanner.href}>
          <Card className={`mb-4 border-${urgentBanner.color}-500/30 hover:border-${urgentBanner.color}-500/50 transition-colors cursor-pointer`}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full bg-${urgentBanner.color}-500 animate-pulse`} />
                  <span className="text-sm font-medium">{urgentBanner.message}</span>
                </div>
                <span className="text-xs text-muted-foreground">&rarr;</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

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

      {/* Sessions — always show something */}
      {sessionListData ? (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{sessionListData.label}</CardTitle>
              <Link href="/schedule" className="text-xs text-accent hover:underline">Full schedule &rarr;</Link>
            </div>
          </CardHeader>
          <CardContent>
            <SessionList sessions={sessionListData.sessions} />
            {sessionListData.showTomorrow && tomorrowSessions.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <div className="text-xs text-muted-foreground mb-2">Tomorrow</div>
                {tomorrowSessions.sort((a, b) => a.time.localeCompare(b.time)).slice(0, 4).map((s) => (
                  <div key={s.id} className="flex items-center gap-3 py-1 text-sm text-muted-foreground">
                    <span className="w-10 font-mono text-xs">{s.slot}</span>
                    <Link href={`/clients/${s.clientId}`} className="hover:underline">{s.clientName}</Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-4">
          <CardContent className="pt-6 pb-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">No sessions scheduled</p>
            <Link href="/schedule" className="text-sm text-accent hover:underline">Go to Schedule &rarr;</Link>
          </CardContent>
        </Card>
      )}

      {/* Package alerts — always if any */}
      {lowPackages.length > 0 && (
        <Card className="border-amber-500/30">
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
      )}

      {/* Weekly recap — show end of week if sessions completed */}
      {completed + cancelled + noShow > 3 && (
        <Card className="mt-4">
          <CardContent className="pt-5 pb-4">
            <div className="text-xs text-muted-foreground mb-2">This week</div>
            <div className="flex items-center gap-6 text-sm">
              <span><strong>{completed}</strong> completed</span>
              {cancelled > 0 && <span className="text-red-400">{cancelled} cancelled</span>}
              {noShow > 0 && <span className="text-amber-400">{noShow} no-show</span>}
              <span className="text-emerald-400">{completed + cancelled + noShow > 0 ? Math.round((completed / (completed + cancelled + noShow)) * 100) : 0}% show-up</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, count, href, color, suffix }: { label: string; count: number; href: string; color: string; suffix?: string }) {
  const colors: Record<string, { bg: string; text: string; iconBg: string }> = {
    purple: { bg: "from-purple-500/10", text: "", iconBg: "bg-purple-500/15" },
    blue: { bg: "from-blue-500/10", text: "text-blue-400", iconBg: "bg-blue-500/15" },
    amber: { bg: "from-amber-500/10", text: "text-amber-400", iconBg: "bg-amber-500/15" },
    red: { bg: "from-red-500/10", text: "text-red-400", iconBg: "bg-red-500/15" },
    emerald: { bg: "from-emerald-500/10", text: "text-emerald-400", iconBg: "bg-emerald-500/15" },
  };
  const c = colors[color] ?? colors.blue;

  return (
    <Link href={href}>
      <Card className="group relative overflow-hidden hover:border-foreground/20 transition-colors cursor-pointer h-full">
        <div className={`absolute inset-0 bg-gradient-to-br ${c.bg} to-transparent`} />
        <CardContent className="relative pt-4 pb-3 text-center">
          <div className={`text-2xl font-bold ${c.text}`}>{count}{suffix ?? ""}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
