"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

type PreviewClient = {
  name: string;
  inSheets: boolean;
  inCalendar: boolean;
  sessions2026: number;
  lastDate: string;
};

type PreviewData = {
  preview: PreviewClient[];
  existingCount: number;
  sheetsCount: number;
  calendarCount: number;
};

export default function ImportClientsPage() {
  const router = useRouter();
  const [data, setData] = useState<PreviewData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number } | null>(null);

  useEffect(() => {
    fetch("/api/import-clients")
      .then((r) => r.json())
      .then((d: PreviewData) => {
        setData(d);
        const defaultSelected = new Set(
          d.preview
            .filter((c) => c.inSheets && c.inCalendar)
            .map((c) => c.name)
        );
        setSelected(defaultSelected);
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
    if (!confirm(`This will replace all ${data?.existingCount ?? 0} existing clients with ${selected.size} real clients. Continue?`))
      return;

    setImporting(true);
    try {
      const res = await fetch("/api/import-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedNames: Array.from(selected) }),
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
            <p className="text-sm text-muted-foreground mb-4">
              All fake test data has been replaced with real client data.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => router.push("/clients")}>
                View Clients
              </Button>
              <Button variant="outline" onClick={() => router.push("/settings")}>
                Back to Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Import Clients</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Pull real client names from Google Sheets and Calendar. This replaces all existing test data.
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
                <div className="text-xs text-muted-foreground">In Calendar</div>
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
              <div className="space-y-1">
                {data.preview.map((client) => (
                  <label
                    key={client.name}
                    className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selected.has(client.name)}
                      onCheckedChange={() => toggle(client.name)}
                    />
                    <span className="font-medium text-sm flex-1">
                      {client.name}
                    </span>
                    <div className="flex gap-1.5">
                      {client.inSheets && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                          Sheets ({client.sessions2026})
                        </span>
                      )}
                      {client.inCalendar && (
                        <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                          Calendar
                        </span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 mt-6">
            <Button
              onClick={handleImport}
              disabled={selected.size === 0 || importing}
            >
              {importing
                ? "Importing..."
                : `Import ${selected.size} Clients`}
            </Button>
            <Button variant="outline" onClick={() => router.push("/settings")}>
              Cancel
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-3">
            To revert, re-seed the database with test data from the command line.
          </p>
        </>
      )}
    </div>
  );
}
