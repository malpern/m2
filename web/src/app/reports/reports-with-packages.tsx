"use client";

import { useState } from "react";
import { ReportsDashboard } from "./reports-dashboard";
import { PackagesTable } from "../packages/packages-table";

interface PackageData {
  clientId: number;
  clientName: string;
  category: string;
  packageId: number;
  totalSessions: number;
  sessionsUsed: number;
  status: string;
  remaining: number;
}

interface UnreconciledSession {
  sessionId: number;
  clientId: number;
  clientName: string;
  scheduledDate: string;
  scheduledTime: string;
  slot: string;
}

export function ReportsWithPackages({
  stats,
  clientPackages,
  unreconciledSessions,
}: {
  stats: Parameters<typeof ReportsDashboard>[0]["stats"];
  clientPackages: PackageData[];
  unreconciledSessions: UnreconciledSession[];
}) {
  const [tab, setTab] = useState<"reports" | "packages">("reports");

  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setTab("reports")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === "reports"
              ? "border-accent text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Reports
        </button>
        <button
          onClick={() => setTab("packages")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === "packages"
              ? "border-accent text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Packages
        </button>
      </div>

      {tab === "reports" ? (
        <ReportsDashboard stats={stats} />
      ) : (
        <PackagesTable clientPackages={clientPackages} unreconciled={unreconciledSessions} />
      )}
    </div>
  );
}
