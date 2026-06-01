"use client";

import { useEffect } from "react";

export default function MessagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Messages error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="rounded-lg border border-border bg-card p-8">
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Could not load messages
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          There was a problem loading message data. This is usually temporary.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
