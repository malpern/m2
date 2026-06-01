"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
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
        <StatCard label="Total Sessions" count={stats.totalSessions} color="blue" icon={<svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>} />
        <StatCard label="Completed" count={stats.completed} color="emerald" icon={<svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>} />
        <StatCard label="Cancelled" count={stats.cancelled} color="red" icon={<svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>} />
        <StatCard label="No-Show" count={stats.noShow} color="amber" icon={<svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="text-sm text-muted-foreground">Show-up Rate</div>
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
