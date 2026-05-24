"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { markConfirmed, markDeclined, sendOutreachBatch } from "../actions";
import type { OutreachItem } from "@/lib/outreach-engine";

type Message = {
  id: number;
  clientId: number;
  sessionId: number | null;
  direction: string;
  messageText: string;
  sentAt: string | null;
  repliedAt: string | null;
};

type WeekDay = {
  date: string;
  dayName: string;
  slots: { slot: string; booked: boolean }[];
};

type Summary = {
  standing: number;
  pending: number;
  sent: number;
  confirmed: number;
  declined: number;
  needsAttention: number;
  noReply: number;
  movedOn: number;
};

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "queued", label: "Queued", color: "border-muted-foreground/20" },
  { key: "texted", label: "Texted", color: "border-blue-500/30" },
  { key: "talking", label: "In Progress", color: "border-amber-500/30" },
  { key: "confirmed", label: "Confirmed", color: "border-emerald-500/30" },
  { key: "done", label: "Resolved", color: "border-muted-foreground/20" },
];

function classifyColumn(item: OutreachItem): string {
  switch (item.status) {
    case "pending": return "queued";
    case "sent":
    case "no_reply": return "texted";
    case "reschedule":
    case "ambiguous": return "talking";
    case "confirmed":
    case "standing": return "confirmed";
    case "declined":
    case "moved_on": return "done";
    default: return "queued";
  }
}

function formatSlot(date: string, slot: string): string {
  const d = new Date(date + "T12:00:00");
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${day} ${slot}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ClientCard({
  item,
  messages,
}: {
  item: OutreachItem;
  messages: Message[];
}) {
  const [isPending, startTransition] = useTransition();
  const clientMsgs = messages
    .filter((m) => m.clientId === item.clientId)
    .sort((a, b) => (a.sentAt ?? a.repliedAt ?? "").localeCompare(b.sentAt ?? b.repliedAt ?? ""));

  const lastMsg = clientMsgs[clientMsgs.length - 1];
  const needsAction = item.status === "reschedule" || item.status === "ambiguous";

  return (
    <div
      className={`rounded-lg border p-3 transition-all ${
        needsAction
          ? "border-amber-500/40 bg-amber-500/5 shadow-[0_0_8px_rgba(245,158,11,0.1)]"
          : item.status === "confirmed" || item.status === "standing"
            ? "border-emerald-500/20 bg-emerald-500/5"
            : "border-border bg-background"
      } ${isPending ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <Link href={`/clients/${item.clientId}`} className="text-sm font-semibold hover:underline truncate">
          {item.clientName}
        </Link>
        <span className="text-[10px] tabular-nums text-muted-foreground whitespace-nowrap">
          {formatSlot(item.date, item.slot)}
        </span>
      </div>

      {clientMsgs.length > 0 && (
        <div className="space-y-1 mb-2">
          {clientMsgs.slice(-3).map((m) => (
            <div key={m.id} className="flex gap-1.5 items-start">
              <span className={`text-[10px] font-medium mt-0.5 ${m.direction === "sent" ? "text-blue-400" : "text-emerald-400"}`}>
                {m.direction === "sent" ? "→" : "←"}
              </span>
              <p className="text-[11px] text-muted-foreground leading-tight line-clamp-2">
                {m.messageText}
              </p>
            </div>
          ))}
          {lastMsg && (
            <div className="text-[9px] text-muted-foreground/50 text-right">
              {timeAgo(lastMsg.direction === "sent" ? lastMsg.sentAt : lastMsg.repliedAt)}
            </div>
          )}
        </div>
      )}

      {item.status === "standing" && (
        <div className="text-[10px] text-emerald-400/60">Standing slot — auto-confirmed</div>
      )}

      {item.status === "pending" && clientMsgs.length === 0 && (
        <div className="text-[10px] text-muted-foreground/50">Waiting to send</div>
      )}

      {item.status === "sent" && clientMsgs.length > 0 && !item.replyText && (
        <div className="text-[10px] text-muted-foreground/50">Awaiting reply...</div>
      )}

      {needsAction && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => startTransition(() => markConfirmed(item.sessionId))}
            className="flex-1 text-[11px] font-medium py-1 rounded bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
          >
            Confirm
          </button>
          <button
            onClick={() => startTransition(() => markDeclined(item.sessionId))}
            className="flex-1 text-[11px] font-medium py-1 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
          >
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

function MiniCalendar({ days }: { days: WeekDay[] }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Open Slots</div>
      <div className="grid grid-cols-6 gap-1">
        {days.map((day) => (
          <div key={day.date} className="text-center">
            <div className="text-[9px] text-muted-foreground/60 mb-1">{day.dayName}</div>
            {day.slots.map((s) => (
              <div
                key={s.slot}
                className={`text-[8px] py-0.5 rounded mb-0.5 ${
                  s.booked
                    ? "bg-blue-500/20 text-blue-300/50"
                    : "bg-emerald-500/15 text-emerald-400"
                }`}
              >
                {s.slot}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MissionControl({
  items,
  summary,
  messages,
  weekDays,
  weekOf,
}: {
  items: OutreachItem[];
  summary: Summary;
  messages: Message[];
  weekDays: WeekDay[];
  weekOf: string;
}) {
  const [isPending, startTransition] = useTransition();

  const columns = COLUMNS.map((col) => ({
    ...col,
    items: items.filter((i) => classifyColumn(i) === col.key),
  }));

  const pendingIds = items
    .filter((i) => i.status === "pending")
    .map((i) => i.sessionId);

  const totalActive = items.filter((i) => i.status !== "standing").length;
  const totalConfirmed = summary.confirmed + summary.standing;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mission Control</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalConfirmed} confirmed · {summary.sent + summary.noReply} awaiting · {summary.needsAttention} need you · {summary.pending} queued
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingIds.length > 0 && (
            <Button
              size="sm"
              onClick={() => startTransition(() => sendOutreachBatch(pendingIds, weekOf))}
              disabled={isPending}
            >
              {isPending ? "Sending..." : `Send ${pendingIds.length} texts`}
            </Button>
          )}
          <Link href="/outreach">
            <Button variant="outline" size="sm">Classic View</Button>
          </Link>
          <Link href="/schedule">
            <Button variant="outline" size="sm">Calendar</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_180px] gap-4">
        <div className="grid grid-cols-5 gap-3 items-start">
          {columns.map((col) => (
            <div key={col.key}>
              <div className={`text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 pb-1 border-b-2 ${col.color}`}>
                {col.label}
                <span className="ml-1.5 text-muted-foreground/40">{col.items.length}</span>
              </div>
              <div className="space-y-2">
                {col.items.map((item) => (
                  <ClientCard key={item.sessionId} item={item} messages={messages} />
                ))}
                {col.items.length === 0 && (
                  <div className="text-[10px] text-muted-foreground/30 text-center py-4">—</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <MiniCalendar days={weekDays} />

          <div className="rounded-lg border border-border bg-background p-3">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Summary</div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Standing</span>
                <span className="font-medium text-emerald-400">{summary.standing}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Confirmed</span>
                <span className="font-medium text-emerald-400">{summary.confirmed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Awaiting</span>
                <span className="font-medium text-blue-400">{summary.sent + summary.noReply}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Needs You</span>
                <span className={`font-medium ${summary.needsAttention > 0 ? "text-amber-400" : "text-muted-foreground/40"}`}>{summary.needsAttention}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Declined</span>
                <span className="text-muted-foreground/60">{summary.declined}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Queued</span>
                <span className="text-muted-foreground/60">{summary.pending}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
