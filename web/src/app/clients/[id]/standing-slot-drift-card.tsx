"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateClientField } from "../actions";

/**
 * Surfaces a detected standing-slot drift (#25) and offers to apply it.
 *
 * Deliberately only ever suggests. A run of holiday reschedules looks identical
 * to a permanent move in the data, and only Matt can tell them apart — so the
 * standing slot is never changed without a click.
 */
export function StandingSlotDriftCard({
  clientId,
  summary,
  suggested,
  weeksAnalysed,
}: {
  clientId: number;
  summary: string;
  suggested: string;
  weeksAnalysed: number;
}) {
  const [pending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (dismissed) return null;

  return (
    <Card className="mb-6 border-amber-500/40 bg-amber-500/5">
      <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
            Pattern shift detected
          </p>
          <p className="mt-1 text-sm text-foreground">{summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Based on attended sessions across {weeksAnalysed} recent weeks. The standing slot is
            not changed unless you apply it.
          </p>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  await updateClientField(clientId, "standingSlot", suggested);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not update the standing slot.");
                }
              });
            }}
          >
            {pending ? "Updating…" : `Set to ${suggested}`}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
