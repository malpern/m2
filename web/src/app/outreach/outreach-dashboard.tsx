"use client";

import { useState, useMemo, useTransition, useCallback, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markConfirmed, markDeclined, overrideStatus, sendOutreachBatch, retrySend, skipClientThisWeek, unskipClientThisWeek, triggerFollowUpNow, cancelDeferral } from "./actions";
import { fetchAutoFillCandidates, type AutoFillCandidateWithBalance } from "@/app/auto-fill-actions";
import { AutoFillDialog } from "@/components/auto-fill-dialog";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import { StatCard } from "@/components/stat-card";
import { useToast } from "@/components/toast";
import type { OutreachItem } from "@/lib/outreach-engine";

const UNDO_DELAY_MS = 5000;

type AutoFillPrompt = {
  sessionId: number;
  candidates: AutoFillCandidateWithBalance[];
  slotLabel: string;
};

function useUndoableDecline(onDeclined?: (sessionId: number) => void) {
  const toast = useToast();
  const [pendingDeclines, setPendingDeclines] = useState<Set<number>>(new Set());
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const decline = useCallback(
    (sessionId: number) => {
      setPendingDeclines((prev) => new Set(prev).add(sessionId));

      const timer = setTimeout(async () => {
        timersRef.current.delete(sessionId);
        await markDeclined(sessionId);
        setPendingDeclines((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
        onDeclined?.(sessionId);
      }, UNDO_DELAY_MS);

      timersRef.current.set(sessionId, timer);

      toast("Session declined", {
        type: "info",
        duration: UNDO_DELAY_MS,
        action: {
          label: "Undo",
          onClick: () => {
            const existing = timersRef.current.get(sessionId);
            if (existing) {
              clearTimeout(existing);
              timersRef.current.delete(sessionId);
            }
            setPendingDeclines((prev) => {
              const next = new Set(prev);
              next.delete(sessionId);
              return next;
            });
          },
        },
      });
    },
    [toast, onDeclined]
  );

  return { decline, pendingDeclines };
}

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

function FollowUpCancelButton({
  sessionId,
  onDecline,
  isPendingDecline,
}: {
  sessionId: number;
  onDecline: (sessionId: number) => void;
  isPendingDecline: boolean;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-9 text-xs text-red-400 hover:text-red-300"
      disabled={isPendingDecline}
      aria-label="Cancel follow-up session"
      onClick={() => onDecline(sessionId)}
    >
      Cancel
    </Button>
  );
}

// Minutes remaining until a deferred follow-up is due. Kept out of the
// component body so the current-time read is not evaluated during render.
function minutesUntil(followUpAt: string): number {
  const remaining = new Date(followUpAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(remaining / 60_000));
}

function DeferredBadge({ followUpAt, outreachId }: { followUpAt: string; outreachId: number | null }) {
  const [isPending, startTransition] = useTransition();
  const toast = useToast();
  const minutes = minutesUntil(followUpAt);
  const label = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  const isReady = minutes <= 0;

  return (
    <div className="flex items-center gap-1.5">
      <Badge className={`border-0 ${isReady ? "bg-amber-500/15 text-amber-400" : "bg-blue-500/15 text-blue-400"}`}>
        {isReady ? "Ready to follow up" : `Follow up in ${label}`}
      </Badge>
      {outreachId && (
        <>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2"
            disabled={isPending}
            onClick={() => startTransition(async () => {
              await triggerFollowUpNow(outreachId);
              toast("Follow-up sent");
            })}
          >
            {isPending ? "..." : "Send now"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2 text-muted-foreground"
            disabled={isPending}
            onClick={() => startTransition(async () => {
              await cancelDeferral(outreachId);
              toast("Deferral cancelled");
            })}
          >
            Cancel
          </Button>
        </>
      )}
    </div>
  );
}

function OutreachRow({
  item,
  weekOf,
  onDecline,
  isPendingDecline,
  onSkip,
}: {
  item: OutreachItem;
  weekOf: string;
  onDecline: (sessionId: number) => void;
  isPendingDecline: boolean;
  onSkip?: (clientId: number) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const dayLabel = new Date(item.date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
  });

  const elapsed = item.status === "sent" && item.sentAt ? formatElapsed(item.sentAt) : null;

  return (
    <div className={`group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-border last:border-0 transition-all duration-300 ${isPendingDecline ? "opacity-40 line-through" : isPending ? "opacity-50 scale-[0.99]" : "opacity-100 scale-100"}`}>
      <div className="flex items-center gap-3 sm:contents">
        <div className="w-16 shrink-0 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-foreground">{dayLabel}</span>
            {item.wave > 0 && (
              <span className="text-[10px] text-muted-foreground/60 cursor-default opacity-0 group-hover:opacity-100 transition-opacity" title={`Wave ${item.wave} — ${item.wave === 1 ? "sent first" : item.wave === 2 ? "sent after ~45min" : "sent after ~2hr"}`}>W{item.wave}</span>
            )}
          </div>
          <div>{item.slot}</div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Link href={`/clients/${item.clientId}`} className="font-semibold text-sm hover:underline">{item.clientName}</Link>
            {item.outreachGroupId && (
              <svg className="w-2.5 h-2.5 text-muted-foreground/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            )}
          </div>
          {item.replyText && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              &ldquo;{item.replyText}&rdquo;
              {item.messageCount > 1 && (
                <span className="ml-1.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">{item.messageCount} msgs</span>
              )}
            </div>
          )}
          {!item.replyText && item.messageCount > 1 && (
            <div className="text-xs text-muted-foreground/50 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">{item.messageCount} msgs</div>
          )}
          {item.sendError && (
            <div className="text-xs text-red-400 mt-0.5 truncate" title={item.sendError}>
              Send failed: {item.sendError}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {statusBadge(item.status)}

        {item.isAutoFill && (
          <Badge className="border-0 bg-cyan-500/15 text-cyan-400 text-xs px-1.5 py-0">
            Auto-fill
          </Badge>
        )}

        {elapsed && !item.followUpAt && (
          <span className={`text-xs ${elapsed.color}`}>{elapsed.text}</span>
        )}

        {item.followUpAt && (
          <DeferredBadge followUpAt={item.followUpAt} outreachId={item.outreachId} />
        )}

        {(item.status === "reschedule" || item.status === "ambiguous") && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-xs text-emerald-400 hover:text-emerald-300"
              aria-label={`Confirm session for ${item.clientName}`}
              onClick={() =>
                startTransition(async () => {
                  await markConfirmed(item.sessionId);
                  toast("Session confirmed");
                })
              }
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-xs text-red-400 hover:text-red-300"
              disabled={isPendingDecline}
              aria-label={`Decline session for ${item.clientName}`}
              onClick={() => onDecline(item.sessionId)}
            >
              Decline
            </Button>
          </div>
        )}

        {item.status === "send_failed" && item.outreachId && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs text-red-400 hover:text-red-300"
            aria-label={`Retry sending message to ${item.clientName}`}
            onClick={() =>
              startTransition(async () => {
                await retrySend(item.outreachId!);
                toast("Message resent");
              })
            }
          >
            Retry
          </Button>
        )}

        {item.status === "sent" && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-xs"
              aria-label={`Confirm session for ${item.clientName}`}
              onClick={() =>
                startTransition(async () => {
                  await markConfirmed(item.sessionId);
                  toast("Session confirmed");
                })
              }
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 text-xs text-red-400"
              disabled={isPendingDecline}
              aria-label={`Decline session for ${item.clientName}`}
              onClick={() => onDecline(item.sessionId)}
            >
              Decline
            </Button>
          </div>
        )}

        {item.status === "pending" && onSkip && (
          <Button
            size="sm"
            variant="ghost"
            className="h-9 text-xs text-muted-foreground hover:text-foreground"
            aria-label={`Skip ${item.clientName} this week`}
            onClick={() => onSkip(item.clientId)}
          >
            Skip
          </Button>
        )}
      </div>
    </div>
  );
}

function getWeekOffset(weekOf: string, offset: number): string {
  const d = new Date(weekOf + "T12:00:00");
  d.setDate(d.getDate() + 7 * offset);
  return d.toISOString().split("T")[0];
}

export function OutreachDashboard({
  items,
  summary,
  nextBatch,
  needsAttention,
  followUpItems = [],
  skippedItems = [],
  weekOf,
  currentWeekOf,
  hasAiBillingError,
}: {
  items: OutreachItem[];
  summary: ReturnType<typeof import("@/lib/outreach-engine").getOutreachSummary>;
  nextBatch: OutreachItem[];
  needsAttention: OutreachItem[];
  followUpItems?: OutreachItem[];
  skippedItems?: OutreachItem[];
  weekOf: string;
  currentWeekOf: string;
  hasAiBillingError?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [autoFillPrompt, setAutoFillPrompt] = useState<AutoFillPrompt | null>(null);
  const toast = useToast();

  const handleDeclined = useCallback(
    async (sessionId: number) => {
      const item = items.find((i) => i.sessionId === sessionId);
      if (!item) return;
      const candidates = await fetchAutoFillCandidates(sessionId);
      if (candidates.length > 0) {
        const dayLabel = new Date(item.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
        setAutoFillPrompt({
          sessionId,
          candidates,
          slotLabel: `${dayLabel} at ${item.slot}`,
        });
      }
    },
    [items]
  );

  const { decline, pendingDeclines } = useUndoableDecline(handleDeclined);

  const handleSkip = useCallback(
    (clientId: number) => {
      const item = items.find((i) => i.clientId === clientId);
      const name = item?.clientName ?? "Client";
      startTransition(async () => {
        await skipClientThisWeek(clientId, weekOf);
        toast(`Skipped ${name} this week`);
      });
    },
    [items, weekOf, toast, startTransition]
  );

  const handleUnskip = useCallback(
    (clientId: number) => {
      const item = skippedItems.find((i) => i.clientId === clientId);
      const name = item?.clientName ?? "Client";
      startTransition(async () => {
        await unskipClientThisWeek(clientId, weekOf);
        toast(`${name} added back to queue`);
      });
    },
    [skippedItems, weekOf, toast, startTransition]
  );

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

  const filteredSkipped = useMemo(
    () =>
      skippedItems.filter(
        (i) => !query || i.clientName.toLowerCase().includes(query)
      ),
    [skippedItems, query]
  );

  const weekLabel = new Date(weekOf + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const isCurrentWeek = weekOf === currentWeekOf;
  const prevWeek = getWeekOffset(weekOf, -1);
  const nextWeek = getWeekOffset(weekOf, 1);

  if (items.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Outreach</h1>
        </div>
        <div className="flex items-center gap-2 mb-6">
          <Link
            href={`/outreach?week=${prevWeek}`}
            className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Previous week"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <p className="text-muted-foreground text-sm">
            Week of {weekLabel}
          </p>
          {isCurrentWeek ? (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded text-muted-foreground/30 cursor-not-allowed">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </span>
          ) : (
            <Link
              href={`/outreach?week=${nextWeek}`}
              className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Next week"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          )}
          {!isCurrentWeek && (
            <Link
              href="/outreach"
              className="ml-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded border border-border hover:bg-muted"
            >
              Today
            </Link>
          )}
        </div>
        <EmptyState
          illustration="message"
          heading="No outreach this week"
          description={isCurrentWeek ? "Generate a schedule first, then come back to send outreach." : "No outreach was sent this week."}
          ctaLabel={isCurrentWeek ? "Go to Schedule" : "Back to this week"}
          ctaHref={isCurrentWeek ? "/schedule" : "/outreach"}
        />
      </div>
    );
  }

  return (
    <div>
      {autoFillPrompt && (
        <AutoFillDialog
          sessionId={autoFillPrompt.sessionId}
          candidates={autoFillPrompt.candidates}
          slotLabel={autoFillPrompt.slotLabel}
          onClose={() => setAutoFillPrompt(null)}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Outreach</h1>
          <div className="flex items-center gap-2 mt-1">
            <Link
              href={`/outreach?week=${prevWeek}`}
              className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Previous week"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <p className="text-muted-foreground text-sm">
              Week of {weekLabel}
            </p>
            {isCurrentWeek ? (
              <span
                className="inline-flex items-center justify-center w-6 h-6 rounded text-muted-foreground/30 cursor-not-allowed"
                title="Already on current week"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </span>
            ) : (
              <Link
                href={`/outreach?week=${nextWeek}`}
                className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Next week"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
            )}
            {!isCurrentWeek && (
              <Link
                href="/outreach"
                className="ml-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded border border-border hover:bg-muted"
              >
                Today
              </Link>
            )}
            {query && (
              <span className="text-sm text-muted-foreground ml-1">
                &middot; Showing {filteredItems.length} of {items.length}
              </span>
            )}
            {isPending && <span className="text-sm text-blue-400 ml-1">Sending...</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SearchInput
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            aria-label="Search outreach by client name"
          />
          {nextBatch.length > 0 && (
            <Button
              onClick={() =>
                startTransition(async () => {
                  await sendOutreachBatch(nextBatch.map((i) => i.sessionId), weekOf);
                  toast("Outreach sent");
                })
              }
              disabled={isPending}
              size="sm"
              aria-label={`Send next batch of ${nextBatch.length} outreach messages`}
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
        <StatCard label="Confirmed" count={summary.confirmed} color="emerald" icon={<svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>} />
        <StatCard label="Waiting" count={summary.sent} color="amber" icon={<svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>} />
        <StatCard label="Needs You" count={summary.needsAttention} color="purple" icon={<svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>} />
        <StatCard label="Queued" count={summary.pending} color="blue" icon={<svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>} />
        {summary.failed > 0 && (
          <StatCard label="Failed" count={summary.failed} color="red" icon={<svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>} />
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
              <OutreachRow key={item.sessionId} item={item} weekOf={weekOf} onDecline={decline} isPendingDecline={pendingDeclines.has(item.sessionId)} onSkip={handleSkip} />
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
              <div key={item.sessionId} className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-border last:border-0 transition-all duration-300 ${pendingDeclines.has(item.sessionId) ? "opacity-40 line-through" : ""}`}>
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
                <div className="flex items-center gap-2">
                  <Badge className="border-0 bg-amber-500/15 text-amber-400">Awaiting reply</Badge>
                  <FollowUpCancelButton sessionId={item.sessionId} onDecline={decline} isPendingDecline={pendingDeclines.has(item.sessionId)} />
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
              <OutreachRow key={item.sessionId} item={item} weekOf={weekOf} onDecline={decline} isPendingDecline={pendingDeclines.has(item.sessionId)} onSkip={handleSkip} />
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
              <OutreachRow key={item.sessionId} item={item} weekOf={weekOf} onDecline={decline} isPendingDecline={pendingDeclines.has(item.sessionId)} onSkip={handleSkip} />
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
              <OutreachRow key={item.sessionId} item={item} weekOf={weekOf} onDecline={decline} isPendingDecline={pendingDeclines.has(item.sessionId)} onSkip={handleSkip} />
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

      {/* Skipped this week */}
      {filteredSkipped.length > 0 && (
        <Card className="mt-4 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Skipped This Week</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredSkipped.map((item) => (
              <div key={item.sessionId} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-border last:border-0 opacity-50">
                <div className="flex items-center gap-3 sm:contents">
                  <div className="w-16 shrink-0 text-xs text-muted-foreground">
                    <div className="font-semibold text-foreground">
                      {new Date(item.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}
                    </div>
                    <div>{item.slot}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/clients/${item.clientId}`} className="font-semibold text-sm hover:underline">{item.clientName}</Link>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="border-0 bg-muted text-muted-foreground">Skipped</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => handleUnskip(item.clientId)}
                  >
                    Undo
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
