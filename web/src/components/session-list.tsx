"use client";

import { useTransition, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { updateSessionTime } from "@/app/schedule/actions";

interface Session {
  id: number;
  clientId: number;
  clientName: string;
  date: string;
  time: string;
  slot: string;
  status: string;
}

const SLOTS = ["3pm", "4pm", "5pm", "6pm", "7pm"];
const SLOT_TO_TIME: Record<string, string> = {
  "3pm": "15:00", "4pm": "16:00", "5pm": "17:00", "6pm": "18:00", "7pm": "19:00",
};

export function SessionList({ sessions }: { sessions: Session[] }) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<number | null>(null);

  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const handleTimeChange = (sessionId: number, date: string, newSlot: string) => {
    setEditingId(null);
    const newTime = SLOT_TO_TIME[newSlot] ?? "15:00";
    startTransition(() => {
      updateSessionTime(sessionId, date, newTime);
    });
  };

  return (
    <div>
      {sorted.slice(0, 10).map((s) => (
        <div
          key={s.id}
          className={`flex items-center justify-between py-2.5 text-sm border-b border-border last:border-0 ${isPending ? "opacity-50" : ""}`}
        >
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground w-10 text-xs">
              {new Date(s.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}
            </span>
            <Link href={`/clients/${s.clientId}`} className="font-medium hover:underline min-w-[100px]">
              {s.clientName}
            </Link>
            {editingId === s.id ? (
              <div className="flex gap-1">
                {SLOTS.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => handleTimeChange(s.id, s.date, slot)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      slot === s.slot
                        ? "bg-accent/20 text-accent"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {slot}
                  </button>
                ))}
                <button
                  onClick={() => setEditingId(null)}
                  className="px-1 text-xs text-muted-foreground hover:text-foreground"
                  aria-label="Cancel time editing"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingId(s.id)}
                className="text-muted-foreground hover:text-foreground hover:bg-muted/50 px-1.5 py-0.5 rounded text-xs transition-colors cursor-pointer"
                aria-label={`Change time for ${s.clientName}, currently ${s.slot}`}
              >
                {s.slot}
              </button>
            )}
          </div>
          <Badge className={`border-0 ${
            s.status === "confirmed" ? "bg-emerald-500/15 text-emerald-400"
            : s.status === "proposed" ? "bg-blue-500/15 text-blue-400"
            : "bg-muted text-muted-foreground"
          }`}>
            {s.status}
          </Badge>
        </div>
      ))}
      {sessions.length > 10 && (
        <div className="text-xs text-muted-foreground mt-2">
          <Link href="/schedule" className="hover:underline">+{sessions.length - 10} more &rarr;</Link>
        </div>
      )}
    </div>
  );
}
