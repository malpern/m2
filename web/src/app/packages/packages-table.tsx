"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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

export function PackagesTable({
  clientPackages,
  unreconciled,
}: {
  clientPackages: PackageRow[];
  unreconciled: UnreconciledRow[];
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("remaining");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold">{clientPackages.length}</div>
            <div className="text-xs text-muted-foreground">Active Packages</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold text-amber-400">
              {lowPackages.length}
            </div>
            <div className="text-xs text-muted-foreground">
              Running Low (&#8804; 2 left)
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold text-red-400">
              {totalUnreconciled}
            </div>
            <div className="text-xs text-muted-foreground">
              Unreconciled Sessions
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPackages.map((p) => (
                  <TableRow key={p.packageId}>
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
    </>
  );
}
