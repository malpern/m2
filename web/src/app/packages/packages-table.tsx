"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

export type PackageRow = {
  clientId: number;
  clientName: string;
  category: string;
  packageId: number;
  totalSessions: number;
  sessionsUsed: number;
  status: string;
  remaining: number;
};

export type UnreconciledRow = {
  sessionId: number;
  clientId: number;
  clientName: string;
  scheduledDate: string;
  scheduledTime: string;
  slot: string;
};

function InlineAdjustForm({ clientId, clientName, onClose }: { clientId: number; clientName: string; onClose: () => void }) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200" role="dialog" aria-label="Adjust package" onClick={onClose}>
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200" />
      <div className="relative bg-background border border-border rounded-xl p-5 w-full max-w-sm mx-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-3">Adjust {clientName}&rsquo;s package</h3>
        <div className="flex gap-2 mb-3">
          <input
            type="number"
            placeholder="+2 or -1"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            aria-label="Session adjustment amount"
            className="h-9 w-24 rounded-md border border-border bg-muted/50 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <input
            type="text"
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Adjustment reason"
            className="h-9 flex-1 rounded-md border border-border bg-muted/50 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            size="sm"
            disabled={!delta || !reason || isPending}
            onClick={() => {
              startTransition(async () => {
                const { adjustPackage } = await import("@/app/clients/actions");
                await adjustPackage(clientId, parseInt(delta), reason);
                toast(`Package adjusted for ${clientName}`);
                onClose();
              });
            }}
          >
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

type SortKey = "clientName" | "category" | "sessionsUsed" | "totalSessions" | "remaining";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) {
    return <span className="ml-1 text-muted-foreground/40 text-xs">{"↕"}</span>;
  }
  return (
    <span className="ml-1 text-foreground text-xs">
      {dir === "asc" ? "↑" : "↓"}
    </span>
  );
}

function sortPackages(
  rows: PackageRow[],
  key: SortKey,
  dir: SortDir
): PackageRow[] {
  const sorted = [...rows];
  const mult = dir === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    switch (key) {
      case "clientName":
        return mult * a.clientName.localeCompare(b.clientName);
      case "category":
        return mult * a.category.localeCompare(b.category);
      case "sessionsUsed":
        return mult * (a.sessionsUsed - b.sessionsUsed);
      case "totalSessions":
        return mult * (a.totalSessions - b.totalSessions);
      case "remaining":
        return mult * (a.remaining - b.remaining);
      default:
        return 0;
    }
  });

  return sorted;
}

export type TransactionRow = {
  id: number;
  delta: number;
  reason: string;
  note: string | null;
  previousBalance: number;
  newBalance: number;
  createdAt: string | null;
  clientName: string;
  clientId: number;
};

export function PackagesTable({
  clientPackages,
  recentTransactions = [],
  unreconciled,
}: {
  clientPackages: PackageRow[];
  recentTransactions?: TransactionRow[];
  unreconciled: UnreconciledRow[];
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("remaining");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [adjustingClient, setAdjustingClient] = useState<{ id: number; name: string } | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "clientName" ? "asc" : "asc");
    }
  };

  const query = search.toLowerCase().trim();

  const filteredPackages = useMemo(
    () =>
      sortPackages(
        clientPackages.filter(
          (p) =>
            !query ||
            p.clientName.toLowerCase().includes(query) ||
            p.category.toLowerCase().includes(query)
        ),
        sortKey,
        sortDir
      ),
    [clientPackages, query, sortKey, sortDir]
  );

  const filteredUnreconciled = useMemo(
    () =>
      unreconciled.filter(
        (s) =>
          !query || s.clientName.toLowerCase().includes(query)
      ),
    [unreconciled, query]
  );

  const lowPackages = clientPackages.filter((p) => p.remaining <= 2);
  const totalUnreconciled = unreconciled.length;

  const thClass =
    "cursor-pointer select-none hover:text-foreground transition-colors";

  if (clientPackages.length === 0) {
    return (
      <>
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Packages</h1>
        </div>
        <EmptyState
          illustration="package"
          heading="No packages yet"
          description="Add clients and create session packages to start tracking usage."
          ctaLabel="Go to Clients"
          ctaHref="/clients"
        />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Packages</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {clientPackages.length} active packages.
            {lowPackages.length > 0 &&
              ` ${lowPackages.length} running low.`}
            {query && (
              <span className="ml-2">
                &middot; Showing {filteredPackages.length} of{" "}
                {clientPackages.length}
              </span>
            )}
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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="h-8 w-full sm:w-52 rounded-md border border-border bg-muted/50 pl-8 pr-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring focus:bg-background transition-colors"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent" />
          <CardContent className="relative pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
              </div>
              <div>
                <div className="text-2xl font-bold">{clientPackages.length}</div>
                <div className="text-xs text-muted-foreground">Active Packages</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className={`absolute inset-0 bg-gradient-to-br ${lowPackages.length > 0 ? "from-amber-500/10" : "from-emerald-500/10"} to-transparent`} />
          <CardContent className="relative pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${lowPackages.length > 0 ? "bg-amber-500/15" : "bg-emerald-500/15"}`}>
                <svg className={`w-5 h-5 ${lowPackages.length > 0 ? "text-amber-400" : "text-emerald-400"}`} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
              </div>
              <div>
                <div className={`text-2xl font-bold ${lowPackages.length > 0 ? "text-amber-400" : "text-emerald-400"}`}>{lowPackages.length}</div>
                <div className="text-xs text-muted-foreground">Running Low</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className={`absolute inset-0 bg-gradient-to-br ${totalUnreconciled > 0 ? "from-red-500/10" : "from-emerald-500/10"} to-transparent`} />
          <CardContent className="relative pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${totalUnreconciled > 0 ? "bg-red-500/15" : "bg-emerald-500/15"}`}>
                <svg className={`w-5 h-5 ${totalUnreconciled > 0 ? "text-red-400" : "text-emerald-400"}`} viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>
              </div>
              <div>
                <div className={`text-2xl font-bold ${totalUnreconciled > 0 ? "text-red-400" : "text-emerald-400"}`}>{totalUnreconciled}</div>
                <div className="text-xs text-muted-foreground">Unreconciled</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Package alerts */}
      {lowPackages.length > 0 && (
        <Card className="mb-6 border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-400">
              Package Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowPackages.map((p) => (
              <div
                key={p.packageId}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <Link
                  href={`/clients/${p.clientId}`}
                  className="font-semibold text-sm hover:underline"
                >
                  {p.clientName}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {p.sessionsUsed} / {p.totalSessions} used
                  </span>
                  <Badge
                    className={`border-0 ${
                      p.remaining <= 0
                        ? "bg-red-500/15 text-red-400"
                        : "bg-amber-500/15 text-amber-400"
                    }`}
                  >
                    {p.remaining} left
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* All packages table */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">All Packages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className={thClass}
                    onClick={() => handleSort("clientName")}
                  >
                    Client{" "}
                    <SortIcon
                      active={sortKey === "clientName"}
                      dir={sortDir}
                    />
                  </TableHead>
                  <TableHead
                    className={thClass}
                    onClick={() => handleSort("category")}
                  >
                    Status{" "}
                    <SortIcon
                      active={sortKey === "category"}
                      dir={sortDir}
                    />
                  </TableHead>
                  <TableHead
                    className={thClass}
                    onClick={() => handleSort("sessionsUsed")}
                  >
                    Used{" "}
                    <SortIcon
                      active={sortKey === "sessionsUsed"}
                      dir={sortDir}
                    />
                  </TableHead>
                  <TableHead
                    className={thClass}
                    onClick={() => handleSort("totalSessions")}
                  >
                    Total{" "}
                    <SortIcon
                      active={sortKey === "totalSessions"}
                      dir={sortDir}
                    />
                  </TableHead>
                  <TableHead
                    className={thClass}
                    onClick={() => handleSort("remaining")}
                  >
                    Remaining{" "}
                    <SortIcon
                      active={sortKey === "remaining"}
                      dir={sortDir}
                    />
                  </TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="w-0"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPackages.map((p) => (
                  <TableRow key={p.packageId} className="group">
                    <TableCell>
                      <Link
                        href={`/clients/${p.clientId}`}
                        className="font-semibold hover:underline"
                      >
                        {p.clientName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`border-0 ${
                          p.category === "active" ||
                          p.category === "in_season"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {p.category === "in_season"
                          ? "In Season"
                          : p.category}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.sessionsUsed}</TableCell>
                    <TableCell>{p.totalSessions}</TableCell>
                    <TableCell>
                      <Badge
                        className={`border-0 ${
                          p.remaining <= 0
                            ? "bg-red-500/15 text-red-400"
                            : p.remaining <= 2
                            ? "bg-amber-500/15 text-amber-400"
                            : "bg-emerald-500/15 text-emerald-400"
                        }`}
                      >
                        {p.remaining}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-[120px]">
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            p.remaining <= 0
                              ? "bg-red-500"
                              : p.remaining <= 2
                              ? "bg-amber-500"
                              : p.remaining <= 4
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              (p.sessionsUsed / p.totalSessions) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setAdjustingClient({ id: p.clientId, name: p.clientName })}
                      >
                        Adjust
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredPackages.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      No packages match &ldquo;{search}&rdquo;
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recent package activity */}
      {recentTransactions.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Package Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentTransactions.map((t) => {
                const isDeduct = t.delta < 0;
                const isCredit = t.delta > 0;
                const dateStr = t.createdAt ? new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
                const reasonLabel = t.reason === "completed" ? "Session completed" : t.reason === "cancelled" ? "Cancellation credited" : t.note ?? "Manual adjustment";

                return (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${isDeduct ? "text-red-400" : "text-emerald-400"}`}>
                        {isCredit ? "+" : ""}{t.delta}
                      </span>
                      <div>
                        <Link href={`/clients/${t.clientId}`} className="text-sm font-medium hover:underline">{t.clientName}</Link>
                        <div className="text-xs text-muted-foreground">{reasonLabel}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">{t.previousBalance} → {t.newBalance}</div>
                      <div className="text-xs text-muted-foreground/60">{dateStr}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unreconciled sessions */}
      {totalUnreconciled > 0 && (
        <Card className="border-red-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-400">
              Unreconciled Sessions ({filteredUnreconciled.length}
              {query && filteredUnreconciled.length !== totalUnreconciled
                ? ` of ${totalUnreconciled}`
                : ""}
              )
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">
              These sessions were completed but not deducted from a package.
              This is where money gets lost.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Slot</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUnreconciled.map((s) => (
                    <TableRow key={s.sessionId}>
                      <TableCell>
                        <Link
                          href={`/clients/${s.clientId}`}
                          className="font-semibold hover:underline"
                        >
                          {s.clientName}
                        </Link>
                      </TableCell>
                      <TableCell>{s.scheduledDate}</TableCell>
                      <TableCell>{s.scheduledTime}</TableCell>
                      <TableCell>{s.slot}</TableCell>
                    </TableRow>
                  ))}
                  {filteredUnreconciled.length === 0 && query && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground py-8"
                      >
                        No unreconciled sessions match &ldquo;{search}&rdquo;
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {adjustingClient && (
        <InlineAdjustForm
          clientId={adjustingClient.id}
          clientName={adjustingClient.name}
          onClose={() => setAdjustingClient(null)}
        />
      )}
    </>
  );
}
