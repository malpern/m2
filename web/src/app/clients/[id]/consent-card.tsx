"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import type { ConsentEvent } from "@/db/schema";
import type { ConsentStatus } from "@/lib/sms-consent";
import { CHIP_CLASSES, consentStatusLabel, describeConsentEvent } from "@/lib/consent-labels";
import { CopySignupLink } from "../copy-signup-link";
import { markClientOptedOut, resendVerification } from "../consent-actions";

const TONE: Record<ConsentStatus, keyof typeof CHIP_CLASSES> = {
  confirmed: "ok", pending: "warn", declined: "bad", unknown: "none",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ConsentCard({
  clientId, status, since, hasPhone, history, signupLink,
}: {
  clientId: number;
  status: ConsentStatus;
  since: string | null;
  hasPhone: boolean;
  history: ConsentEvent[];
  signupLink: string;
}) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [optOutOpen, setOptOutOpen] = useState(false);
  const [note, setNote] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Text messaging</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CHIP_CLASSES[TONE[status]]}`}>
            {consentStatusLabel(status)}
          </span>
          {since && <span className="text-xs text-muted-foreground">since {when(since)}</span>}
          {!hasPhone && <span className="text-xs text-muted-foreground">No phone on file.</span>}
        </div>

        {status === "unknown" && hasPhone && (
          <p className="text-sm text-muted-foreground">
            Texting starts after this client signs up at the link below and replies YES. Only they can do that.
          </p>
        )}
        {status === "declined" && (
          <p className="text-sm text-muted-foreground">
            No texts will be sent. Only the client can opt back in, by texting START to the M2 number.
          </p>
        )}

        {history.length > 0 && (
          <ol className="space-y-1.5 text-sm">
            {history.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-28 shrink-0 text-xs text-muted-foreground tabular-nums pt-0.5">{when(e.createdAt)}</span>
                <span className="break-words">{describeConsentEvent(e)}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-wrap gap-2">
          <CopySignupLink link={signupLink} />
          {status === "pending" && hasPhone && (
            <Button
              size="sm" variant="outline" disabled={isPending}
              onClick={() => startTransition(async () => {
                const r = await resendVerification(clientId);
                toast(r.message, r.ok ? "success" : "error");
              })}
            >
              Resend confirmation text
            </Button>
          )}
          {status !== "declined" && (
            <Button size="sm" variant="ghost" className="text-red-500" onClick={() => setOptOutOpen(true)}>
              Mark opted out
            </Button>
          )}
        </div>
      </CardContent>

      {optOutOpen && (
        <Dialog open onOpenChange={(o) => { if (!o) setOptOutOpen(false); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Mark opted out</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Use this when a client tells you in person they don&rsquo;t want texts. They can opt back in
              only by texting START themselves.
            </p>
            <input
              type="text" value={note} onChange={(e) => setNote(e.target.value)} autoFocus
              placeholder="How they told you, e.g. “at the gym on Tuesday”"
              aria-label="Note"
              className="h-9 w-full rounded-md border border-border bg-muted/50 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <DialogFooter>
              <Button size="sm" variant="ghost" onClick={() => setOptOutOpen(false)} disabled={isPending}>Cancel</Button>
              <Button
                size="sm" variant="destructive" disabled={note.trim().length < 3 || isPending}
                onClick={() => startTransition(async () => {
                  await markClientOptedOut(clientId, note.trim());
                  setOptOutOpen(false);
                  toast("Marked opted out. No texts will be sent.", "info");
                })}
              >
                Mark opted out
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
