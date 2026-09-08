"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { formatPhoneNumber } from "@/lib/utils";
import { CHIP_CLASSES, consentStatusLabel } from "@/lib/consent-labels";
import type { UnmatchedSignup } from "@/lib/consent";
import { createClientFromSignupAction, linkSignup } from "./consent-actions";

/**
 * Form signups whose number matches no client yet. Matt attaches each to an
 * existing client or creates one from it. Until he does, the number's own
 * status is still tracked, so a YES that arrives first is not lost.
 */
export function SignupsQueue({
  signups, clientOptions,
}: {
  signups: UnmatchedSignup[];
  clientOptions: { id: number; name: string; phone: string | null }[];
}) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [linking, setLinking] = useState<UnmatchedSignup | null>(null);
  const [target, setTarget] = useState("");

  if (signups.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">
        Text signups to match · {signups.length}
      </div>
      <ul className="divide-y divide-border/60">
        {signups.map((s) => (
          <li key={s.phone} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2 text-sm">
            <div className="min-w-[12rem]">
              <div className="font-semibold">{s.name ?? "Unnamed"}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {formatPhoneNumber(s.phone)}{s.guardianName ? ` · guardian ${s.guardianName}` : ""}
              </div>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CHIP_CLASSES[s.status === "confirmed" ? "ok" : s.status === "pending" ? "warn" : s.status === "declined" ? "bad" : "none"]}`}>
              {consentStatusLabel(s.status)}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(s.signedUpAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" disabled={isPending} onClick={() => { setLinking(s); setTarget(""); }}>
                Link to client…
              </Button>
              <Button size="sm" disabled={isPending} onClick={() => startTransition(() => createClientFromSignupAction(s.phone))}>
                Create client
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {linking && (
        <Dialog open onOpenChange={(o) => { if (!o) setLinking(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Link {linking.name ?? formatPhoneNumber(linking.phone)} to a client</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              The client&rsquo;s phone becomes {formatPhoneNumber(linking.phone)}. If they had a different number,
              consent for the old one is reset.
            </p>
            <select
              value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Client"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">Choose a client…</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${formatPhoneNumber(c.phone)}` : " · no phone"}</option>
              ))}
            </select>
            <DialogFooter>
              <Button size="sm" variant="ghost" onClick={() => setLinking(null)} disabled={isPending}>Cancel</Button>
              <Button
                size="sm" disabled={!target || isPending}
                onClick={() => startTransition(async () => {
                  await linkSignup(linking.phone, Number(target));
                  setLinking(null);
                  toast("Signup linked.", "success");
                })}
              >
                Link
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
