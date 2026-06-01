"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { confirmAutoFillOffer, type AutoFillCandidateWithBalance } from "@/app/auto-fill-actions";
import { useToast } from "@/components/toast";

interface AutoFillDialogProps {
  sessionId: number;
  candidates: AutoFillCandidateWithBalance[];
  slotLabel: string;
  onClose: () => void;
}

function balanceLabel(balance: { remaining: number; total: number } | null): string {
  if (!balance) return "no package";
  return `${balance.remaining}/${balance.total} sessions`;
}

function balanceColor(balance: { remaining: number; total: number } | null): string {
  if (!balance) return "text-muted-foreground";
  if (balance.remaining <= 0) return "text-red-400";
  if (balance.remaining <= 2) return "text-amber-400";
  return "text-emerald-400";
}

export function AutoFillDialog({
  sessionId,
  candidates,
  slotLabel,
  onClose,
}: AutoFillDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = candidates[selectedIndex];
  const [message, setMessage] = useState(selected.draftMessage);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value);
    setSelectedIndex(idx);
    setMessage(candidates[idx].draftMessage);
  };

  const handleSend = () => {
    startTransition(async () => {
      const result = await confirmAutoFillOffer(sessionId, selected.clientId, message);
      if (result.offered) {
        toast(`Offered slot to ${result.clientName}`);
      } else {
        toast("Failed to send offer", "error");
      }
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Offer this slot?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {slotLabel} just opened up. Who should get it?
        </p>

        <div>
          <label className="text-sm font-medium mb-1 block">Client</label>
          <select
            value={selectedIndex}
            onChange={handleSelectChange}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {candidates.map((c, i) => (
              <option key={c.clientId} value={i}>
                {c.clientName} — {balanceLabel(c.packageBalance)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className={balanceColor(selected.packageBalance)}>
            {balanceLabel(selected.packageBalance)}
          </span>
          {selected.packageBalance && selected.packageBalance.remaining <= 0 && (
            <span className="text-red-400/70">(will go negative)</span>
          )}
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            Skip
          </Button>
          <Button size="sm" onClick={handleSend} disabled={isPending}>
            {isPending ? "Sending..." : "Send offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
