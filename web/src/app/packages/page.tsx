import { db } from "@/db";
import { clients, packages, sessions } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";

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

  const lowPackages = clientPackages.filter((p) => p.remaining <= 2);
  const totalUnreconciled = unreconciled.length;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Packages</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold">{clientPackages.length}</div>
            <div className="text-xs text-muted-foreground">Active Packages</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold text-amber-400">{lowPackages.length}</div>
            <div className="text-xs text-muted-foreground">Running Low (≤ 2 left)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold text-red-400">{totalUnreconciled}</div>
            <div className="text-xs text-muted-foreground">Unreconciled Sessions</div>
          </CardContent>
        </Card>
      </div>

      {lowPackages.length > 0 && (
        <Card className="mb-6 border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-400">Package Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {lowPackages.map((p) => (
              <div key={p.packageId} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <Link href={`/clients/${p.clientId}`} className="font-semibold text-sm hover:underline">
                  {p.clientName}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{p.sessionsUsed} / {p.totalSessions} used</span>
                  <Badge className={`border-0 ${p.remaining <= 0 ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>
                    {p.remaining} left
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">All Packages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientPackages
                  .sort((a, b) => a.remaining - b.remaining)
                  .map((p) => (
                  <TableRow key={p.packageId}>
                    <TableCell>
                      <Link href={`/clients/${p.clientId}`} className="font-semibold hover:underline">
                        {p.clientName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge className={`border-0 ${
                        p.category === "active" || p.category === "in_season"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {p.category === "in_season" ? "In Season" : p.category}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.sessionsUsed}</TableCell>
                    <TableCell>{p.totalSessions}</TableCell>
                    <TableCell>
                      <Badge className={`border-0 ${
                        p.remaining <= 0 ? "bg-red-500/15 text-red-400"
                        : p.remaining <= 2 ? "bg-amber-500/15 text-amber-400"
                        : "bg-emerald-500/15 text-emerald-400"
                      }`}>
                        {p.remaining}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-[120px]">
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            p.remaining <= 0 ? "bg-red-500"
                            : p.remaining <= 2 ? "bg-amber-500"
                            : p.remaining <= 4 ? "bg-amber-500"
                            : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(100, (p.sessionsUsed / p.totalSessions) * 100)}%` }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {totalUnreconciled > 0 && (
        <Card className="border-red-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-400">
              Unreconciled Sessions ({totalUnreconciled})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">
              These sessions were completed but not deducted from a package. This is where money gets lost.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Slot</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unreconciled.map((s) => (
                    <TableRow key={s.sessionId}>
                      <TableCell>
                        <Link href={`/clients/${s.clientId}`} className="font-semibold hover:underline">
                          {s.clientName}
                        </Link>
                      </TableCell>
                      <TableCell>{s.scheduledDate}</TableCell>
                      <TableCell>{s.scheduledTime}</TableCell>
                      <TableCell>{s.slot}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
