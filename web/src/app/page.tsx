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

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{activeCount?.count ?? 0}</div>
            <div className="text-xs text-muted-foreground">Active Athletes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-blue-400">{proposed + confirmed}</div>
            <div className="text-xs text-muted-foreground">This Week</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-amber-400">{lowPackages.length}</div>
            <div className="text-xs text-muted-foreground">Low Packages</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-red-400">{unreconciledCount?.count ?? 0}</div>
            <div className="text-xs text-muted-foreground">Unreconciled</div>
          </CardContent>
        </Card>
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
