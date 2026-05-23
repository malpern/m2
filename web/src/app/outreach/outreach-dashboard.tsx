"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markConfirmed, markDeclined, overrideStatus, sendOutreachBatch } from "./actions";
import type { OutreachItem } from "@/lib/outreach-engine";

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    standing: "bg-blue-500/15 text-blue-400",
    pending: "bg-muted text-muted-foreground",
    sent: "bg-amber-500/15 text-amber-400",
    confirmed: "bg-emerald-500/15 text-emerald-400",
    declined: "bg-red-500/15 text-red-400",
    reschedule: "bg-purple-500/15 text-purple-400",
    ambiguous: "bg-amber-500/15 text-amber-400",
    no_reply: "bg-muted text-muted-foreground",
    moved_on: "bg-muted text-muted-foreground",
  };
  const labels: Record<string, string> = {
    standing: "Standing",
    pending: "Queued",
    sent: "Waiting",
    confirmed: "Confirmed",
    declined: "Declined",
    reschedule: "Reschedule",
    ambiguous: "Unclear",
    no_reply: "No Reply",
    moved_on: "Moved On",
  };

  return (
    <Badge className={`border-0 ${styles[status] ?? "bg-muted text-muted-foreground"}`}>
      {labels[status] ?? status}
    </Badge>
  );
}

function OutreachRow({ item, weekOf }: { item: OutreachItem; weekOf: string }) {
  const [isPending, startTransition] = useTransition();

  const dayLabel = new Date(item.date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
  });

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-border last:border-0 ${isPending ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-3 sm:contents">
        <div className="w-16 shrink-0 text-xs text-muted-foreground">
          <div className="font-semibold text-foreground">{dayLabel}</div>
          <div>{item.slot}</div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{item.clientName}</div>
          {item.replyText && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              &ldquo;{item.replyText}&rdquo;
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 ml-16 sm:ml-0">
        {statusBadge(item.status)}

        {(item.status === "reschedule" || item.status === "ambiguous") && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-emerald-400 hover:text-emerald-300"
              onClick={() => startTransition(() => markConfirmed(item.sessionId))}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-red-400 hover:text-red-300"
              onClick={() => startTransition(() => markDeclined(item.sessionId))}
            >
              Decline
            </Button>
          </div>
        )}

        {item.status === "sent" && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => startTransition(() => markConfirmed(item.sessionId))}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-red-400"
              onClick={() => startTransition(() => markDeclined(item.sessionId))}
            >
              Decline
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function OutreachDashboard({
  items,
  summary,
  nextBatch,
  needsAttention,
  weekOf,
}: {
  items: OutreachItem[];
  summary: ReturnType<typeof import("@/lib/outreach-engine").getOutreachSummary>;
  nextBatch: OutreachItem[];
  needsAttention: OutreachItem[];
  weekOf: string;
}) {
  const [isPending, startTransition] = useTransition();

  const weekLabel = new Date(weekOf + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Outreach</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Week of {weekLabel}
            {isPending && <span className="ml-2 text-blue-400">Sending...</span>}
          </p>
        </div>
        {nextBatch.length > 0 && (
          <Button
            onClick={() =>
              startTransition(() =>
                sendOutreachBatch(nextBatch.map((i) => i.sessionId), weekOf)
              )
            }
            disabled={isPending}
            size="sm"
          >
            Send Next Batch ({nextBatch.length})
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-emerald-400">{summary.confirmed}</div>
            <div className="text-xs text-muted-foreground">Confirmed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-amber-400">{summary.sent}</div>
            <div className="text-xs text-muted-foreground">Waiting</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-purple-400">{summary.needsAttention}</div>
            <div className="text-xs text-muted-foreground">Needs You</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-muted-foreground">{summary.pending}</div>
            <div className="text-xs text-muted-foreground">Queued</div>
          </CardContent>
        </Card>
      </div>

      {/* Needs attention */}
      {needsAttention.length > 0 && (
        <Card className="mb-6 border-purple-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-purple-400">Needs Your Decision</CardTitle>
          </CardHeader>
          <CardContent>
            {needsAttention.map((item) => (
              <OutreachRow key={item.sessionId} item={item} weekOf={weekOf} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Standing slots */}
      {items.filter((i) => i.status === "standing").length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-400">Standing Slots</CardTitle>
          </CardHeader>
          <CardContent>
            {items.filter((i) => i.status === "standing").map((item) => (
              <OutreachRow key={item.sessionId} item={item} weekOf={weekOf} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* All outreach */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">All Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {items.filter((i) => i.status !== "standing").length > 0 ? (
            items.filter((i) => i.status !== "standing").map((item) => (
              <OutreachRow key={item.sessionId} item={item} weekOf={weekOf} />
            ))
          ) : (
            <div className="text-sm text-muted-foreground py-4">
              No outreach yet. Generate a schedule first, then send outreach.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
