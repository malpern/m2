"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";

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

function stripOfferedTags(text: string): string {
  return text.replace(/\n?\[offered:[^\]]+\]/g, "").trim();
}

function formatTimestamp(dateStr: string, isFirst: boolean): string {
  const date = new Date(dateStr);
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (isFirst) {
    const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${day}, ${time}`;
  }
  return time;
}

function MessageBubble({ msg, isFirst }: { msg: Message; isFirst: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = "0";
    el.style.transform = msg.direction === "sent" ? "translateX(12px)" : "translateX(-12px)";
    requestAnimationFrame(() => {
      el.style.transition = "opacity 0.3s ease-out, transform 0.3s ease-out";
      el.style.opacity = "1";
      el.style.transform = "translateX(0)";
    });
  }, [msg.direction]);

  const timestamp = msg.sentAt ?? msg.repliedAt ?? "";
  const isSent = msg.direction === "sent";

  return (
    <div
      ref={ref}
      className={`flex flex-col ${isSent ? "items-end" : "items-start"}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isSent
            ? "bg-blue-600 text-white rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md"
        }`}
      >
        {stripOfferedTags(msg.messageText)}
      </div>
      <div className="flex items-center gap-2 mt-1 px-1">
        {timestamp && (
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(timestamp, isFirst)}
          </span>
        )}
        {msg.direction === "received" && msg.interpretation && (
          <span className={`text-xs font-medium ${
            msg.interpretation === "confirmed" || msg.interpretation === "selecting_offered_slot"
              ? "text-emerald-400"
            : msg.interpretation === "declined_skip_week"
              ? "text-red-400"
            : msg.interpretation === "declined_with_alternative" || msg.interpretation === "reschedule_request"
              ? "text-purple-400"
            : "text-amber-400"
          }`}>
            {msg.interpretation.replace(/_/g, " ")}
          </span>
        )}
      </div>
    </div>
  );
}

export function MessagesView({ messages }: { messages: Message[] }) {
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

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

    const groups = Array.from(groupMap.values());
    groups.sort((a, b) => a.clientName.localeCompare(b.clientName));

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
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {totalShown} message{totalShown !== 1 ? "s" : ""} across {grouped.length} client{grouped.length !== 1 ? "s" : ""}
            {query && <span className="ml-1">matching &ldquo;{search}&rdquo;</span>}
          </p>
        </div>
        <SearchInput
          placeholder="Search by client or message"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          widthClass="sm:w-64"
        />
      </div>

      {grouped.length > 0 ? (
        <div className="space-y-2">
          {grouped.map((group, groupIdx) => (
            <div key={group.clientId}>
              {groupIdx > 0 && <hr className="border-border my-6" />}
              <Link
                href={`/clients/${group.clientId}`}
                className="text-lg font-bold text-foreground hover:text-blue-400 transition-colors mb-4 inline-block"
              >
                {group.clientName}
              </Link>
              <div className="space-y-3">
                {group.messages.map((msg, idx) => (
                  <MessageBubble key={msg.id} msg={msg} isFirst={idx === 0} />
                ))}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      ) : (
        <div>
          {query ? (
            <div className="text-sm text-muted-foreground text-center py-12">
              No messages matching &ldquo;{search}&rdquo;
            </div>
          ) : (
            <EmptyState
              illustration="message"
              heading="No messages yet"
              description="Messages will appear here once you start reaching out to clients."
              ctaLabel="Go to Outreach"
              ctaHref="/outreach"
            />
          )}
        </div>
      )}
    </div>
  );
}
