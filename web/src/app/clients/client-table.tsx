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
import { updateClientOrder } from "./actions";
import { EmptyState } from "@/components/empty-state";
import type { Client } from "@/db/schema";

type ClientWithPackage = Client & { sessionsRemaining: number | null };

type SortKey =
  | "rank"
  | "name"
  | "category"
  | "grade"
  | "college"
  | "effort"
  | "sessions"
  | "time";
type SortDir = "asc" | "desc";

const GRADE_RANK: Record<string, number> = {
  adult: 0,
  freshman: 1,
  sophomore: 2,
  junior: 3,
  senior: 4,
  post_grad: 5,
};

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

function SortableRow({
  client,
  rank,
  showRank,
  isInactive,
}: {
  client: ClientWithPackage;
  rank: number;
  showRank: boolean;
  isInactive: boolean;
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
        <Link href={`/clients/${client.id}`} className="font-semibold hover:underline">
          {client.name}
        </Link>
      </TableCell>
      <TableCell>{categoryBadge(client.category)}</TableCell>
      <TableCell className="capitalize">{client.gradeLevel ?? "—"}</TableCell>
      <TableCell>
        {client.collegeBound ? (
          <Badge variant="default" className="bg-purple-500/15 text-purple-400 border-0 hover:bg-purple-500/15">Yes</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell><ScoreBar score={client.behaviorScore} /></TableCell>
      <TableCell>
        {client.sessionsRemaining != null
          ? sessionsLeftBadge(client.sessionsRemaining)
          : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-muted-foreground">{client.preferredTime ?? "Flexible"}</TableCell>
    </TableRow>
  );
}

export function ClientTable({
  activeClients,
  inactiveClients,
}: {
  activeClients: ClientWithPackage[];
  inactiveClients: ClientWithPackage[];
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [localActive, setLocalActive] = useState(activeClients);
  const [isPending, startTransition] = useTransition();

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
              <Button size="sm" variant="outline" className="h-7 text-xs">+ Add Client</Button>
            </Link>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {localActive.length} active, ranked by priority.
            {inactiveClients.length > 0 && ` ${inactiveClients.length} on break or inactive.`}
            {query && <span className="ml-2">&middot; Showing {totalShown} of {totalAll}</span>}
            {isPending && <span className="ml-2 text-blue-400">Saving...</span>}
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
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
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

      <div className="rounded-lg border overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
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
                  Preferred Time <SortIcon active={sortKey === "time"} dir={sortDir} />
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
                  />
                ))}
                {filteredInactive.map((client) => (
                  <SortableRow
                    key={client.id}
                    client={client}
                    rank={0}
                    showRank={false}
                    isInactive={true}
                  />
                ))}
                {totalShown === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
