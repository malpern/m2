import { db } from "@/db";
import { clients, packages, sessions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusChanger } from "./status-changer";

export const dynamic = "force-dynamic";

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className={`h-5 w-2.5 rounded-sm ${
            i < score ? "bg-blue-500" : "bg-muted"
          }`}
        />
      ))}
      <span className="ml-2 text-sm text-muted-foreground">{score}/10</span>
    </div>
  );
}

function categoryBadge(category: string) {
  switch (category) {
    case "in_season":
      return <Badge className="bg-emerald-500/15 text-emerald-400 border-0">In Season</Badge>;
    case "active":
      return <Badge className="bg-amber-500/15 text-amber-400 border-0">Active</Badge>;
    case "on_break":
      return <Badge variant="secondary">On Break</Badge>;
    case "vacation":
      return <Badge variant="secondary">Vacation</Badge>;
    case "inactive":
      return <Badge variant="secondary">Inactive</Badge>;
    default:
      return <Badge variant="secondary">{category}</Badge>;
  }
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (isNaN(clientId)) notFound();

  const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!client) notFound();

  const clientPackages = db.select().from(packages).where(eq(packages.clientId, clientId)).all();
  const recentSessions = db.select().from(sessions).where(eq(sessions.clientId, clientId)).orderBy(desc(sessions.scheduledDate)).limit(10).all();

  const activePackage = clientPackages.find((p) => p.status === "active");
  const preferredDays: string[] = client.preferredDays ? JSON.parse(client.preferredDays) : [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href="/clients"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 inline-block"
      >
        &larr; Back to Clients
      </Link>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <StatusChanger clientId={client.id} currentStatus={client.category} />
            {client.collegeBound && (
              <Badge className="bg-purple-500/15 text-purple-400 border-0">College Bound</Badge>
            )}
            {client.gradeLevel && (
              <span className="text-sm text-muted-foreground capitalize">{client.gradeLevel}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/clients/${clientId}/edit`}>
            <Button variant="outline" size="sm">Edit</Button>
          </Link>
          <div className="text-right text-sm text-muted-foreground">
            <div>{client.phone}</div>
            <div>Max {client.maxSessionsPerWeek} session{client.maxSessionsPerWeek === 1 ? "" : "s"}/week</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Effort Score</div>
              <ScoreBar score={client.behaviorScore} />
            </div>
            <Separator />
            <div>
              <div className="text-sm text-muted-foreground mb-1">Preferred Days</div>
              <div className="flex gap-2">
                {preferredDays.length > 0
                  ? preferredDays.map((day) => (
                      <Badge key={day} variant="secondary" className="capitalize">{day}</Badge>
                    ))
                  : <span className="text-sm text-muted-foreground">No preference</span>}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Preferred Time</div>
              <div className="text-sm">{client.preferredTime ?? "Flexible"}</div>
            </div>
            {client.notes && (
              <>
                <Separator />
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Notes</div>
                  <div className="text-sm">{client.notes}</div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Package</CardTitle>
          </CardHeader>
          <CardContent>
            {activePackage ? (
              <div className="space-y-4">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Sessions Remaining</div>
                    <div className="text-4xl font-bold mt-1">
                      {activePackage.totalSessions - activePackage.sessionsUsed}
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <div>{activePackage.sessionsUsed} used</div>
                    <div>{activePackage.totalSessions} total</div>
                  </div>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      activePackage.totalSessions - activePackage.sessionsUsed <= 2
                        ? "bg-red-500"
                        : activePackage.totalSessions - activePackage.sessionsUsed <= 4
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    }`}
                    style={{
                      width: `${((activePackage.totalSessions - activePackage.sessionsUsed) / activePackage.totalSessions) * 100}%`,
                    }}
                  />
                </div>
                {activePackage.totalSessions - activePackage.sessionsUsed <= 2 && (
                  <div className="text-sm text-red-400 font-medium">
                    Package almost exhausted
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-4">No active package.</div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {recentSessions.length > 0 ? (
              <div className="space-y-2">
                {recentSessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between py-2 text-sm border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <span>{session.scheduledDate}</span>
                      <span className="text-muted-foreground">{session.scheduledTime}</span>
                    </div>
                    <Badge
                      className={
                        session.status === "completed" ? "bg-emerald-500/15 text-emerald-400 border-0"
                        : session.status === "confirmed" ? "bg-blue-500/15 text-blue-400 border-0"
                        : session.status === "cancelled" ? "bg-red-500/15 text-red-400 border-0"
                        : ""
                      }
                    >
                      {session.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-4">No sessions recorded yet.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
