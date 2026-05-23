"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { exportSessionsCSV, exportClientsCSV } from "./actions";

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsDashboard({
  stats,
}: {
  stats: {
    totalSessions: number;
    completed: number;
    cancelled: number;
    noShow: number;
    completionRate: number;
    unreconciled: number;
    activeClients: number;
    weeklyAvg: number;
  };
}) {
  const [isPending, startTransition] = useTransition();
  const [range, setRange] = useState("8weeks");

  const getRangeDate = () => {
    const now = new Date();
    switch (range) {
      case "1week": { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString().split("T")[0]; }
      case "4weeks": { const d = new Date(now); d.setDate(d.getDate() - 28); return d.toISOString().split("T")[0]; }
      case "8weeks": { const d = new Date(now); d.setDate(d.getDate() - 56); return d.toISOString().split("T")[0]; }
      default: return "2020-01-01";
    }
  };

  const handleExportSessions = () => {
    startTransition(async () => {
      const start = getRangeDate();
      const end = new Date().toISOString().split("T")[0];
      const csv = await exportSessionsCSV(start, end);
      downloadCSV(csv, `m2-sessions-${start}-to-${end}.csv`);
    });
  };

  const handleExportClients = () => {
    startTransition(async () => {
      const csv = await exportClientsCSV();
      downloadCSV(csv, "m2-clients.csv");
    });
  };

  if (stats.totalSessions === 0) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        </div>
        <EmptyState
          illustration="bar-chart"
          heading="No session data yet"
          description="Once you start scheduling and completing sessions, reports will appear here."
          ctaLabel="Go to Schedule"
          ctaHref="/schedule"
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Session history and exports</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="1week">Last week</option>
            <option value="4weeks">Last 4 weeks</option>
            <option value="8weeks">Last 8 weeks</option>
            <option value="all">All time</option>
          </select>
          <Button onClick={handleExportSessions} disabled={isPending} variant="outline" size="sm">
            {isPending ? "Exporting..." : "Export Sessions .csv"}
          </Button>
          <Button onClick={handleExportClients} disabled={isPending} variant="outline" size="sm">
            Export Clients .csv
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{stats.totalSessions}</div>
            <div className="text-xs text-muted-foreground">Total Sessions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-emerald-400">{stats.completed}</div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-red-400">{stats.cancelled}</div>
            <div className="text-xs text-muted-foreground">Cancelled</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-amber-400">{stats.noShow}</div>
            <div className="text-xs text-muted-foreground">No-Show</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="text-sm text-muted-foreground">Completion Rate</div>
            <div className="text-3xl font-bold mt-1">{stats.completionRate}%</div>
            <div className="h-2 rounded-full bg-muted overflow-hidden mt-3">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${stats.completionRate}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="text-sm text-muted-foreground">Weekly Average</div>
            <div className="text-3xl font-bold mt-1">{stats.weeklyAvg}</div>
            <div className="text-xs text-muted-foreground mt-1">sessions per week</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="text-sm text-muted-foreground">Unreconciled</div>
            <div className={`text-3xl font-bold mt-1 ${stats.unreconciled > 0 ? "text-red-400" : "text-emerald-400"}`}>
              {stats.unreconciled}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats.unreconciled > 0 ? "sessions need package deduction" : "all sessions reconciled"}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
