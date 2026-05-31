"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";

export type PackageAlertItem = {
  clientId: number;
  clientName: string;
  category: string;
  remaining: number;
  totalSessions: number;
  sessionsUsed: number;
};

function InlineAdjustForm({ clientId, clientName, onClose }: { clientId: number; clientName: string; onClose: () => void }) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200" onClick={onClose}>
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200" />
      <div className="relative bg-background border border-border rounded-xl p-5 w-full max-w-sm mx-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-3">Adjust {clientName}&rsquo;s package</h3>
        <div className="flex gap-2 mb-3">
          <input
            type="number"
            placeholder="+2 or -1"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            className="h-9 w-24 rounded-md border border-border bg-muted/50 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <input
            type="text"
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-9 flex-1 rounded-md border border-border bg-muted/50 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            size="sm"
            disabled={!delta || !reason || isPending}
            onClick={() => {
              startTransition(async () => {
                const { adjustPackage } = await import("@/app/clients/actions");
                await adjustPackage(clientId, parseInt(delta), reason);
                toast(`Package adjusted for ${clientName}`);
                onClose();
              });
            }}
          >
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PackageAlerts({ items }: { items: PackageAlertItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const [adjusting, setAdjusting] = useState<{ id: number; name: string } | null>(null);

  const activeItems = items.filter((p) => p.category === "active" || p.category === "in_season");
  const inactiveItems = items.filter((p) => p.category !== "active" && p.category !== "in_season");
  const displayed = showAll ? items : activeItems;

  if (items.length === 0) return null;

  return (
    <>
      <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 animate-in fade-in duration-500">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-amber-400">
            Package Alerts
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              {showAll ? `${items.length} total` : `${activeItems.length} active`}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {inactiveItems.length > 0 && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAll ? "Active only" : `Show all (${items.length})`}
              </button>
            )}
            <Link href="/packages" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              All packages &rarr;
            </Link>
          </div>
        </div>
        <div className="divide-y divide-border/50">
          {displayed.map((p) => (
            <div key={p.clientId} className="group flex items-center justify-between py-2 -mx-1 px-1 rounded hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <Link href={`/clients/${p.clientId}`} className="text-sm hover:underline truncate">{p.clientName}</Link>
                {showAll && p.category !== "active" && p.category !== "in_season" && (
                  <span className="text-[10px] text-muted-foreground/60 shrink-0">{p.category.replace("_", " ")}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setAdjusting({ id: p.clientId, name: p.clientName })}
                  className="text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Adjust
                </button>
                <span className={`text-xs font-medium tabular-nums ${p.remaining <= 0 ? "text-red-400" : "text-amber-400"}`}>
                  {p.remaining <= 0 ? "0 left" : `${p.remaining} left`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {adjusting && (
        <InlineAdjustForm clientId={adjusting.id} clientName={adjusting.name} onClose={() => setAdjusting(null)} />
      )}
    </>
  );
}
