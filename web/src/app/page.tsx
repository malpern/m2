import { db } from "@/db";
import { clients, packages, sessions } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default async function DashboardPage() {
  const activeClients = db
    .select({ count: sql<number>`count(*)` })
    .from(clients)
    .where(sql`${clients.category} IN ('active', 'in_season')`)
    .get();

  const lowPackages = db
    .select({
      name: clients.name,
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

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Your week at a glance.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Athletes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {activeClients?.count ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Package Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-400">
              {lowPackages.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              athletes with 2 or fewer sessions left
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unreconciled Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-400">
              {unreconciledCount?.count ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              completed but not deducted from a package
            </p>
          </CardContent>
        </Card>
      </div>

      {lowPackages.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Package Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {lowPackages.map((p) => (
                <li
                  key={p.name}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-amber-400 font-semibold">
                    {p.remaining} session{p.remaining === 1 ? "" : "s"} left
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {[
          { href: "/clients", label: "Clients", desc: "Manage your roster" },
          { href: "/schedule", label: "Schedule", desc: "Plan your week" },
          { href: "/outreach", label: "Outreach", desc: "Text your athletes" },
          { href: "/packages", label: "Packages", desc: "Track payments" },
          { href: "/reports", label: "Reports", desc: "Export session logs" },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="hover:border-foreground/20 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{item.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
