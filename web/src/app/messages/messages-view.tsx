"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

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

interface ClientGroup {
  clientId: number;
  clientName: string;
  messages: Message[];
}

export function MessagesView({ messages }: { messages: Message[] }) {
  const [search, setSearch] = useState("");

  const query = search.toLowerCase().trim();

  const grouped = useMemo(() => {
    const filtered = query
      ? messages.filter(
          (msg) =>
            msg.messageText.toLowerCase().includes(query) ||
            msg.clientName.toLowerCase().includes(query)
        )
      : messages;

    const groupMap = new Map<number, ClientGroup>();
    for (const msg of filtered) {
      let group = groupMap.get(msg.clientId);
      if (!group) {
        group = { clientId: msg.clientId, clientName: msg.clientName, messages: [] };
        groupMap.set(msg.clientId, group);
      }
      group.messages.push(msg);
    }

    // Sort groups by client name
    const groups = Array.from(groupMap.values());
    groups.sort((a, b) => a.clientName.localeCompare(b.clientName));

    // Sort messages within each group chronologically (oldest first)
    for (const g of groups) {
      g.messages.sort((a, b) => {
        const ta = a.sentAt ?? a.repliedAt ?? "";
        const tb = b.sentAt ?? b.repliedAt ?? "";
        return ta.localeCompare(tb);
      });
    }

    return groups;
  }, [messages, query]);

  const totalShown = grouped.reduce((sum, g) => sum + g.messages.length, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {totalShown} message{totalShown !== 1 ? "s" : ""} across {grouped.length} client{grouped.length !== 1 ? "s" : ""}
            {query && <span className="ml-1">matching &ldquo;{search}&rdquo;</span>}
          </p>
        </div>
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            placeholder="Search by client or message"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="h-8 w-full sm:w-64 rounded-md border border-border bg-muted/50 pl-8 pr-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring focus:bg-background transition-colors"
          />
        </div>
      </div>

      {grouped.length > 0 ? (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.clientId}>
              <Link
                href={`/clients/${group.clientId}`}
                className="text-sm font-semibold text-foreground hover:text-blue-400 transition-colors mb-3 inline-block"
              >
                {group.clientName}
              </Link>
              <div className="space-y-3">
                {group.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.direction === "sent" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                        msg.direction === "sent"
                          ? "bg-blue-600 text-white rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md"
                      }`}
                    >
                      {msg.messageText}
                    </div>
                    <div className="flex items-center gap-2 mt-1 px-1">
                      <span className="text-[10px] text-muted-foreground">
                        {msg.sentAt
                          ? new Date(msg.sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : msg.repliedAt
                            ? new Date(msg.repliedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                            : ""}
                      </span>
                      {msg.direction === "received" && msg.interpretation && (
                        <span className={`text-[10px] font-medium ${
                          msg.interpretation === "confirmed" ? "text-emerald-400"
                          : msg.interpretation === "declined" ? "text-red-400"
                          : msg.interpretation === "reschedule_request" ? "text-purple-400"
                          : "text-amber-400"
                        }`}>
                          {msg.interpretation === "reschedule_request" ? "reschedule" : msg.interpretation}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground text-center py-12">
          {query ? `No messages matching "${search}"` : "No messages yet."}
        </div>
      )}
    </div>
  );
}
