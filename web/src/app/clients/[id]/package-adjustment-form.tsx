"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustPackage } from "../actions";

export function PackageAdjustmentForm({ clientId }: { clientId: number }) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const numDelta = parseInt(delta, 10);
    if (isNaN(numDelta) || numDelta === 0) {
      setError("Enter a non-zero number");
      return;
    }
    if (!reason.trim()) {
      setError("Reason is required");
      return;
    }

    startTransition(async () => {
      try {
        await adjustPackage(clientId, numDelta, reason.trim());
        setDelta("");
        setReason("");
        router.refresh();
      } catch {
        setError("Failed to adjust package. Does this client have an active package?");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <input
          type="number"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          placeholder="+/- sessions"
          className="w-28 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          disabled={isPending}
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for adjustment"
          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "..." : "Adjust"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}
