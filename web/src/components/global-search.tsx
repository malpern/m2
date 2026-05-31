"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

interface SearchResult {
  type: "client" | "session" | "message";
  id: number;
  title: string;
  subtitle: string;
  badge: string;
  href: string;
}

interface SearchResults {
  clients: SearchResult[];
  sessions: SearchResult[];
  messages: SearchResult[];
}

const TYPE_CONFIG = {
  client: { emoji: "👤", label: "Clients", badgeClass: "bg-blue-500/15 text-blue-400" },
  session: { emoji: "📅", label: "Sessions", badgeClass: "bg-emerald-500/15 text-emerald-400" },
  message: { emoji: "💬", label: "Messages", badgeClass: "bg-amber-500/15 text-amber-400" },
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  in_season: "bg-blue-500/15 text-blue-400",
  on_break: "bg-amber-500/15 text-amber-400",
  inactive: "bg-muted text-muted-foreground",
  confirmed: "bg-emerald-500/15 text-emerald-400",
  proposed: "bg-amber-500/15 text-amber-400",
  cancelled: "bg-red-500/15 text-red-400",
  completed: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-400",
  received: "bg-purple-500/15 text-purple-400",
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function handleOpenSearch() {
      setOpen(true);
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("open-search", handleOpenSearch);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("open-search", handleOpenSearch);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults(null);
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results);
        setSelectedIndex(0);
      } catch {
        setResults(null);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const allResults = useCallback((): SearchResult[] => {
    if (!results) return [];
    return [...results.clients, ...results.sessions, ...results.messages];
  }, [results]);

  function handleSelect(result: SearchResult) {
    setOpen(false);
    router.push(result.href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const items = allResults();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = items[selectedIndex];
      if (selected) handleSelect(selected);
    }
  }

  if (!open) return null;

  const items = allResults();
  const hasResults = items.length > 0;

  return (
    <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" />
      <div className="fixed inset-x-0 top-[15vh] mx-auto max-w-lg px-4" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 border-b border-border">
            <svg className="w-4 h-4 text-muted-foreground shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search clients, sessions, messages..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 py-3 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              ESC
            </kbd>
          </div>

          {query.length >= 2 && (
            <div className="max-h-[50vh] overflow-y-auto">
              {!hasResults && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No results for &ldquo;{query}&rdquo;
                </div>
              )}

              {results && (["clients", "sessions", "messages"] as const).map((type) => {
                const group = results[type];
                if (group.length === 0) return null;
                const config = TYPE_CONFIG[type === "clients" ? "client" : type === "sessions" ? "session" : "message"];

                return (
                  <div key={type}>
                    <div className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {config.emoji} {config.label}
                    </div>
                    {group.map((result) => {
                      const globalIdx = items.indexOf(result);
                      const isSelected = globalIdx === selectedIndex;

                      return (
                        <button
                          key={`${result.type}-${result.id}`}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                            isSelected ? "bg-accent/10" : "hover:bg-accent/5"
                          }`}
                          onClick={() => handleSelect(result)}
                          onMouseEnter={() => setSelectedIndex(globalIdx)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{result.title}</div>
                            {result.subtitle && (
                              <div className="text-xs text-muted-foreground truncate">{result.subtitle}</div>
                            )}
                          </div>
                          <Badge className={`border-0 text-xs shrink-0 ${STATUS_BADGE[result.badge] ?? "bg-muted text-muted-foreground"}`}>
                            {result.badge}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {query.length < 2 && (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground/60">
              Type to search across clients, sessions, and messages
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
