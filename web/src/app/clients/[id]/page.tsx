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
import { SessionHistoryCard } from "./session-history-card";
import {
  EditableText,
  EditableNumber,
  EditableSelect,
  EditableToggle,
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

  const memberSince = client.createdAt
    ? new Date(client.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "Unknown";

  const activePackage = clientPackages.find((p) => p.status === "active" || p.status === "unpaid" || p.status === "exhausted");
  const preferredDays: string[] = client.preferredDays ? JSON.parse(client.preferredDays) : [];

  function timeLabel(hhmm: string): string {
    const [h, m] = hhmm.split(":").map(Number);
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const suffix = h >= 12 ? "pm" : "am";
    return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
  }

  function timeSortKey(label: string): number {
    const m = label.match(/^(\d+):?(\d+)?(am|pm)$/);
    if (!m) return 0;
    let h = parseInt(m[1]);
    if (m[3] === "pm" && h !== 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    return h * 60 + (parseInt(m[2] ?? "0"));
  }

  const CORE_HOURS = ["11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm"];
  const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  // Compute per-client day×time frequencies weighted by recency
  const now = Date.now();
  const FULL_WEIGHT_DAYS = 30;
  const HALF_LIFE_DAYS = 60;
  const dayTimeScores = new Map<string, number>();
  const clientTimeSlots = new Set<string>();
  for (const s of allClientSessions) {
    const d = new Date(s.scheduledDate + "T12:00:00");
    const day = DAY_NAMES[d.getDay()];
    const slot = timeLabel(s.scheduledTime);
    const ageDays = (now - d.getTime()) / 86400000;
    const weight = ageDays <= FULL_WEIGHT_DAYS ? 1 : Math.pow(0.5, (ageDays - FULL_WEIGHT_DAYS) / HALF_LIFE_DAYS);
    const key = `${day}:${slot}`;
    dayTimeScores.set(key, (dayTimeScores.get(key) ?? 0) + weight);
    clientTimeSlots.add(slot);
  }
  const maxDayTimeScore = Math.max(...dayTimeScores.values(), 0.01);
  const scheduleGrid: Record<string, Record<string, number>> = {};
  for (const [key, score] of dayTimeScores) {
    const sep = key.indexOf(":");
    const day = key.slice(0, sep);
    const time = key.slice(sep + 1);
    if (!scheduleGrid[day]) scheduleGrid[day] = {};
    scheduleGrid[day][time] = score;
  }

  // Core hours + any edge-case times this client has actually used
  const coreSet = new Set(CORE_HOURS);
  const edgeTimes = [...clientTimeSlots].filter((t) => !coreSet.has(t));
  const allTimeSlots = [...CORE_HOURS, ...edgeTimes].sort((a, b) => timeSortKey(a) - timeSortKey(b));
  const activeDays = DAY_ORDER;

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
      <div className="grid grid-cols-4 gap-3 mb-6">
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
            <div className={`text-2xl font-bold ${totalNoShow > 0 ? "text-red-400" : "text-muted-foreground"}`}>{totalNoShow}</div>
            <div className="text-xs text-muted-foreground">No-Shows</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-muted-foreground">{memberSince}</div>
            <div className="text-xs text-muted-foreground">Member since</div>
          </CardContent>
        </Card>
      </div>


      {allClientSessions.length > 0 && (() => {
        const sorted = [...allClientSessions]
          .filter((s) => s.status === "completed" || s.status === "confirmed")
          .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

        const today = new Date();
        const lastMonday = new Date(today);
        const dow = lastMonday.getDay();
        lastMonday.setDate(lastMonday.getDate() - (dow === 0 ? 6 : dow - 1) - 7);
        const lastSunday = new Date(lastMonday);
        lastSunday.setDate(lastMonday.getDate() + 6);
        const lwStart = lastMonday.toISOString().split("T")[0];
        const lwEnd = lastSunday.toISOString().split("T")[0];

        const lastWeekSessions = sorted.filter(
          (s) => s.scheduledDate >= lwStart && s.scheduledDate <= lwEnd
        );

        const typicalDayTime = new Map<string, number>();
        for (const s of sorted) {
          const d = new Date(s.scheduledDate + "T12:00:00");
          const day = DAY_NAMES[d.getDay()];
          const time = timeLabel(s.scheduledTime);
          const k = `${day.slice(0, 3)} ${time}`;
          typicalDayTime.set(k, (typicalDayTime.get(k) ?? 0) + 1);
        }
        const totalSorted = sorted.length || 1;

        return (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Last Week</CardTitle>
              </CardHeader>
              <CardContent>
                {lastWeekSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sessions last week.</p>
                ) : (
                  <div className="space-y-2">
                    {lastWeekSessions.map((s) => {
                      const d = new Date(s.scheduledDate + "T12:00:00");
                      const dayName = DAY_NAMES[d.getDay()];
                      const time = timeLabel(s.scheduledTime);
                      const label = `${dayName.slice(0, 3)} ${time}`;
                      const count = typicalDayTime.get(label) ?? 0;
                      const pct = Math.round((count / totalSorted) * 100);
                      const isUnusual = pct < 10;
                      return (
                        <div key={s.id} className="flex items-center justify-between py-1.5">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium capitalize">{dayName.slice(0, 3)}</span>
                            <span className="text-sm tabular-nums text-muted-foreground">{time}</span>
                          </div>
                          {isUnusual ? (
                            <span className="text-[10px] font-medium bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded">
                              Unusual — only {pct}% of sessions
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              {pct}% of sessions
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
      </>);
      })()}

      {allClientSessions.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Schedule Pattern</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-left pb-2 pr-2 w-16" />
                    {activeDays.map((day) => (
                      <th key={day} className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center pb-2 px-1">
                        {day.slice(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allTimeSlots.map((time) => {
                    const isEdge = !coreSet.has(time);
                    return (
                      <tr key={time}>
                        <td className={`text-xs pr-2 py-0.5 text-right tabular-nums ${isEdge ? "text-muted-foreground/50 italic" : "text-muted-foreground"}`}>{time}</td>
                        {activeDays.map((day) => {
                          const count = scheduleGrid[day]?.[time] ?? 0;
                          const intensity = count / maxDayTimeScore;
                          return (
                            <td key={day} className="px-1 py-0.5 text-center">
                              <div
                                className="mx-auto h-6 rounded transition-colors"
                                style={{
                                  backgroundColor: count > 0
                                    ? `rgba(96, 165, 250, ${0.1 + intensity * 0.6})`
                                    : "rgba(255,255,255,0.02)",
                                }}
                                title={count > 0 ? `${day.slice(0,3)} ${time}: ${count} sessions` : ""}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground mt-3">Based on {allClientSessions.length} sessions. Brighter = more frequent.</p>
          </CardContent>
        </Card>
      )}

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
              {(() => {
                if (!client.standingSlot) return null;
                const recent = allClientSessions
                  .filter((s) => s.status === "completed")
                  .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))
                  .slice(0, 8);
                if (recent.length < 4) return null;

                const standingLower = client.standingSlot.toLowerCase();
                const recentSlots = recent.map((s) => {
                  const d = new Date(s.scheduledDate + "T12:00:00");
                  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
                  return `${dayNames[d.getDay()]} ${s.slot}`;
                });

                const matchCount = recentSlots.filter((rs) => standingLower.includes(rs)).length;
                const matchPct = matchCount / recentSlots.length;

                if (matchPct >= 0.5) return null;

                const dayCounts = new Map<string, number>();
                for (const rs of recentSlots) dayCounts.set(rs, (dayCounts.get(rs) ?? 0) + 1);
                const topSlots = [...dayCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s]) => s);
                const suggestion = topSlots.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(", ");

                return (
                  <div className="mt-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                    Pattern shift — recent sessions are mostly <strong>{suggestion}</strong>, not matching the standing slot.
                  </div>
                );
              })()}
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
              <div className="text-sm text-muted-foreground mb-1">Calendar Invites</div>
              <EditableSelect
                clientId={clientId}
                field="calendarInviteOptIn"
                value={client.calendarInviteOptIn === null ? "not_asked" : client.calendarInviteOptIn ? "opted_in" : "opted_out"}
                options={[
                  { value: "not_asked", label: "Not asked yet", className: "text-muted-foreground" },
                  { value: "opted_in", label: "Opted in", className: "text-emerald-400" },
                  { value: "opted_out", label: "Opted out", className: "text-red-400" },
                ]}
              />
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

        <SessionHistoryCard sessions={allClientSessions} />

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
