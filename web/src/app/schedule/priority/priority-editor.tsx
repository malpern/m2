"use client";

import { useState, useMemo, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
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
import { computePriorityScore, DEFAULT_WEIGHTS, type PriorityWeights } from "@/lib/priority";
import { OUTREACH_DEFAULTS } from "@/lib/outreach-config";
import { savePrioritySettings, saveSortOrder, clearClientSortOrder, clearAllSortOrders } from "./actions";

interface ClientPreview {
  id: number;
  name: string;
  collegeBound: boolean;
  gradeLevel: "freshman" | "sophomore" | "junior" | "senior" | "post_grad" | "adult" | null;
  behaviorScore: number;
  sortOrder: number | null;
}

function ImportanceBar({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: 5 }, (_, i) => (
        <button key={i} onClick={() => onChange(i + 1)} className={`w-8 h-8 rounded-lg transition-all ${i < value ? `${color} shadow-sm` : "bg-muted hover:bg-muted/80"}`} />
      ))}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className={`h-3 w-1.5 rounded-sm ${i < score ? "bg-blue-500" : "bg-muted"}`} />
      ))}
    </div>
  );
}

function SortableClientRow({
  client,
  rank,
  onUnpin,
}: {
  client: ClientPreview & { score: number };
  rank: number;
  onUnpin: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: client.id });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const isPinned = client.sortOrder != null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 py-3 border-b border-border last:border-0 group ${isDragging ? "bg-muted/50 shadow-lg z-50 relative" : ""}`}
    >
      <div className="flex items-center gap-2 flex-shrink-0" {...attributes} {...listeners}>
        <svg className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground cursor-grab active:cursor-grabbing transition-colors" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5" cy="3" r="1.5" /><circle cx="11" cy="3" r="1.5" /><circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" /><circle cx="5" cy="13" r="1.5" /><circle cx="11" cy="13" r="1.5" />
        </svg>
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold flex-shrink-0 ${isPinned ? "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30" : "bg-muted text-blue-400"}`}>
          {rank}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <a href={`/clients/${client.id}`} className="font-semibold text-sm hover:underline">{client.name}</a>
          {isPinned && (
            <button
              onClick={(e) => { e.stopPropagation(); onUnpin(); }}
              className="text-[10px] text-amber-400/70 hover:text-amber-400 transition-colors"
              title="Remove manual ranking"
            >
              pinned ✕
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {client.collegeBound && (
            <Badge className="bg-purple-500/15 text-purple-400 border-0 text-[10px] px-1.5 py-0">College</Badge>
          )}
          {client.gradeLevel && (
            <span className="text-xs text-muted-foreground capitalize">{client.gradeLevel}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <ScoreBar score={client.behaviorScore} />
        <span className="text-xs text-muted-foreground w-8 text-right">{client.score}</span>
      </div>
    </div>
  );
}

export function PriorityEditor({
  initialWeights,
  clients,
}: {
  initialWeights: PriorityWeights;
  clients: ClientPreview[];
}) {
  const [weights, setWeights] = useState(initialWeights);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [localClients, setLocalClients] = useState(clients);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const rankedClients = useMemo(() => {
    const scored = localClients.map((c) => ({
      ...c,
      score: computePriorityScore(c, weights),
    }));

    const pinned = scored.filter((c) => c.sortOrder != null).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const unpinned = scored.filter((c) => c.sortOrder == null).sort((a, b) => b.score - a.score);

    const result: typeof scored = [];
    let pinnedIdx = 0;
    let unpinnedIdx = 0;

    for (let i = 0; i < scored.length; i++) {
      if (pinnedIdx < pinned.length && pinned[pinnedIdx].sortOrder === i) {
        result.push(pinned[pinnedIdx]);
        pinnedIdx++;
      } else if (unpinnedIdx < unpinned.length) {
        result.push(unpinned[unpinnedIdx]);
        unpinnedIdx++;
      }
    }
    while (pinnedIdx < pinned.length) result.push(pinned[pinnedIdx++]);
    while (unpinnedIdx < unpinned.length) result.push(unpinned[unpinnedIdx++]);

    return result;
  }, [localClients, weights]);

  const hasPinned = localClients.some((c) => c.sortOrder != null);

  const hasWeightChanges =
    weights.collegeBoundWeight !== initialWeights.collegeBoundWeight ||
    weights.gradeLevelWeight !== initialWeights.gradeLevelWeight ||
    weights.effortWeight !== initialWeights.effortWeight;

  const handleSave = () => {
    setSaved(false);
    startTransition(async () => {
      await savePrioritySettings(weights.collegeBoundWeight, weights.gradeLevelWeight, weights.effortWeight);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = rankedClients.findIndex((c) => c.id === active.id);
    const newIndex = rankedClients.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const updated = [...localClients];
    const client = updated.find((c) => c.id === active.id);
    if (client) {
      client.sortOrder = newIndex;
      setLocalClients(updated);
      startTransition(() => { saveSortOrder(client.id, newIndex); });
    }
  };

  const handleUnpin = (clientId: number) => {
    const updated = localClients.map((c) => c.id === clientId ? { ...c, sortOrder: null } : c);
    setLocalClients(updated);
    startTransition(() => { clearClientSortOrder(clientId); });
  };

  const handleClearAll = () => {
    setLocalClients(localClients.map((c) => ({ ...c, sortOrder: null })));
    startTransition(() => { clearAllSortOrders(); });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Priority Ranking</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Adjust the algorithm or drag to manually rank.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasWeightChanges && (
            <Button variant="ghost" size="sm" onClick={() => setWeights(DEFAULT_WEIGHTS)}>Reset weights</Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={isPending || !hasWeightChanges}>
            {isPending ? "Saving..." : saved ? "Saved!" : "Save"}
          </Button>
        </div>
      </div>

      <Card className="mb-8">
        <CardContent className="pt-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1">
              <div className="font-semibold text-sm">College Commitment</div>
              <div className="text-xs text-muted-foreground">How much does wanting to play college ball matter?</div>
            </div>
            <ImportanceBar value={weights.collegeBoundWeight} onChange={(v) => setWeights({ ...weights, collegeBoundWeight: v })} color="bg-purple-500" />
          </div>
          <Separator />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1">
              <div className="font-semibold text-sm">Grade Level</div>
              <div className="text-xs text-muted-foreground">Should seniors get priority over younger athletes?</div>
            </div>
            <ImportanceBar value={weights.gradeLevelWeight} onChange={(v) => setWeights({ ...weights, gradeLevelWeight: v })} color="bg-blue-500" />
          </div>
          <Separator />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1">
              <div className="font-semibold text-sm">Effort &amp; Attitude</div>
              <div className="text-xs text-muted-foreground">How much should showing up and working hard matter?</div>
            </div>
            <ImportanceBar value={weights.effortWeight} onChange={(v) => setWeights({ ...weights, effortWeight: v })} color="bg-emerald-500" />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Your roster, ranked</h2>
        {hasPinned && (
          <Button variant="ghost" size="sm" className="text-xs text-amber-400" onClick={handleClearAll}>
            Clear all pins
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
            <SortableContext items={rankedClients.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {rankedClients.map((client, i) => {
                const wave1End = OUTREACH_DEFAULTS.wave1Size;
                const wave2End = OUTREACH_DEFAULTS.wave1Size * 2;
                const showWaveDivider =
                  (i === wave1End || i === wave2End) && i < rankedClients.length;
                const waveLabel = i === wave1End ? "Wave 2 — sent ~45 min later" : i === wave2End ? "Wave 3 — sent ~2 hours later" : "";

                return (
                  <div key={client.id}>
                    {showWaveDivider && (
                      <div className="flex items-center gap-3 py-2 my-1">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{waveLabel}</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    )}
                    <SortableClientRow client={client} rank={i + 1} onUnpin={() => handleUnpin(client.id)} />
                  </div>
                );
              })}
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>

      {hasPinned && (
        <p className="text-xs text-muted-foreground mt-3">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30 text-[9px] font-bold mr-1">1</span>
          Amber = manually pinned. Drag to reorder, click &ldquo;pinned ✕&rdquo; to unpin.
        </p>
      )}
    </div>
  );
}
