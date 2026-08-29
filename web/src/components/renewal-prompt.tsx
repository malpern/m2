"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildRenewalMessage } from "@/lib/package-renewal";
import { sendDirectMessage } from "@/app/clients/actions";

/**
 * Prompt to ask a client to re-up when their package is running low (#4).
 *
 * The draft is editable before sending, matching the scheduling outreach flow —
 * Matt has context the template does not, and a renewal ask is a sales message
 * rather than a system notification.
 *
 * Sending goes through `sendDirectMessage`, which records the outreach row and
 * demotes it if the send is skipped or fails (#227), so a client with no phone
 * number on file cannot end up looking like they were asked and ignored it.
 */
export function RenewalPrompt({
  clientId,
  clientName,
  remaining,
  hasPhone,
  variant = "default",
}: {
  clientId: number;
  clientName: string;
  remaining: number;
  hasPhone: boolean;
  variant?: "default" | "compact";
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(() => buildRenewalMessage(clientName, remaining));
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <span className="text-xs text-muted-foreground">Renewal message sent</span>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant={variant === "compact" ? "ghost" : "outline"}
        disabled={!hasPhone}
        title={hasPhone ? undefined : "No phone number on file for this client."}
        onClick={() => {
          // Rebuild on open so an edited-then-cancelled draft does not persist,
          // and so the count is current if the balance changed underneath.
          setMessage(buildRenewalMessage(clientName, remaining));
          setError(null);
          setOpen(true);
        }}
      >
        Ask to re-up
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ask {clientName.split(" ")[0]} to renew</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            {remaining <= 0
              ? "This package is used up."
              : `${remaining} session${remaining === 1 ? "" : "s"} left on this package.`}{" "}
            Edit the message before sending if you want.
          </p>

          <div>
            <label className="text-sm font-medium mb-1 block" htmlFor="renewal-message">
              Message
            </label>
            <textarea
              id="renewal-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pending || message.trim().length === 0}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    await sendDirectMessage(clientId, message.trim());
                    setSent(true);
                    setOpen(false);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not send the message.");
                  }
                });
              }}
            >
              {pending ? "Sending…" : "Send text"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
