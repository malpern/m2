"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { markConfirmed, markDeclined } from "@/app/outreach/actions";

interface FlaggedItem {
  sessionId: number;
  clientId: number;
  clientName: string;
  slot: string;
  date: string;
  status: string;
  replyText: string | null;
}

export function OutreachMini({
  confirmed,
  waiting,
  needsYou,
  total,
  flaggedItems,
}: {
  confirmed: number;
  waiting: number;
  needsYou: number;
  total: number;
  flaggedItems: FlaggedItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0;

  return (
    <Card className="mb-4">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Outreach</div>
          <Link href="/outreach" className="text-xs text-accent hover:underline">View all &rarr;</Link>
        </div>

        <div className="flex items-center gap-6 mb-3">
          <div>
            <div className="text-2xl font-bold text-emerald-400">{confirmed}</div>
            <div className="text-xs text-muted-foreground">confirmed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-400">{waiting}</div>
            <div className="text-xs text-muted-foreground">waiting</div>
          </div>
          {needsYou > 0 && (
            <div>
              <div className="text-2xl font-bold text-purple-400">{needsYou}</div>
              <div className="text-xs text-muted-foreground">need you</div>
            </div>
          )}
          <div className="flex-1" />
          <div className="text-right">
            <div className="text-lg font-bold">{pct}%</div>
            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {flaggedItems.length > 0 && (
          <div className="border-t border-border pt-3">
            <div className="text-xs text-purple-400 font-medium mb-2">Needs your decision</div>
            {flaggedItems.map((item) => (
              <div key={item.sessionId} className={`flex items-center justify-between py-2 text-sm border-b border-border last:border-0 ${isPending ? "opacity-50" : ""}`}>
                <div>
                  <Link href={`/clients/${item.clientId}`} className="font-medium hover:underline">{item.clientName}</Link>
                  <span className="text-muted-foreground ml-2 text-xs">{item.slot}</span>
                  {item.replyText && (
                    <div className="text-xs text-muted-foreground mt-0.5">&ldquo;{item.replyText}&rdquo;</div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-emerald-400"
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
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
