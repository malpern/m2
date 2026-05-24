"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionCalendar } from "./session-calendar";

export function SessionHistoryCard({
  sessions,
}: {
  sessions: { scheduledDate: string; scheduledTime: string; status: string }[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Session History</CardTitle>
      </CardHeader>
      <CardContent>
        <SessionCalendar sessions={sessions} limitDays={expanded ? undefined : 30} />
        {sessions.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full mt-4 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted transition-colors"
          >
            {expanded
              ? "Show recent only"
              : `View all ${sessions.length} sessions`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
