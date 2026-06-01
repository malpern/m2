"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { updateClientOrder, clearAllSortOrders, updateClientField } from "./actions";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import type { Client } from "@/db/schema";
import { GRADE_RANK } from "@/lib/constants";

type ClientWithPackage = Client & { sessionsRemaining: number | null };

type SortKey =
  | "rank"
  | "name"
  | "rate"
  | "type"
  | "category"
  | "grade"
  | "college"
  | "effort"
  | "sessions"
  | "time";
type SortDir = "asc" | "desc";

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className={`h-3.5 w-1.5 rounded-sm ${
            i < score ? "bg-blue-500" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

function categoryBadge(category: string) {
  switch (category) {
    case "in_season":
      return <Badge variant="default" className="bg-emerald-500/15 text-emerald-400 border-0 hover:bg-emerald-500/15">In Season</Badge>;
    case "active":
      return <Badge variant="default" className="bg-amber-500/15 text-amber-400 border-0 hover:bg-amber-500/15">Active</Badge>;
    case "on_break":
      return <Badge variant="secondary">On Break</Badge>;
    case "vacation":
      return <Badge variant="secondary">Vacation</Badge>;
    case "inactive":
      return <Badge variant="secondary">Inactive</Badge>;
    default:
      return <Badge variant="secondary">{category}</Badge>;
  }
}

function sessionsLeftBadge(remaining: number) {
  if (remaining <= 1) {
    return <Badge variant="default" className="bg-red-500/15 text-red-400 border-0 hover:bg-red-500/15">{remaining}</Badge>;
  }
  if (remaining <= 3) {
    return <Badge variant="default" className="bg-amber-500/15 text-amber-400 border-0 hover:bg-amber-500/15">{remaining}</Badge>;
  }
  return <Badge variant="default" className="bg-emerald-500/15 text-emerald-400 border-0 hover:bg-emerald-500/15">{remaining}</Badge>;
}

function formatSchedule(daysJson: string | null, time: string | null): string {
  const days: string[] = daysJson ? JSON.parse(daysJson) : [];
  const dayAbbrs = days.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3));
  const timeStr = time || "";
  if (dayAbbrs.length > 0 && timeStr) return `${dayAbbrs.join("/")} ${timeStr}`;
  if (dayAbbrs.length > 0) return dayAbbrs.join("/");
  if (timeStr) return timeStr;
  return "—";
}

const GRADE_OPTIONS = [
  { value: "", label: "—" },
  { value: "freshman", label: "Fresh" },
  { value: "sophomore", label: "Soph" },
  { value: "junior", label: "Junior" },
  { value: "senior", label: "Senior" },
  { value: "post_grad", label: "Post-Grad" },
  { value: "adult", label: "Adult" },
];

function InlineGradeSelect({ clientId, value }: { clientId: number; value: string }) {
  const [local, setLocal] = useState(value);
  const [isPending, startTransition] = useTransition();
  const label = GRADE_OPTIONS.find((o) => o.value === local)?.label ?? "—";
  return (
    <select
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        startTransition(() => updateClientField(clientId, "gradeLevel", e.target.value));
      }}
      className={`bg-transparent border-0 outline-none cursor-pointer text-xs appearance-none pr-4 transition-colors ${isPending ? "opacity-50" : ""} ${local ? "text-blue-400 font-medium" : "text-muted-foreground/50"}`}
      aria-label="Grade level"
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 8 8' fill='%234b5563' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 2.5L4 5.5L7 2.5' stroke='%234b5563' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right center" }}
    >
      {GRADE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function InlineCollegeToggle({ clientId, value }: { clientId: number; value: boolean }) {
  const [local, setLocal] = useState(value);
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() => {
        const next = !local;
        setLocal(next);
        startTransition(() => updateClientField(clientId, "collegeBound", next));
      }}
      className={`cursor-pointer transition-colors ${isPending ? "opacity-50" : ""}`}
      aria-label={local ? "College bound: yes, click to toggle" : "College bound: no, click to toggle"}
    >
      {local ? (
        <Badge variant="default" className="bg-purple-500/15 text-purple-400 border-0 hover:bg-purple-500/25">Yes</Badge>
      ) : (
        <span className="text-muted-foreground/30 text-xs">—</span>
      )}
    </button>
  );
}

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

function sortClients(
  clients: ClientWithPackage[],
  key: SortKey,
  dir: SortDir,
  originalOrder: Map<number, number>
): ClientWithPackage[] {
  const sorted = [...clients];
  const mult = dir === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    switch (key) {
      case "rank":
        return mult * ((originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0));
      case "name":
        return mult * a.name.localeCompare(b.name);
      case "rate":
        return mult * ((a.sessionRate ?? 0) - (b.sessionRate ?? 0));
      case "type":
        return mult * (a.sessionType ?? "").localeCompare(b.sessionType ?? "");
      case "category":
        return mult * a.category.localeCompare(b.category);
      case "grade":
        return mult * ((GRADE_RANK[a.gradeLevel ?? ""] ?? -1) - (GRADE_RANK[b.gradeLevel ?? ""] ?? -1));
      case "college":
        return mult * (Number(a.collegeBound) - Number(b.collegeBound));
      case "effort":
        return mult * (a.behaviorScore - b.behaviorScore);
      case "sessions":
        return mult * ((a.sessionsRemaining ?? -1) - (b.sessionsRemaining ?? -1));
      case "time":
        return mult * (a.preferredTime ?? "").localeCompare(b.preferredTime ?? "");
      default:
        return 0;
    }
  });

  return sorted;
}

function DragHandle() {
  return (
    <svg
      className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <circle cx="5" cy="3" r="1.5" />
      <circle cx="11" cy="3" r="1.5" />
      <circle cx="5" cy="8" r="1.5" />
      <circle cx="11" cy="8" r="1.5" />
      <circle cx="5" cy="13" r="1.5" />
      <circle cx="11" cy="13" r="1.5" />
    </svg>
  );
}

type SessionRecord = { date: string; time: string; status: string };

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatSessionTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const suffix = h >= 12 ? "pm" : "am";
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

function SortableRow({
  client,
  rank,
  showRank,
  isInactive,
  sessions,
  isExpanded,
  onToggleExpand,
}: {
  client: ClientWithPackage;
  rank: number;
  showRank: boolean;
  isInactive: boolean;
  sessions: SessionRecord[];
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: client.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <>
      <TableRow
        ref={setNodeRef}
        style={style}
        className={`group ${isInactive ? "opacity-50" : ""} ${
          isDragging ? "bg-muted/80 shadow-lg z-50 relative" : "hover:bg-muted/50"
        }`}
      >
        <TableCell className="w-12">
          <div className="flex items-center gap-1.5">
            <span {...attributes} {...listeners}>
              <DragHandle />
            </span>
            {showRank && !isInactive ? (
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-blue-400">
                {rank}
              </span>
            ) : (
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                {isInactive ? "—" : "·"}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Link href={`/clients/${client.id}`} className="font-semibold hover:underline">
              {client.name}
            </Link>
            {sessions.length > 0 && (
              <button
                onClick={onToggleExpand}
                className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50 hover:bg-muted transition-colors"
              >
                {isExpanded ? "hide" : `${sessions.length}`}
              </button>
            )}
          </div>
        </TableCell>
        <TableCell className="tabular-nums">
          {client.sessionRate ? `$${(client.sessionRate / 100).toFixed(0)}` : "—"}
        </TableCell>
        <TableCell>{categoryBadge(client.category)}</TableCell>
        <TableCell>
          <InlineGradeSelect clientId={client.id} value={client.gradeLevel ?? ""} />
        </TableCell>
        <TableCell>
          <InlineCollegeToggle clientId={client.id} value={client.collegeBound} />
        </TableCell>
        <TableCell><ScoreBar score={client.behaviorScore} /></TableCell>
        <TableCell>
          {client.sessionsRemaining != null
            ? sessionsLeftBadge(client.sessionsRemaining)
            : <span className="text-muted-foreground">—</span>}
        </TableCell>
        <TableCell className="text-muted-foreground text-xs">
          {formatSchedule(client.preferredDays, client.preferredTime)}
        </TableCell>
      </TableRow>
      {isExpanded && sessions.length > 0 && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={9} className="py-0 px-0">
            <div className="ml-16 mr-4 mb-3 mt-1 px-3 py-2 rounded bg-muted/20 border border-border/30">
              <div className="grid grid-cols-[80px_50px_60px_70px] gap-x-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider pb-1 border-b border-border/30 mb-1">
                <div>Date</div>
                <div>Day</div>
                <div>Time</div>
                <div>Status</div>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {sessions.map((s, i) => {
                  const d = new Date(s.date + "T12:00:00");
                  return (
                    <div key={i} className="grid grid-cols-[80px_50px_60px_70px] gap-x-3 text-xs text-muted-foreground py-0.5">
                      <div className="tabular-nums">{s.date}</div>
                      <div>{DAY_NAMES[d.getDay()]}</div>
                      <div className="tabular-nums">{formatSessionTime(s.time)}</div>
                      <div className="capitalize">{s.status}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function MobileClientCard({
  client,
  rank,
  showRank,
  isInactive,
  sessions,
  isExpanded,
  onToggleExpand,
}: {
  client: ClientWithPackage;
  rank: number;
  showRank: boolean;
  isInactive: boolean;
  sessions: SessionRecord[];
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const gradeLabel = GRADE_OPTIONS.find((o) => o.value === (client.gradeLevel ?? ""))?.label;

  return (
    <div className={`rounded-lg border border-border p-3 ${isInactive ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {showRank && !isInactive && (
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-blue-400 shrink-0">
              {rank}
            </span>
          )}
          <Link href={`/clients/${client.id}`} className="font-semibold text-sm hover:underline truncate">
            {client.name}
          </Link>
        </div>
        {categoryBadge(client.category)}
      </div>

      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
        {gradeLabel && gradeLabel !== "—" && (
          <span>{gradeLabel}</span>
        )}
        {client.collegeBound && (
          <Badge variant="default" className="bg-purple-500/15 text-purple-400 border-0 text-xs px-1.5 py-0">College</Badge>
        )}
        {client.sessionRate ? (
          <span className="tabular-nums">${(client.sessionRate / 100).toFixed(0)}/session</span>
        ) : null}
        {client.sessionsRemaining != null && (
          <span className="flex items-center gap-1">
            {sessionsLeftBadge(client.sessionsRemaining)} left
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <ScoreBar score={client.behaviorScore} />
          <span className="text-xs text-muted-foreground">
            {formatSchedule(client.preferredDays, client.preferredTime)}
          </span>
        </div>
        {sessions.length > 0 && (
          <button
            onClick={onToggleExpand}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50 hover:bg-muted transition-colors"
          >
            {isExpanded ? "hide" : `${sessions.length} sessions`}
          </button>
        )}
      </div>

      {isExpanded && sessions.length > 0 && (
        <div className="mt-2 px-2 py-1.5 rounded bg-muted/20 border border-border/30">
          <div className="grid grid-cols-[80px_50px_60px_70px] gap-x-3 text-xs font-medium text-muted-foreground uppercase tracking-wider pb-1 border-b border-border/30 mb-1">
            <div>Date</div>
            <div>Day</div>
            <div>Time</div>
            <div>Status</div>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {sessions.map((s, i) => {
              const d = new Date(s.date + "T12:00:00");
              return (
                <div key={i} className="grid grid-cols-[80px_50px_60px_70px] gap-x-3 text-xs text-muted-foreground py-0.5">
                  <div className="tabular-nums">{s.date}</div>
                  <div>{DAY_NAMES[d.getDay()]}</div>
                  <div className="tabular-nums">{formatSessionTime(s.time)}</div>
                  <div className="capitalize">{s.status}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function ClientTable({
  activeClients,
  inactiveClients,
  sessionsByClient,
}: {
  activeClients: ClientWithPackage[];
  inactiveClients: ClientWithPackage[];
  sessionsByClient: Record<number, SessionRecord[]>;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [localActive, setLocalActive] = useState(activeClients);
  const [isPending, startTransition] = useTransition();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const originalOrder = useMemo(() => {
    const map = new Map<number, number>();
    localActive.forEach((c, i) => map.set(c.id, i));
    inactiveClients.forEach((c, i) => map.set(c.id, localActive.length + i));
    return map;
  }, [localActive, inactiveClients]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "rank" ? "asc" : "desc");
    }
  };

  const query = search.toLowerCase().trim();
  const isDragEnabled = sortKey === "rank" && sortDir === "asc" && !query;

  const filterFn = (c: ClientWithPackage) =>
    !query ||
    c.name.toLowerCase().includes(query) ||
    (c.gradeLevel ?? "").toLowerCase().includes(query) ||
    c.category.toLowerCase().includes(query) ||
    (c.preferredTime ?? "").toLowerCase().includes(query) ||
    (c.notes ?? "").toLowerCase().includes(query);

  const filteredActive = useMemo(
    () => sortClients(localActive.filter(filterFn), sortKey, sortDir, originalOrder),
    [localActive, query, sortKey, sortDir, originalOrder]
  );

  const filteredInactive = useMemo(
    () => sortClients(inactiveClients.filter(filterFn), sortKey, sortDir, originalOrder),
    [inactiveClients, query, sortKey, sortDir, originalOrder]
  );

  const totalShown = filteredActive.length + filteredInactive.length;
  const totalAll = localActive.length + inactiveClients.length;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localActive.findIndex((c) => c.id === active.id);
    const newIndex = localActive.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const updated = [...localActive];
    const [moved] = updated.splice(oldIndex, 1);
    updated.splice(newIndex, 0, moved);
    setLocalActive(updated);

    startTransition(() => {
      updateClientOrder(updated.map((c) => c.id));
    });
  }

  const thClass = "cursor-pointer select-none hover:text-foreground transition-colors";

  const allIds = [...filteredActive, ...filteredInactive].map((c) => c.id);

  if (localActive.length === 0 && inactiveClients.length === 0) {
    return (
      <>
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
        </div>
        <EmptyState
          illustration="people"
          heading="No clients yet"
          description="Add your first athlete to start building your roster and scheduling sessions."
          ctaLabel="Add Client"
          ctaHref="/clients/new"
        />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
            <Link href="/clients/new">
              <Button size="sm" variant="outline" className="h-9 text-xs">+ Add Client</Button>
            </Link>
            {localActive.some((c) => c.sortOrder != null) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-9 text-xs text-muted-foreground"
                onClick={() => startTransition(() => clearAllSortOrders())}
              >
                Reset ranking
              </Button>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {localActive.length} active, ranked by priority.
            {inactiveClients.length > 0 && ` ${inactiveClients.length} on break or inactive.`}
            {query && <span className="ml-2">&middot; Showing {totalShown} of {totalAll}</span>}
            {isPending && <span className="ml-2 text-blue-400">Saving...</span>}
          </p>
        </div>
        <SearchInput
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          aria-label="Search clients"
        />
      </div>

      {/* Mobile card view */}
      <div className="sm:hidden space-y-2">
        {[...filteredActive.map((c, i) => ({ client: c, rank: i + 1, isInactive: false })),
          ...filteredInactive.map((c) => ({ client: c, rank: 0, isInactive: true }))
        ].map(({ client, rank, isInactive }) => (
          <MobileClientCard
            key={client.id}
            client={client}
            rank={rank}
            showRank={sortKey === "rank"}
            isInactive={isInactive}
            sessions={sessionsByClient[client.id] ?? []}
            isExpanded={expandedIds.has(client.id)}
            onToggleExpand={() => setExpandedIds((prev) => {
              const next = new Set(prev);
              if (next.has(client.id)) next.delete(client.id);
              else next.add(client.id);
              return next;
            })}
          />
        ))}
        {totalShown === 0 && (
          <div className="text-center text-muted-foreground py-8 text-sm">
            No clients match &ldquo;{search}&rdquo;
          </div>
        )}
      </div>

      {/* Desktop table view */}
      <div className="hidden sm:block rounded-lg border overflow-x-auto">
        <div className="min-w-[700px]">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={`w-16 ${thClass}`} onClick={() => handleSort("rank")}>
                  Rank <SortIcon active={sortKey === "rank"} dir={sortDir} />
                </TableHead>
                <TableHead className={thClass} onClick={() => handleSort("name")}>
                  Athlete <SortIcon active={sortKey === "name"} dir={sortDir} />
                </TableHead>
                <TableHead className={thClass} onClick={() => handleSort("rate")}>
                  Rate <SortIcon active={sortKey === "rate"} dir={sortDir} />
                </TableHead>
                <TableHead className={thClass} onClick={() => handleSort("category")}>
                  Status <SortIcon active={sortKey === "category"} dir={sortDir} />
                </TableHead>
                <TableHead className={thClass} onClick={() => handleSort("grade")}>
                  Grade <SortIcon active={sortKey === "grade"} dir={sortDir} />
                </TableHead>
                <TableHead className={thClass} onClick={() => handleSort("college")}>
                  College <SortIcon active={sortKey === "college"} dir={sortDir} />
                </TableHead>
                <TableHead className={thClass} onClick={() => handleSort("effort")}>
                  Effort <SortIcon active={sortKey === "effort"} dir={sortDir} />
                </TableHead>
                <TableHead className={thClass} onClick={() => handleSort("sessions")}>
                  Sessions Left <SortIcon active={sortKey === "sessions"} dir={sortDir} />
                </TableHead>
                <TableHead className={thClass} onClick={() => handleSort("time")}>
                  Schedule <SortIcon active={sortKey === "time"} dir={sortDir} />
                </TableHead>
              </TableRow>
            </TableHeader>
            <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
              <TableBody>
                {filteredActive.map((client, i) => (
                  <SortableRow
                    key={client.id}
                    client={client}
                    rank={i + 1}
                    showRank={sortKey === "rank"}
                    isInactive={false}
                    sessions={sessionsByClient[client.id] ?? []}
                    isExpanded={expandedIds.has(client.id)}
                    onToggleExpand={() => setExpandedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(client.id)) next.delete(client.id);
                      else next.add(client.id);
                      return next;
                    })}
                  />
                ))}
                {filteredInactive.map((client) => (
                  <SortableRow
                    key={client.id}
                    client={client}
                    rank={0}
                    showRank={false}
                    isInactive={true}
                    sessions={sessionsByClient[client.id] ?? []}
                    isExpanded={expandedIds.has(client.id)}
                    onToggleExpand={() => setExpandedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(client.id)) next.delete(client.id);
                      else next.add(client.id);
                      return next;
                    })}
                  />
                ))}
                {totalShown === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No clients match &ldquo;{search}&rdquo;
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </SortableContext>
          </Table>
        </DndContext>
        </div>
      </div>
    </>
  );
}
