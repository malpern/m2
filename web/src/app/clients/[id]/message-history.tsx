"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { sendDirectMessage } from "../actions";

interface Message {
  id: number;
  direction: string;
  messageText: string;
  interpretation: string | null;
  status: string;
  sentAt: string | null;
  repliedAt: string | null;
}

export function MessageSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
      </svg>
      <input
        type="text"
        placeholder="Search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-40 rounded-md border border-border bg-muted/50 pl-7 pr-3 text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring focus:bg-background transition-colors"
      />
    </div>
  );
}

export function MessageHistory({
  clientId,
  clientName,
  messages,
}: {
  clientId: number;
  clientName: string;
  messages: Message[];
}) {
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!text.trim()) return;
    const msg = text.trim();
    setText("");
    startTransition(() => {
      sendDirectMessage(clientId, msg);
    });
  };

  const firstName = clientName.split(" ")[0];

  const query = search.toLowerCase().trim();
  const filteredMessages = query
    ? messages.filter((msg) => msg.messageText.toLowerCase().includes(query))
    : messages;

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <MessageSearch value={search} onChange={setSearch} />
      </div>
      <div
        ref={scrollRef}
        className="max-h-80 overflow-y-auto space-y-3 mb-4"
      >
        {filteredMessages.length > 0 ? (
          filteredMessages.map((msg) => (
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
          ))
        ) : (
          <div className="text-sm text-muted-foreground text-center py-6">
            {query ? `No messages matching "${search}"` : `No messages with ${firstName} yet.`}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          placeholder={`Message ${firstName}...`}
          className="flex-1 h-9 rounded-lg border border-border bg-muted/50 px-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring focus:bg-background transition-colors"
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!text.trim() || isPending}
          className="h-9"
        >
          {isPending ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}
