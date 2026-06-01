import type { Client } from "@/db/schema";
import { GRADE_RANK } from "./constants";

export { GRADE_RANK };

export type PriorityWeights = {
  collegeBoundWeight: number;
  gradeLevelWeight: number;
  effortWeight: number;
};

export const DEFAULT_WEIGHTS: PriorityWeights = {
  collegeBoundWeight: 5,
  gradeLevelWeight: 3,
  effortWeight: 2,
};

export function computePriorityScore(
  client: Pick<Client, "collegeBound" | "gradeLevel" | "behaviorScore" | "noShowCount">,
  weights: PriorityWeights
): number {
  const collegeValue = client.collegeBound ? 10 : 0;
  const gradeValue = (GRADE_RANK[client.gradeLevel ?? ""] ?? 0) * 2;
  const effortValue = client.behaviorScore;
  const noShowPenalty = (client.noShowCount ?? 0) * 3;

  return (
    collegeValue * weights.collegeBoundWeight +
    gradeValue * weights.gradeLevelWeight +
    effortValue * weights.effortWeight -
    noShowPenalty
  );
}

export function sortByWeightedPriority<
  T extends Pick<Client, "collegeBound" | "gradeLevel" | "behaviorScore" | "noShowCount" | "sortOrder">
>(clients: T[], weights: PriorityWeights): T[] {
  const sorted = [...clients];
  const hasManualOrder = sorted.some((c) => c.sortOrder != null);

  sorted.sort((a, b) => {
    if (hasManualOrder) {
      const orderA = a.sortOrder ?? 999;
      const orderB = b.sortOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
    }
    return computePriorityScore(b, weights) - computePriorityScore(a, weights);
  });

  return sorted;
}

export function sortByPriority<T extends Pick<Client, "collegeBound" | "gradeLevel" | "behaviorScore" | "noShowCount" | "sortOrder">>(
  clients: T[]
): T[] {
  return sortByWeightedPriority(clients, DEFAULT_WEIGHTS);
}

export function isSchedulable(client: Pick<Client, "category">) {
  return client.category === "active" || client.category === "in_season";
}
