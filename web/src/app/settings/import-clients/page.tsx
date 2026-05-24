"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { ImportPreviewClient } from "@/app/api/import-clients/route";

type PreviewData = {
  preview: ImportPreviewClient[];
  existingCount: number;
  sheetsCount: number;
  calendarCount: number;
};

function formatRate(cents: number | null): string {
  if (!cents) return "—";
  return `$${(cents / 100).toFixed(0)}`;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const suffix = h >= 12 ? "pm" : "am";
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

export default function ImportClientsPage() {
  const router = useRouter();
  const [data, setData] = useState<PreviewData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; totalSessions?: number } | null>(null);

  useEffect(() => {
    fetch("/api/import-clients")
      .then((r) => r.json())
      .then((d: PreviewData) => {
        setData(d);
        setSelected(new Set(d.preview.map((c) => c.name)));
      })
      .catch(() => setError("Failed to load client data from Google"))
      .finally(() => setLoading(false));
  }, []);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAll() {
    if (!data) return;
    setSelected(new Set(data.preview.map((c) => c.name)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  async function handleImport() {
    if (!data) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setConfirming(false);
    setImporting(true);
    setError(null);
    try {
      const selectedClients = data.preview.filter((c) =>
        selected.has(c.name)
      );
      const res = await fetch("/api/import-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedClients }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-green-600 mb-2">
              {result.imported} clients imported
            </div>
            {result.totalSessions != null && result.totalSessions > 0 && (
              <div className="text-lg font-medium text-muted-foreground mb-2">
                {result.totalSessions} historical sessions loaded
              </div>
            )}
            <p className="text-sm text-muted-foreground mb-4">
              Clients imported with rates, packages, session history, and auto-detected preferred days/times.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => router.push("/clients")}>
                View Clients
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/settings")}
              >
                Back to Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-1">
        Import Clients
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Pull real client data from Google Sheets and Calendar. This replaces all
        existing test data.
      </p>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md mb-4">
          {error}
        </div>
      )}

      {loading && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Loading client data from Google Sheets and Calendar...
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold">{data.sheetsCount}</div>
                <div className="text-xs text-muted-foreground">In Sheets</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold">{data.calendarCount}</div>
                <div className="text-xs text-muted-foreground">
                  In Calendar
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold">{data.existingCount}</div>
                <div className="text-xs text-muted-foreground">Current DB</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Select Clients to Import ({selected.size} selected)
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll}>
                    All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={selectNone}>
                    None
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="hidden sm:grid grid-cols-[auto_1fr_70px_80px_80px_90px_120px] gap-x-4 px-2 pb-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-b">
                <div className="w-4" />
                <div>Name</div>
                <div className="text-right">Rate</div>
                <div className="text-right">Sessions</div>
                <div className="text-right">Last Seen</div>
                <div className="text-right">Package</div>
                <div className="text-right">Source</div>
              </div>
              <div className="space-y-0.5 mt-1">
                {data.preview.map((client) => (
                  <div key={client.name}>
                    <label
                      className="grid grid-cols-1 sm:grid-cols-[auto_1fr_70px_80px_80px_90px_120px] gap-x-4 items-center py-2 px-2 rounded-md hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selected.has(client.name)}
                        onCheckedChange={() => toggle(client.name)}
                      />
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {client.name}
                        </span>
                        {client.parentGuardian && (
                          <span className="text-[11px] text-muted-foreground">
                            ({client.parentGuardian})
                          </span>
                        )}
                        {client.history.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setExpanded((prev) => {
                                const next = new Set(prev);
                                if (next.has(client.name)) next.delete(client.name);
                                else next.add(client.name);
                                return next;
                              });
                            }}
                            className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded bg-muted"
                          >
                            {expanded.has(client.name) ? "hide" : `${client.history.length} appts`}
                          </button>
                        )}
                      </div>
                      <div className="text-right text-sm tabular-nums">
                        {formatRate(client.rate)}
                      </div>
                      <div className="text-right text-sm tabular-nums text-muted-foreground">
                        {client.sessions2026 || "—"}
                      </div>
                      <div className="text-right text-xs tabular-nums text-muted-foreground">
                        {client.lastDate || "—"}
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {client.lastPackage || "—"}
                      </div>
                      <div className="flex gap-1 justify-end">
                        {client.inSheets && (
                          <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-medium">
                            Sheets
                          </span>
                        )}
                        {client.inCalendar && (
                          <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-medium">
                            Cal
                          </span>
                        )}
                        {client.hasDue && (
                          <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold">
                            DUE
                          </span>
                        )}
                      </div>
                    </label>
                    {expanded.has(client.name) && client.history.length > 0 && (
                      <div className="ml-10 mb-2 px-3 py-2 rounded bg-muted/30 border border-border/50">
                        <div className="grid grid-cols-3 gap-x-4 text-[10px] font-medium text-muted-foreground uppercase tracking-wider pb-1 border-b border-border/30 mb-1">
                          <div>Date</div>
                          <div>Day</div>
                          <div>Time</div>
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-0.5">
                          {client.history.map((s, i) => (
                            <div key={i} className="grid grid-cols-3 gap-x-4 text-xs text-muted-foreground py-0.5">
                              <div className="tabular-nums">{s.date}</div>
                              <div className="capitalize">{s.dayOfWeek.slice(0, 3)}</div>
                              <div className="tabular-nums">{formatTime(s.time)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {importing && (
            <div className="flex items-center gap-3 mt-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
              <span className="text-sm font-medium text-blue-400">
                Importing {selected.size} clients... This may take a moment.
              </span>
            </div>
          )}

          {!importing && (
            <div className="flex items-center gap-3 mt-6">
              {confirming ? (
                <>
                  <Button
                    variant="destructive"
                    onClick={handleImport}
                  >
                    Yes, replace {data.existingCount} clients with {selected.size}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setConfirming(false)}
                  >
                    No, go back
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={handleImport}
                    disabled={selected.size === 0}
                  >
                    Import {selected.size} Clients
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push("/settings")}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-3">
            This replaces all existing clients with the selected imports.
          </p>
        </>
      )}
    </div>
  );
}
