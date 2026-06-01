import { db } from "@/db";
import { clients, packages, sessions, outreach } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteButton } from "./delete-button";
import { MessageHistory } from "./message-history";
import { SessionHistoryCard } from "./session-history-card";
import { getTransactionHistory } from "@/lib/package-accounting";
import { DAY_NAMES_BY_INDEX } from "@/lib/constants";
import {
  EditableText,
  EditableSelect,
  EditableToggle,
} from "./editable-fields";
import { formatPhoneNumber } from "@/lib/utils";
import { ClientActivityStats } from "./client-activity-stats";
import { LastWeekCard } from "./last-week-card";
import { SchedulePatternCard } from "./schedule-pattern-card";
import { ClientProfileCard } from "./client-profile-card";
import { ClientPackageCard } from "./client-package-card";

export const dynamic = "force-dynamic";

/** Limits for per-client queries */
const SESSION_LIMIT = 500;
const OUTREACH_LIMIT = 200;

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

  // These queries are all independent — run in parallel
  const [clientPackages, clientMessages, allClientSessions, transactionHistory, sessionCounts] = await Promise.all([
    db.select().from(packages).where(eq(packages.clientId, clientId)).all(),
    db
      .select()
      .from(outreach)
      .where(eq(outreach.clientId, clientId))
      .orderBy(desc(outreach.sentAt))
      .limit(OUTREACH_LIMIT)
      .all(),
    db
      .select()
      .from(sessions)
      .where(eq(sessions.clientId, clientId))
      .orderBy(desc(sessions.scheduledDate))
      .limit(SESSION_LIMIT)
      .all(),
    getTransactionHistory(clientId, 10),
    db
      .select({
        status: sessions.status,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(sessions)
      .where(eq(sessions.clientId, clientId))
      .groupBy(sessions.status)
      .all(),
  ]);

  // Use accurate SQL counts instead of filtering limited rows
  const countByStatus = new Map(sessionCounts.map((r) => [r.status, r.count]));
  const totalCompleted = countByStatus.get("completed") ?? 0;
  const totalCancelled = countByStatus.get("cancelled") ?? 0;
  const totalNoShow = countByStatus.get("no_show") ?? 0;
  const totalSessionCount = sessionCounts.reduce((sum, r) => sum + r.count, 0);

  // Messages come back in desc order; reverse for chronological display
  const clientMessagesChronological = [...clientMessages].reverse();

  const memberSince = client.createdAt
    ? new Date(client.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "Unknown";

  const activePackage = clientPackages.find((p) => p.status === "active" || p.status === "unpaid" || p.status === "exhausted");

  // Schedule pattern computation
  const { scheduleGrid, maxDayTimeScore, allTimeSlots, coreHours } = computeSchedulePattern(allClientSessions);

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

      <ClientActivityStats
        totalCompleted={totalCompleted}
        totalCancelled={totalCancelled}
        totalNoShow={totalNoShow}
        memberSince={memberSince}
      />

      <LastWeekCard sessions={allClientSessions} />

      <SchedulePatternCard
        scheduleGrid={scheduleGrid}
        maxDayTimeScore={maxDayTimeScore}
        allTimeSlots={allTimeSlots}
        coreHours={coreHours}
        totalSessions={totalSessionCount}
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ClientProfileCard
          clientId={clientId}
          client={client}
          allClientSessions={allClientSessions}
        />

        <ClientPackageCard
          clientId={clientId}
          activePackage={activePackage}
          transactionHistory={transactionHistory}
        />

        <SessionHistoryCard sessions={allClientSessions} />

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <MessageHistory
              clientId={clientId}
              clientName={client.name}
              messages={clientMessagesChronological}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

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

function computeSchedulePattern(allClientSessions: { scheduledDate: string; scheduledTime: string }[]) {
  const now = Date.now();
  const FULL_WEIGHT_DAYS = 30;
  const HALF_LIFE_DAYS = 60;
  const dayTimeScores = new Map<string, number>();
  const clientTimeSlots = new Set<string>();

  for (const s of allClientSessions) {
    const d = new Date(s.scheduledDate + "T12:00:00");
    const day = DAY_NAMES_BY_INDEX[d.getDay()];
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

  const coreHours = new Set(CORE_HOURS);
  const edgeTimes = [...clientTimeSlots].filter((t) => !coreHours.has(t));
  const allTimeSlots = [...CORE_HOURS, ...edgeTimes].sort((a, b) => timeSortKey(a) - timeSortKey(b));

  return { scheduleGrid, maxDayTimeScore, allTimeSlots, coreHours };
}
