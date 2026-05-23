import { db } from "@/db";
import { clients, packages, sessions } from "@/db/schema";
import { eq, sql, and, gte } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import Link from "next/link";
import { getMonday } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const monday = getMonday();
  const weekStart = monday.toISOString().split("T")[0];

  const activeCount = db
    .select({ count: sql<number>`count(*)` })
    .from(clients)
    .where(sql`${clients.category} IN ('active', 'in_season')`)
    .get();

  const lowPackages = db
    .select({
      name: clients.name,
      clientId: clients.id,
      remaining: sql<number>`${packages.totalSessions} - ${packages.sessionsUsed}`,
    })
    .from(packages)
    .innerJoin(clients, eq(clients.id, packages.clientId))
    .where(
      and(
        eq(packages.status, "active"),
        sql`${packages.totalSessions} - ${packages.sessionsUsed} <= 2`
      )
    )
    .all();

  const unreconciledCount = db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .where(and(eq(sessions.status, "completed"), eq(sessions.reconciled, false)))
    .get();

  const thisWeekSessions = db
    .select({
      id: sessions.id,
      clientName: clients.name,
      date: sessions.scheduledDate,
      time: sessions.scheduledTime,
      slot: sessions.slot,
      status: sessions.status,
    })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(gte(sessions.scheduledDate, weekStart))
    .all();

  const confirmed = thisWeekSessions.filter((s) => s.status === "confirmed").length;
  const proposed = thisWeekSessions.filter((s) => s.status === "proposed").length;

  const today = new Date();
  const greeting = today.getHours() < 12 ? "Good morning" : today.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dayLabel = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{greeting}, Matt</h1>
        <p className="text-muted-foreground text-sm mt-1">{dayLabel}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Link href="/clients">
          <Card className="group relative overflow-hidden hover:border-purple-500/30 transition-colors cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent" />
            <CardContent className="relative pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                </div>
                <div>
                  <div className="text-2xl font-bold">{activeCount?.count ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Active Athletes</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/schedule">
          <Card className="group relative overflow-hidden hover:border-blue-500/30 transition-colors cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent" />
            <CardContent className="relative pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2z"/></svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-400">{proposed + confirmed}</div>
                  <div className="text-xs text-muted-foreground">This Week</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/packages">
          <Card className={`group relative overflow-hidden transition-colors cursor-pointer ${lowPackages.length > 0 ? "hover:border-amber-500/30" : "hover:border-emerald-500/30"}`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${lowPackages.length > 0 ? "from-amber-500/10" : "from-emerald-500/10"} to-transparent`} />
            <CardContent className="relative pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${lowPackages.length > 0 ? "bg-amber-500/15" : "bg-emerald-500/15"}`}>
                  <svg className={`w-5 h-5 ${lowPackages.length > 0 ? "text-amber-400" : "text-emerald-400"}`} viewBox="0 0 24 24" fill="currentColor"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
                </div>
                <div>
                  <div className={`text-2xl font-bold ${lowPackages.length > 0 ? "text-amber-400" : "text-emerald-400"}`}>{lowPackages.length}</div>
                  <div className="text-xs text-muted-foreground">Low Packages</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/packages">
          <Card className={`group relative overflow-hidden transition-colors cursor-pointer ${(unreconciledCount?.count ?? 0) > 0 ? "hover:border-red-500/30" : "hover:border-emerald-500/30"}`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${(unreconciledCount?.count ?? 0) > 0 ? "from-red-500/10" : "from-emerald-500/10"} to-transparent`} />
            <CardContent className="relative pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${(unreconciledCount?.count ?? 0) > 0 ? "bg-red-500/15" : "bg-emerald-500/15"}`}>
                  <svg className={`w-5 h-5 ${(unreconciledCount?.count ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                </div>
                <div>
                  <div className={`text-2xl font-bold ${(unreconciledCount?.count ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>{unreconciledCount?.count ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Unreconciled</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* This week */}
      {thisWeekSessions.length > 0 ? (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">This Week</CardTitle>
              <Link href="/schedule" className="text-xs text-accent hover:underline">View schedule &rarr;</Link>
            </div>
          </CardHeader>
          <CardContent>
            {thisWeekSessions
              .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
              .slice(0, 8)
              .map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 text-sm border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground w-16">
                    {new Date(s.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <span className="font-medium">{s.clientName}</span>
                  <span className="text-muted-foreground">{s.slot}</span>
                </div>
                <Badge className={`border-0 ${
                  s.status === "confirmed" ? "bg-emerald-500/15 text-emerald-400"
                  : s.status === "proposed" ? "bg-blue-500/15 text-blue-400"
                  : "bg-muted text-muted-foreground"
                }`}>
                  {s.status}
                </Badge>
              </div>
            ))}
            {thisWeekSessions.length > 8 && (
              <div className="text-xs text-muted-foreground mt-2">
                +{thisWeekSessions.length - 8} more sessions
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          illustration="calendar-plus"
          heading="No sessions this week"
          description="Head to the schedule to generate sessions for your athletes."
          ctaLabel="Go to Schedule"
          ctaHref="/schedule"
        />
      )}

      {/* Alerts */}
      {lowPackages.length > 0 && (
        <Card className="mb-4 border-amber-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-amber-400">Package Alerts</CardTitle>
              <Link href="/packages" className="text-xs text-accent hover:underline">All packages &rarr;</Link>
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

      {/* Quick nav */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { href: "/schedule", label: "Schedule", desc: "Plan your week" },
          { href: "/clients", label: "Clients", desc: "Manage roster" },
          { href: "/outreach", label: "Outreach", desc: "Text athletes" },
          { href: "/packages", label: "Packages", desc: "Track payments" },
          { href: "/reports", label: "Reports", desc: "Export data" },
          { href: "/schedule/availability", label: "Availability", desc: "Set your hours" },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="hover:border-foreground/20 transition-colors cursor-pointer h-full">
              <CardContent className="pt-4 pb-3">
                <div className="font-semibold text-sm">{item.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
