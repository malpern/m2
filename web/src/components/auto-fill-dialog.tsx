"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { confirmAutoFillOffer } from "@/app/auto-fill-actions";
import { useToast } from "@/components/toast";

interface AutoFillDialogProps {
  sessionId: number;
  candidateClientId: number;
  candidateClientName: string;
  draftMessage: string;
  slotLabel: string;
  onClose: () => void;
}

export function AutoFillDialog({
  sessionId,
  candidateClientId,
  candidateClientName,
  draftMessage,
  slotLabel,
  onClose,
}: AutoFillDialogProps) {
  const [message, setMessage] = useState(draftMessage);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const handleSend = () => {
    startTransition(async () => {
      const result = await confirmAutoFillOffer(sessionId, candidateClientId, message);
      if (result.offered) {
        toast(`Offered slot to ${result.clientName}`);
      } else {
        toast("Failed to send offer", "error");
      }
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-background border border-border rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-bold mb-2">Offer this slot?</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {slotLabel} just opened up. Offer it to <strong>{candidateClientName}</strong> (next in priority)?
        </p>

        <div className="mb-4">
          <label className="text-sm font-medium mb-1 block">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            Skip
          </Button>
          <Button size="sm" onClick={handleSend} disabled={isPending}>
            {isPending ? "Sending..." : "Send offer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
