"use client";

import { useState, useMemo, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { computePriorityScore, DEFAULT_WEIGHTS, type PriorityWeights } from "@/lib/priority";
import { savePrioritySettings } from "./actions";

interface ClientPreview {
  id: number;
  name: string;
  collegeBound: boolean;
  gradeLevel: "freshman" | "sophomore" | "junior" | "senior" | "post_grad" | "adult" | null;
  behaviorScore: number;
}

function ImportanceBar({
  value,
  onChange,
  color,
}: {
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: 5 }, (_, i) => (
        <button
          key={i}
          onClick={() => onChange(i + 1)}
          className={`w-8 h-8 rounded-lg transition-all ${
            i < value
              ? `${color} shadow-sm`
              : "bg-muted hover:bg-muted/80"
          }`}
        />
      ))}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className={`h-3 w-1.5 rounded-sm ${i < score ? "bg-blue-500" : "bg-muted"}`}
        />
      ))}
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

  const rankedClients = useMemo(() => {
    const scored = clients.map((c) => ({
      ...c,
      score: computePriorityScore(c, weights),
    }));
    return scored.sort((a, b) => b.score - a.score);
  }, [clients, weights]);

  const hasChanges =
    weights.collegeBoundWeight !== initialWeights.collegeBoundWeight ||
    weights.gradeLevelWeight !== initialWeights.gradeLevelWeight ||
    weights.effortWeight !== initialWeights.effortWeight;

  const handleSave = () => {
    setSaved(false);
    startTransition(async () => {
      await savePrioritySettings(
        weights.collegeBoundWeight,
        weights.gradeLevelWeight,
        weights.effortWeight,
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const handleReset = () => {
    setWeights(DEFAULT_WEIGHTS);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Priority Ranking</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Adjust how much each factor matters when ranking your athletes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Reset
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isPending || !hasChanges}
          >
            {isPending ? "Saving..." : saved ? "Saved!" : "Save"}
          </Button>
        </div>
      </div>

      {/* Importance controls */}
      <Card className="mb-8">
        <CardContent className="pt-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1">
              <div className="font-semibold text-sm">College Commitment</div>
              <div className="text-xs text-muted-foreground">How much does wanting to play college ball matter?</div>
            </div>
            <ImportanceBar
              value={weights.collegeBoundWeight}
              onChange={(v) => setWeights({ ...weights, collegeBoundWeight: v })}
              color="bg-purple-500"
            />
          </div>

          <Separator />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1">
              <div className="font-semibold text-sm">Grade Level</div>
              <div className="text-xs text-muted-foreground">Should seniors get priority over younger athletes?</div>
            </div>
            <ImportanceBar
              value={weights.gradeLevelWeight}
              onChange={(v) => setWeights({ ...weights, gradeLevelWeight: v })}
              color="bg-blue-500"
            />
          </div>

          <Separator />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1">
              <div className="font-semibold text-sm">Effort &amp; Attitude</div>
              <div className="text-xs text-muted-foreground">How much should showing up and working hard matter?</div>
            </div>
            <ImportanceBar
              value={weights.effortWeight}
              onChange={(v) => setWeights({ ...weights, effortWeight: v })}
              color="bg-emerald-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Live preview */}
      <h2 className="text-lg font-bold mb-4">Your roster, ranked</h2>
      <Card>
        <CardContent className="pt-4">
          {rankedClients.map((client, i) => (
            <div
              key={client.id}
              className="flex items-center gap-4 py-3 border-b border-border last:border-0"
              style={{ transition: "all 0.3s ease" }}
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-blue-400 flex-shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{client.name}</div>
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
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
