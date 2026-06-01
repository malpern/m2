"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function GoogleCalendarCard({
  connected,
  email,
  status,
}: {
  connected: boolean;
  email?: string;
  status?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Card className={connected ? "border-emerald-500/20" : status === "error" ? "border-red-500/20" : ""}>
      <CardContent className="pt-5 pb-4">
        {status === "connected" && !connected && (
          <div className="text-xs text-emerald-400 mb-2 font-medium">Google Calendar connected successfully! Reload to see the status.</div>
        )}
        {status === "error" && (
          <div className="text-xs text-red-400 mb-2 font-medium">Connection failed. Make sure you're signed in as a test user and try again.</div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm flex items-center gap-2">
              Google Calendar
              {connected && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-normal">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Connected
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {connected
                ? `Signed in as ${email ?? "Google account"}. Reading Matt's training calendar.`
                : "Connect to read Matt's training calendar and sync sessions."}
            </div>
          </div>
          {connected ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => {
                startTransition(async () => {
                  await fetch("/api/auth/disconnect", { method: "POST" });
                  window.location.reload();
                });
              }}
            >
              Disconnect
            </Button>
          ) : (
            <a href="/api/auth">
              <Button size="sm">Connect</Button>
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
