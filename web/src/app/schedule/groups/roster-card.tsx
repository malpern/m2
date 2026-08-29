"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { addAttendee, removeAttendee } from "./actions";
import {
  buildRoster,
  availableToAdd,
  formatRoster,
  type GroupSession,
  type AttendeeRow,
} from "@/lib/group-attendance";
import { formatDuration } from "@/lib/session-duration";

/**
 * One semi-group session and who is in it (#13).
 *
 * The owning client is shown but cannot be removed — the session row belongs to
 * them, so removing them would leave an orphan. Everyone else can be added and
 * removed freely.
 */
export function RosterCard({
  session,
  when,
  durationMinutes,
  allClients,
}: {
  session: GroupSession;
  when: string;
  durationMinutes: number;
  allClients: AttendeeRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState("");

  const roster = buildRoster(session);
  const addable = availableToAdd(session, allClients);

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-sm">
            {when}{" "}
            <span className="font-normal text-muted-foreground">
              · {formatDuration(durationMinutes)}
            </span>
          </CardTitle>
          <Badge className="border-0 bg-blue-500/15 text-blue-400">
            {roster.headCount} attending
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{formatRoster(roster.members)}</p>
      </CardHeader>

      <CardContent>
        <ul className="mb-3 space-y-1">
          {roster.members.map((m) => {
            const isOwner = m.clientId === session.ownerClientId;
            return (
              <li key={m.clientId} className="flex items-center justify-between text-sm">
                <Link href={`/clients/${m.clientId}`} className="hover:underline">
                  {m.clientName}
                </Link>
                {isOwner ? (
                  <span
                    className="text-[10px] uppercase tracking-wide text-muted-foreground"
                    title="This session belongs to this client and cannot be removed here."
                  >
                    owner
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await removeAttendee(session.sessionId, m.clientId);
                      })
                    }
                  >
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        {addable.length > 0 ? (
          <div className="flex gap-2">
            <select
              aria-label="Add attendee"
              value={picking}
              onChange={(e) => setPicking(e.target.value)}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Add someone…</option>
              {addable.map((c) => (
                <option key={c.clientId} value={c.clientId}>
                  {c.clientName}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={pending || !picking}
              onClick={() =>
                startTransition(async () => {
                  await addAttendee(session.sessionId, Number(picking));
                  setPicking("");
                })
              }
            >
              {pending ? "Saving…" : "Add"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Everyone is already on this roster.</p>
        )}
      </CardContent>
    </Card>
  );
}
