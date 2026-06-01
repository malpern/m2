"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { formatSecondsAgo } from "@/lib/utils";

interface LogEntry {
  id: number;
  severity: string;
  category: string;
  mattMessage: string;
  technicalMessage: string;
  metadata: string | null;
  clientId: number | null;
  sessionId: number | null;
  createdAt: string | null;
}

const SEVERITY_CONFIG: Record<string, { emoji: string; label: string; badgeClass: string; borderClass: string }> = {
  info: { emoji: "✅", label: "OK", badgeClass: "bg-emerald-500/15 text-emerald-400", borderClass: "border-l-emerald-500/50" },
  warn: { emoji: "⚠️", label: "Warning", badgeClass: "bg-amber-500/15 text-amber-400", borderClass: "border-l-amber-500/50" },
  error: { emoji: "🛑", label: "Error", badgeClass: "bg-red-500/15 text-red-400", borderClass: "border-l-red-500/50" },
};

const CATEGORY_EMOJI: Record<string, string> = {
  classifier: "🧠",
  twilio: "📱",
  outreach: "📨",
  auto_fill: "🔄",
  cron: "⏰",
  webhook: "🔗",
  system: "⚙️",
};

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function useAutoRefresh(intervalMs: number) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const lastRefreshRef = useRef<Date>(new Date());

  const doRefresh = useCallback(() => {
    setIsRefreshing(true);
    router.refresh();
    lastRefreshRef.current = new Date();
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

  return { isRefreshing, secondsAgo, doRefresh };
}

export function LogViewer({ logs }: { logs: LogEntry[] }) {
  const [view, setView] = useState<"matt" | "technical">("matt");
  const [filter, setFilter] = useState<string>("all");
  const { isRefreshing, secondsAgo, doRefresh } = useAutoRefresh(30_000);

  const filtered = filter === "all" ? logs : logs.filter((l) => l.severity === filter);

  const counts = {
    all: logs.length,
    error: logs.filter((l) => l.severity === "error").length,
    warn: logs.filter((l) => l.severity === "warn").length,
    info: logs.filter((l) => l.severity === "info").length,
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/settings" className="text-muted-foreground hover:text-foreground text-sm">&larr; Settings</Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-2">System Logs</h1>
          <p className="text-muted-foreground text-sm mt-1">{filtered.length} entries</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={doRefresh}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            title="Click to refresh now"
            aria-label="Refresh logs"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Updated {formatSecondsAgo(secondsAgo)}</span>
          </button>
          <div className="flex rounded-md border border-border overflow-hidden" role="group" aria-label="View mode">
            <button
              onClick={() => setView("matt")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                view === "matt" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Activity
            </button>
            <button
              onClick={() => setView("technical")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                view === "technical" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Technical
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {(["all", "error", "warn", "info"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === s ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === "all" ? "All" : s === "error" ? "🛑 Errors" : s === "warn" ? "⚠️ Warnings" : "✅ Info"} ({counts[s]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No log entries yet. Logs will appear here as the system processes messages.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((entry) => {
            const sev = SEVERITY_CONFIG[entry.severity] ?? SEVERITY_CONFIG.info;
            const catEmoji = CATEGORY_EMOJI[entry.category] ?? "📋";

            return (
              <div
                key={entry.id}
                className={`rounded-lg border border-border ${sev.borderClass} border-l-4 px-4 py-3 transition-all duration-200`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-base mt-0.5 shrink-0">{sev.emoji}</span>
                  <div className="flex-1 min-w-0">
                    {view === "matt" ? (
                      <div className="text-sm">{catEmoji} {entry.mattMessage}</div>
                    ) : (
                      <div>
                        <div className="text-sm font-mono text-muted-foreground">{entry.technicalMessage}</div>
                        {entry.metadata && (
                          <pre className="text-[11px] font-mono text-muted-foreground/60 mt-1 bg-muted/30 rounded p-2 overflow-x-auto">
                            {JSON.stringify(JSON.parse(entry.metadata), null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-muted-foreground">{formatTime(entry.createdAt)}</span>
                      <Badge className={`border-0 text-xs ${sev.badgeClass}`}>{sev.label}</Badge>
                      <Badge className="border-0 text-xs bg-muted text-muted-foreground">{entry.category}</Badge>
                      {entry.clientId && view === "technical" && (
                        <span className="text-xs text-muted-foreground">client:{entry.clientId}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
