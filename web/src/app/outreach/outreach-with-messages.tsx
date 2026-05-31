"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { formatSecondsAgo } from "@/lib/utils";
import { OutreachDashboard } from "./outreach-dashboard";
import { MessagesView } from "../messages/messages-view";
import type { OutreachItem } from "@/lib/outreach-engine";

interface Message {
  id: number;
  clientId: number;
  clientName: string;
  direction: string;
  messageText: string;
  interpretation: string | null;
  status: string;
  sentAt: string | null;
  repliedAt: string | null;
}

function useAutoRefresh(intervalMs: number) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const lastRefreshRef = useRef<Date>(new Date());

  const doRefresh = useCallback(() => {
    setIsRefreshing(true);
    router.refresh();
    const now = new Date();
    setLastRefresh(now);
    lastRefreshRef.current = now;
    setSecondsAgo(0);
    setTimeout(() => setIsRefreshing(false), 600);
  }, [router]);

  useEffect(() => {
    const interval = setInterval(doRefresh, intervalMs);
    return () => clearInterval(interval);
  }, [doRefresh, intervalMs]);

  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastRefreshRef.current.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  return { lastRefresh, isRefreshing, secondsAgo, doRefresh };
}

export function OutreachWithMessages({
  outreachProps,
  messages,
}: {
  outreachProps: {
    items: OutreachItem[];
    summary: ReturnType<typeof import("@/lib/outreach-engine").getOutreachSummary>;
    nextBatch: OutreachItem[];
    needsAttention: OutreachItem[];
    followUpItems?: OutreachItem[];
    skippedItems?: OutreachItem[];
    weekOf: string;
    currentWeekOf: string;
    hasAiBillingError?: boolean;
  };
  messages: Message[];
}) {
  const [tab, setTab] = useState<"outreach" | "messages">("outreach");
  const { isRefreshing, secondsAgo, doRefresh } = useAutoRefresh(30_000);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 border-b border-border">
        <div className="flex gap-1">
          <button
            onClick={() => setTab("outreach")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === "outreach"
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Outreach
          </button>
          <button
            onClick={() => setTab("messages")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === "messages"
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Messages
          </button>
        </div>
        <button
          onClick={doRefresh}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors pb-2"
          title="Click to refresh now"
        >
          <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
          <span>Updated {formatSecondsAgo(secondsAgo)}</span>
        </button>
      </div>

      {tab === "outreach" ? (
        <OutreachDashboard {...outreachProps} />
      ) : (
        <MessagesView messages={messages} />
      )}
    </div>
  );
}
