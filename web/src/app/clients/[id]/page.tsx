import { db } from "@/db";
import { clients, packages, sessions, outreach } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DeleteButton } from "./delete-button";
import { MessageHistory } from "./message-history";
import {
  EditableText,
  EditableNumber,
  EditableSelect,
  EditableToggle,
  EditableDays,
  EditableScoreBar,
} from "./editable-fields";

export const dynamic = "force-dynamic";

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active", className: "text-amber-400" },
  { value: "in_season", label: "In Season", className: "text-emerald-400" },
  { value: "on_break", label: "On Break", className: "text-muted-foreground" },
  { value: "vacation", label: "Vacation", className: "text-muted-foreground" },
  { value: "inactive", label: "Inactive", className: "text-muted-foreground" },
];

const GRADE_OPTIONS = [
  { value: "freshman", label: "Freshman" },
  { value: "sophomore", label: "Sophomore" },
  { value: "junior", label: "Junior" },
  { value: "senior", label: "Senior" },
  { value: "post_grad", label: "Post-Grad" },
  { value: "adult", label: "Adult" },
];

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (isNaN(clientId)) notFound();

  const client = await db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!client) notFound();

  const clientPackages = await db.select().from(packages).where(eq(packages.clientId, clientId)).all();
  const recentSessions = await db.select().from(sessions).where(eq(sessions.clientId, clientId)).orderBy(desc(sessions.scheduledDate)).limit(10).all();

  const clientMessages = await db
    .select()
    .from(outreach)
    .where(eq(outreach.clientId, clientId))
    .orderBy(outreach.sentAt)
    .all();

  const allClientSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.clientId, clientId))
    .all();

  const totalCompleted = allClientSessions.filter((s) => s.status === "completed").length;
  const totalCancelled = allClientSessions.filter((s) => s.status === "cancelled").length;
  const totalNoShow = allClientSessions.filter((s) => s.status === "no_show").length;

  // Build weekly session counts for histogram (last 12 weeks)
  const weeklyData: { week: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const day = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const weekStart = mon.toISOString().split("T")[0];
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const weekEnd = sun.toISOString().split("T")[0];
    const count = allClientSessions.filter(
      (s) => s.scheduledDate >= weekStart && s.scheduledDate <= weekEnd && s.status === "completed"
    ).length;
    weeklyData.push({ week: mon.toLocaleDateString("en-US", { month: "short", day: "numeric" }), count });
  }
  const maxCount = Math.max(...weeklyData.map((w) => w.count), 1);

  const memberSince = client.createdAt
    ? new Date(client.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "Unknown";

  const activePackage = clientPackages.find((p) => p.status === "active" || p.status === "unpaid");
  const preferredDays: string[] = client.preferredDays ? JSON.parse(client.preferredDays) : [];

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <Link
        href="/clients"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 inline-block"
      >
        &larr; Back to Clients
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            <EditableText clientId={clientId} field="name" value={client.name} className="text-2xl sm:text-3xl font-bold" inputClassName="text-2xl sm:text-3xl font-bold" />
          </h1>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
            <EditableSelect
              clientId={clientId}
              field="category"
              value={client.category}
              options={STATUS_OPTIONS}
            />
            <EditableToggle
              clientId={clientId}
              field="collegeBound"
              value={client.collegeBound}
              label="College Bound"
            />
            {client.gradeLevel && (
              <EditableSelect
                clientId={clientId}
                field="gradeLevel"
                value={client.gradeLevel}
                options={GRADE_OPTIONS}
              />
            )}
            {!client.gradeLevel && (
              <EditableSelect
                clientId={clientId}
                field="gradeLevel"
                value=""
                options={[{ value: "", label: "Set grade..." }, ...GRADE_OPTIONS]}
              />
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-3">
            <DeleteButton clientId={clientId} clientName={client.name} />
            <a
              href={`tel:${client.phone}`}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {formatPhoneNumber(client.phone)}
            </a>
          </div>
          {client.email && (
            <a href={`mailto:${client.email}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {client.email}
            </a>
          )}
          {client.parentGuardian && (
            <span className="text-sm text-muted-foreground">Parent: {client.parentGuardian}</span>
          )}
        </div>
      </div>

      {/* Activity */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{totalCompleted}</div>
            <div className="text-xs text-muted-foreground">Sessions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-emerald-400">
              {totalCompleted + totalCancelled + totalNoShow > 0
                ? Math.round((totalCompleted / (totalCompleted + totalCancelled + totalNoShow)) * 100)
                : 0}%
            </div>
            <div className="text-xs text-muted-foreground">Completion</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-muted-foreground">{memberSince}</div>
            <div className="text-xs text-muted-foreground">Member since</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-end gap-[3px] h-10">
            {weeklyData.map((w, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-blue-500/70 hover:bg-blue-500 transition-colors"
                style={{ height: `${w.count === 0 ? 2 : Math.max(6, (w.count / maxCount) * 40)}px` }}
                title={`${w.week}: ${w.count}`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-muted-foreground">{weeklyData[0]?.week}</span>
            <span className="text-[10px] text-muted-foreground">This week</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-6">
              <div className="flex-1">
                <div className="text-sm text-muted-foreground mb-1">Session Rate</div>
                <div className="text-sm font-medium">
                  {client.sessionRate ? `$${(client.sessionRate / 100).toFixed(0)}/session` : "—"}
                </div>
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground mb-1">Session Type</div>
                <div className="text-sm font-medium capitalize">{client.sessionType ?? "—"}</div>
              </div>
            </div>
            <Separator />
            <div>
              <div className="text-sm text-muted-foreground mb-1">Effort Score</div>
              <EditableScoreBar clientId={clientId} score={client.behaviorScore} />
            </div>
            <Separator />
            <div>
              <div className="text-sm text-muted-foreground mb-1">Preferred Days</div>
              <EditableDays clientId={clientId} value={preferredDays} />
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Preferred Time</div>
              <EditableText
                clientId={clientId}
                field="preferredTime"
                value={client.preferredTime ?? ""}
                className="text-sm"
                inputClassName="text-sm"
              />
            </div>
            <Separator />
            <div>
              <div className="text-sm text-muted-foreground mb-1">Standing Slot</div>
              <EditableText
                clientId={clientId}
                field="standingSlot"
                value={client.standingSlot ?? ""}
                className="text-sm"
                inputClassName="text-sm w-full"
              />
              <div className="text-xs text-muted-foreground mt-1">e.g. "Mon 3pm, Wed 3pm" — auto-fills each week, no text needed</div>
            </div>
            <Separator />
            <div>
              <div className="text-sm text-muted-foreground mb-1">Sessions per week</div>
              <div className="flex items-center gap-1 text-sm">
                <EditableNumber clientId={clientId} field="maxSessionsPerWeek" value={client.maxSessionsPerWeek} min={1} max={7} /> max
              </div>
            </div>
            <Separator />
            <div>
              <div className="text-sm text-muted-foreground mb-1">Notes</div>
              <EditableText
                clientId={clientId}
                field="notes"
                value={client.notes ?? ""}
                className="text-sm"
                inputClassName="text-sm w-full"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Package</CardTitle>
              {activePackage?.status === "unpaid" && (
                <Badge className="bg-red-600 text-white border-0 hover:bg-red-600">UNPAID</Badge>
              )}
            </div>
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
                    {activePackage.pricePerSession && (
                      <div className="text-foreground font-medium">${(activePackage.pricePerSession / 100).toFixed(0)}/session</div>
                    )}
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
                  <div className="text-sm text-red-400 font-medium">Package almost exhausted</div>
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

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <MessageHistory
              clientId={clientId}
              clientName={client.name}
              messages={clientMessages}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
