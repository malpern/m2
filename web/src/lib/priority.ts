import type { Client } from "@/db/schema";

const GRADE_RANK: Record<string, number> = {
  adult: 0,
  freshman: 1,
  sophomore: 2,
  junior: 3,
  senior: 4,
  post_grad: 5,
};

export function sortByPriority<T extends Pick<Client, "collegeBound" | "gradeLevel" | "behaviorScore" | "sortOrder">>(
  clients: T[]
): T[] {
  const sorted = [...clients];
  const hasManualOrder = sorted.some((c) => c.sortOrder != null);

  sorted.sort((a, b) => {
    if (hasManualOrder) {
      const orderA = a.sortOrder ?? 999;
      const orderB = b.sortOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
    }
    if (a.collegeBound !== b.collegeBound) return a.collegeBound ? -1 : 1;
    const gradeA = GRADE_RANK[a.gradeLevel ?? ""] ?? 0;
    const gradeB = GRADE_RANK[b.gradeLevel ?? ""] ?? 0;
    if (gradeA !== gradeB) return gradeB - gradeA;
    return b.behaviorScore - a.behaviorScore;
  });

  return sorted;
}

export function isSchedulable(client: Pick<Client, "category">) {
  return client.category === "active" || client.category === "in_season";
}
