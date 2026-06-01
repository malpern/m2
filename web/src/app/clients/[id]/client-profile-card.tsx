import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  EditableText,
  EditableNumber,
  EditableSelect,
  EditableScoreBar,
} from "./editable-fields";

interface SessionRow {
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  slot: string;
}

export function ClientProfileCard({
  clientId,
  client,
  allClientSessions,
}: {
  clientId: number;
  client: {
    sessionRate: number | null;
    sessionType: string | null;
    behaviorScore: number;
    standingSlot: string | null;
    maxSessionsPerWeek: number;
    calendarInviteOptIn: boolean | null;
    notes: string | null;
  };
  allClientSessions: SessionRow[];
}) {
  return (
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
          <div className="text-xs text-muted-foreground mt-1">e.g. &quot;Mon 3pm, Wed 3pm&quot; &mdash; auto-fills each week, no text needed</div>
          <StandingSlotWarning standingSlot={client.standingSlot} sessions={allClientSessions} />
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
  );
}

function StandingSlotWarning({
  standingSlot,
  sessions,
}: {
  standingSlot: string | null;
  sessions: SessionRow[];
}) {
  if (!standingSlot) return null;

  const recent = sessions
    .filter((s) => s.status === "completed")
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))
    .slice(0, 8);
  if (recent.length < 4) return null;

  const standingLower = standingSlot.toLowerCase();
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
}
