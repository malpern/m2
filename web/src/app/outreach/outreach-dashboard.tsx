"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markConfirmed, markDeclined, overrideStatus, sendOutreachBatch, retrySend } from "./actions";
import { EmptyState } from "@/components/empty-state";
import type { OutreachItem } from "@/lib/outreach-engine";

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    standing: "bg-blue-500/15 text-blue-400",
    pending: "bg-muted text-muted-foreground",
    sent: "bg-amber-500/15 text-amber-400",
    send_failed: "bg-red-500/15 text-red-400",
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
    send_failed: "Failed",
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

function formatElapsed(sentAt: string): { text: string; color: string } {
  const elapsed = Date.now() - new Date(sentAt).getTime();
  const totalMinutes = Math.floor(elapsed / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const text = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  if (totalMinutes >= 150) return { text, color: "text-red-400" };
  if (totalMinutes >= 60) return { text, color: "text-amber-400" };
  return { text, color: "text-muted-foreground" };
}

function FollowUpCancelButton({ sessionId }: { sessionId: number }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-xs text-red-400 hover:text-red-300"
      disabled={isPending}
      onClick={() => startTransition(() => markDeclined(sessionId))}
    >
      Cancel
    </Button>
  );
}

function OutreachRow({ item, weekOf }: { item: OutreachItem; weekOf: string }) {
  const [isPending, startTransition] = useTransition();

  const dayLabel = new Date(item.date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
  });

  const elapsed = item.status === "sent" && item.sentAt ? formatElapsed(item.sentAt) : null;

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-border last:border-0 transition-all duration-300 ${isPending ? "opacity-50 scale-[0.99]" : "opacity-100 scale-100"}`}>
      <div className="flex items-center gap-3 sm:contents">
        <div className="w-16 shrink-0 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-foreground">{dayLabel}</span>
            {item.wave > 0 && (
              <span className="text-[10px] text-muted-foreground/60">W{item.wave}</span>
            )}
          </div>
          <div>{item.slot}</div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Link href={`/clients/${item.clientId}`} className="font-semibold text-sm hover:underline">{item.clientName}</Link>
            {item.outreachGroupId && (
              <svg className="w-3 h-3 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            )}
          </div>
          {item.replyText && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              &ldquo;{item.replyText}&rdquo;
              {item.messageCount > 1 && (
                <span className="ml-1.5 text-muted-foreground/50">{item.messageCount} msgs</span>
              )}
            </div>
          )}
          {!item.replyText && item.messageCount > 1 && (
            <div className="text-xs text-muted-foreground/50 mt-0.5">{item.messageCount} msgs</div>
          )}
          {item.sendError && (
            <div className="text-xs text-red-400 mt-0.5 truncate" title={item.sendError}>
              Send failed: {item.sendError}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 ml-16 sm:ml-0">
        {statusBadge(item.status)}

        {item.isAutoFill && (
          <Badge className="border-0 bg-cyan-500/15 text-cyan-400 text-[10px] px-1.5 py-0">
            Auto-fill
          </Badge>
        )}

        {elapsed && (
          <span className={`text-xs ${elapsed.color}`}>{elapsed.text}</span>
        )}

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

        {item.status === "send_failed" && item.outreachId && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-red-400 hover:text-red-300"
            onClick={() => startTransition(() => { retrySend(item.outreachId!); })}
          >
            Retry
          </Button>
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
  followUpItems = [],
  weekOf,
  hasAiBillingError,
}: {
  items: OutreachItem[];
  summary: ReturnType<typeof import("@/lib/outreach-engine").getOutreachSummary>;
  nextBatch: OutreachItem[];
  needsAttention: OutreachItem[];
  followUpItems?: OutreachItem[];
  weekOf: string;
  hasAiBillingError?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");

  const query = search.toLowerCase().trim();

  const filteredItems = useMemo(
    () =>
      items.filter(
        (i) => !query || i.clientName.toLowerCase().includes(query)
      ),
    [items, query]
  );

  const filteredNeedsAttention = useMemo(
    () =>
      needsAttention.filter(
        (i) => !query || i.clientName.toLowerCase().includes(query)
      ),
    [needsAttention, query]
  );

  const filteredFollowUps = useMemo(
    () =>
      followUpItems.filter(
        (i) => !query || i.clientName.toLowerCase().includes(query)
      ),
    [followUpItems, query]
  );

  const weekLabel = new Date(weekOf + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (items.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Outreach</h1>
        </div>
        <EmptyState
          illustration="message"
          heading="No outreach to send"
          description="Generate a schedule first, then come back to send outreach."
          ctaLabel="Go to Schedule"
          ctaHref="/schedule"
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Outreach</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Week of {weekLabel}
            {query && (
              <span className="ml-2">
                &middot; Showing {filteredItems.length} of {items.length}
              </span>
            )}
            {isPending && <span className="ml-2 text-blue-400">Sending...</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="h-8 w-full sm:w-52 rounded-md border border-border bg-muted/50 pl-8 pr-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring focus:bg-background transition-colors"
            />
          </div>
          {nextBatch.length > 0 && (
            <Button
              onClick={() =>
                startTransition(() => {
                  sendOutreachBatch(nextBatch.map((i) => i.sessionId), weekOf);
                })
              }
              disabled={isPending}
              size="sm"
            >
              Send Next Batch ({nextBatch.length})
            </Button>
          )}
          <Link href="/outreach/live">
            <Button variant="outline" size="sm">Mission Control</Button>
          </Link>
        </div>
      </div>

      {hasAiBillingError && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            <span className="text-sm text-amber-200">AI reply classification is paused — Anthropic API credits exhausted. Replies are being saved but not auto-classified.</span>
          </div>
          <a
            href="https://console.anthropic.com/settings/billing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-amber-400 hover:text-amber-300 whitespace-nowrap ml-3"
          >
            Add credits &rarr;
          </a>
        </div>
      )}

      {/* Summary cards */}
      <div className={`grid grid-cols-2 ${summary.failed > 0 ? "sm:grid-cols-5" : "sm:grid-cols-4"} gap-3 mb-8`}>
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent" />
          <CardContent className="relative pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-400">{summary.confirmed}</div>
                <div className="text-xs text-muted-foreground">Confirmed</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent" />
          <CardContent className="relative pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-400">{summary.sent}</div>
                <div className="text-xs text-muted-foreground">Waiting</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent" />
          <CardContent className="relative pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-400">{summary.needsAttention}</div>
                <div className="text-xs text-muted-foreground">Needs You</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent" />
          <CardContent className="relative pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>
              </div>
              <div>
                <div className="text-2xl font-bold">{summary.pending}</div>
                <div className="text-xs text-muted-foreground">Queued</div>
              </div>
            </div>
          </CardContent>
        </Card>
        {summary.failed > 0 && (
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent" />
            <CardContent className="relative pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/15 flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-400">{summary.failed}</div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Failed sends */}
      {filteredItems.filter((i) => i.status === "send_failed").length > 0 && (
        <Card className="mb-6 border-red-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-400">Failed Sends</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredItems.filter((i) => i.status === "send_failed").map((item) => (
              <OutreachRow key={item.sessionId} item={item} weekOf={weekOf} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Follow-ups pending */}
      {filteredFollowUps.length > 0 && (
        <Card className="mb-6 border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-400">Follow-ups Pending</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredFollowUps.map((item) => (
              <div key={item.sessionId} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-border last:border-0">
                <div className="flex items-center gap-3 sm:contents">
                  <div className="w-16 shrink-0 text-xs text-muted-foreground">
                    <div className="font-semibold text-foreground">
                      {new Date(item.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}
                    </div>
                    <div>{item.slot}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/clients/${item.clientId}`} className="font-semibold text-sm hover:underline">{item.clientName}</Link>
                    {item.sentAt && (
                      <div className="text-xs text-amber-400/80 mt-0.5">
                        Sent {formatElapsed(item.sentAt).text} ago
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-16 sm:ml-0">
                  <Badge className="border-0 bg-amber-500/15 text-amber-400">Awaiting reply</Badge>
                  <FollowUpCancelButton sessionId={item.sessionId} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Needs attention */}
      {filteredNeedsAttention.length > 0 && (
        <Card className="mb-6 border-purple-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-purple-400">Needs Your Decision</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredNeedsAttention.map((item) => (
              <OutreachRow key={item.sessionId} item={item} weekOf={weekOf} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Standing slots */}
      {filteredItems.filter((i) => i.status === "standing").length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-400">Standing Slots</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredItems.filter((i) => i.status === "standing").map((item) => (
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
          {filteredItems.filter((i) => i.status !== "standing").length > 0 ? (
            filteredItems.filter((i) => i.status !== "standing").map((item) => (
              <OutreachRow key={item.sessionId} item={item} weekOf={weekOf} />
            ))
          ) : (
            <div className="text-sm text-muted-foreground py-4">
              {query
                ? <>No sessions match &ldquo;{search}&rdquo;</>
                : "No outreach yet. Generate a schedule first, then send outreach."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
