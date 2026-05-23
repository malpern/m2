"use client";

import { useState } from "react";
import { OutreachDashboard } from "./outreach-dashboard";
import { MessagesView } from "../messages/messages-view";
import type { OutreachItem } from "@/lib/outreach-engine";

interface Message {
  id: number;
  clientId: number;
  clientName: string;
  direction: string;
  messageText: string;
  interpretation: string | null;
  status: string;
  sentAt: string | null;
  repliedAt: string | null;
}

export function OutreachWithMessages({
  outreachProps,
  messages,
}: {
  outreachProps: {
    items: OutreachItem[];
    summary: ReturnType<typeof import("@/lib/outreach-engine").getOutreachSummary>;
    nextBatch: OutreachItem[];
    needsAttention: OutreachItem[];
    weekOf: string;
  };
  messages: Message[];
}) {
  const [tab, setTab] = useState<"outreach" | "messages">("outreach");

  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setTab("outreach")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === "outreach"
              ? "border-accent text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Outreach
        </button>
        <button
          onClick={() => setTab("messages")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === "messages"
              ? "border-accent text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Messages
        </button>
      </div>

      {tab === "outreach" ? (
        <OutreachDashboard {...outreachProps} />
      ) : (
        <MessagesView messages={messages} />
      )}
    </div>
  );
}
