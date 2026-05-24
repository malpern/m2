import { describe, it, expect } from "vitest";
import {
  sortByPriority,
  sortByWeightedPriority,
  computePriorityScore,
  isSchedulable,
  DEFAULT_WEIGHTS,
  type PriorityWeights,
} from "./priority";

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    collegeBound: false,
    gradeLevel: "junior" as const,
    behaviorScore: 5,
    noShowCount: 0,
    sortOrder: null as number | null,
    ...overrides,
  };
}

describe("sortByPriority", () => {
  it("college-bound athletes rank above all others", () => {
    const clients = [
      makeClient({ collegeBound: false, gradeLevel: "senior", behaviorScore: 10 }),
      makeClient({ collegeBound: true, gradeLevel: "freshman", behaviorScore: 1 }),
    ];

    const sorted = sortByPriority(clients);
    expect(sorted[0].collegeBound).toBe(true);
  });

  it("sorts by grade level within college-bound group (same effort)", () => {
    const clients = [
      makeClient({ collegeBound: true, gradeLevel: "junior", behaviorScore: 5 }),
      makeClient({ collegeBound: true, gradeLevel: "senior", behaviorScore: 5 }),
    ];

    const sorted = sortByPriority(clients);
    expect(sorted[0].gradeLevel).toBe("senior");
  });

  it("sorts by behavior score within same grade", () => {
    const clients = [
      makeClient({ gradeLevel: "junior", behaviorScore: 5 }),
      makeClient({ gradeLevel: "junior", behaviorScore: 9 }),
    ];

    const sorted = sortByPriority(clients);
    expect(sorted[0].behaviorScore).toBe(9);
  });

  it("ranks adults below freshmen when effort is equal", () => {
    const clients = [
      makeClient({ gradeLevel: "adult", behaviorScore: 5 }),
      makeClient({ gradeLevel: "freshman", behaviorScore: 5 }),
    ];

    const sorted = sortByPriority(clients);
    expect(sorted[0].gradeLevel).toBe("freshman");
  });

  it("manual sort order overrides algorithm", () => {
    const clients = [
      makeClient({ collegeBound: true, gradeLevel: "senior", behaviorScore: 10, sortOrder: 2 }),
      makeClient({ collegeBound: false, gradeLevel: "freshman", behaviorScore: 1, sortOrder: 0 }),
      makeClient({ collegeBound: true, gradeLevel: "junior", behaviorScore: 8, sortOrder: 1 }),
    ];

    const sorted = sortByPriority(clients);
    expect(sorted[0].behaviorScore).toBe(1); // freshman with sortOrder 0
    expect(sorted[1].behaviorScore).toBe(8); // junior with sortOrder 1
    expect(sorted[2].behaviorScore).toBe(10); // senior with sortOrder 2
  });

  it("falls back to algorithm when no manual order exists", () => {
    const clients = [
      makeClient({ collegeBound: false, gradeLevel: "sophomore", behaviorScore: 6 }),
      makeClient({ collegeBound: true, gradeLevel: "senior", behaviorScore: 9 }),
      makeClient({ collegeBound: false, gradeLevel: "senior", behaviorScore: 7 }),
    ];

    const sorted = sortByPriority(clients);
    expect(sorted[0].collegeBound).toBe(true);
    expect(sorted[1].gradeLevel).toBe("senior");
    expect(sorted[2].gradeLevel).toBe("sophomore");
  });

  it("handles mixed manual and unset sort orders", () => {
    const clients = [
      makeClient({ behaviorScore: 1, sortOrder: null }),
      makeClient({ behaviorScore: 10, sortOrder: 0 }),
    ];

    const sorted = sortByPriority(clients);
    expect(sorted[0].behaviorScore).toBe(10); // explicit sortOrder 0
    expect(sorted[1].behaviorScore).toBe(1); // null falls to 999
  });

  it("handles empty array", () => {
    expect(sortByPriority([])).toEqual([]);
  });

  it("handles single client", () => {
    const result = sortByPriority([makeClient()]);
    expect(result).toHaveLength(1);
  });

  it("produces correct full ranking for Matt's roster", () => {
    const roster = [
      makeClient({ collegeBound: false, gradeLevel: "freshman", behaviorScore: 8 }),
      makeClient({ collegeBound: true, gradeLevel: "senior", behaviorScore: 9 }),
      makeClient({ collegeBound: true, gradeLevel: "junior", behaviorScore: 8 }),
      makeClient({ collegeBound: true, gradeLevel: "junior", behaviorScore: 5 }),
      makeClient({ collegeBound: false, gradeLevel: "senior", behaviorScore: 7 }),
      makeClient({ collegeBound: false, gradeLevel: "junior", behaviorScore: 7 }),
      makeClient({ collegeBound: false, gradeLevel: "sophomore", behaviorScore: 6 }),
      makeClient({ collegeBound: false, gradeLevel: "adult", behaviorScore: 10 }),
    ];

    const sorted = sortByPriority(roster);

    // College-bound first: senior 9, junior 8, junior 5
    expect(sorted[0]).toMatchObject({ collegeBound: true, gradeLevel: "senior" });
    expect(sorted[1]).toMatchObject({ collegeBound: true, gradeLevel: "junior", behaviorScore: 8 });
    expect(sorted[2]).toMatchObject({ collegeBound: true, gradeLevel: "junior", behaviorScore: 5 });

    // Then non-college: senior 7, junior 7, sophomore 6, freshman 8, adult 10
    expect(sorted[3]).toMatchObject({ gradeLevel: "senior", behaviorScore: 7 });
    expect(sorted[4]).toMatchObject({ gradeLevel: "junior", behaviorScore: 7 });
    expect(sorted[5]).toMatchObject({ gradeLevel: "sophomore", behaviorScore: 6 });
    expect(sorted[6]).toMatchObject({ gradeLevel: "freshman", behaviorScore: 8 });
    expect(sorted[7]).toMatchObject({ gradeLevel: "adult", behaviorScore: 10 });
  });
});

describe("computePriorityScore", () => {
  it("scores a college-bound senior with high effort", () => {
    const score = computePriorityScore(
      makeClient({ collegeBound: true, gradeLevel: "senior", behaviorScore: 9 }),
      DEFAULT_WEIGHTS
    );
    // 10*5 + 8*3 + 9*2 = 50+24+18 = 92
    expect(score).toBe(92);
  });

  it("scores a non-college adult with max effort", () => {
    const score = computePriorityScore(
      makeClient({ collegeBound: false, gradeLevel: "adult", behaviorScore: 10 }),
      DEFAULT_WEIGHTS
    );
    // 0*5 + 0*3 + 10*2 = 20
    expect(score).toBe(20);
  });

  it("handles null gradeLevel", () => {
    const score = computePriorityScore(
      makeClient({ gradeLevel: null, behaviorScore: 7 }),
      DEFAULT_WEIGHTS
    );
    // 0*5 + 0*3 + 7*2 = 14
    expect(score).toBe(14);
  });

  it("handles all weights set to 1", () => {
    const weights: PriorityWeights = { collegeBoundWeight: 1, gradeLevelWeight: 1, effortWeight: 1 };
    const score = computePriorityScore(
      makeClient({ collegeBound: true, gradeLevel: "senior", behaviorScore: 10 }),
      weights
    );
    // 10*1 + 8*1 + 10*1 = 28
    expect(score).toBe(28);
  });

  it("responds to weight changes", () => {
    const client = makeClient({ collegeBound: false, gradeLevel: "senior", behaviorScore: 10 });
    const lowEffort: PriorityWeights = { collegeBoundWeight: 5, gradeLevelWeight: 3, effortWeight: 1 };
    const highEffort: PriorityWeights = { collegeBoundWeight: 5, gradeLevelWeight: 3, effortWeight: 5 };

    const scoreLow = computePriorityScore(client, lowEffort);
    const scoreHigh = computePriorityScore(client, highEffort);
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });
});

describe("sortByWeightedPriority", () => {
  it("with default weights, college-bound ranks above non-college", () => {
    const clients = [
      makeClient({ collegeBound: false, gradeLevel: "senior", behaviorScore: 10 }),
      makeClient({ collegeBound: true, gradeLevel: "freshman", behaviorScore: 1 }),
    ];
    const sorted = sortByWeightedPriority(clients, DEFAULT_WEIGHTS);
    expect(sorted[0].collegeBound).toBe(true);
  });

  it("high effort weight lets non-college athlete beat low-effort college athlete", () => {
    const highEffortWeights: PriorityWeights = {
      collegeBoundWeight: 1,
      gradeLevelWeight: 1,
      effortWeight: 5,
    };
    const clients = [
      makeClient({ collegeBound: true, gradeLevel: "junior", behaviorScore: 2 }),
      makeClient({ collegeBound: false, gradeLevel: "freshman", behaviorScore: 9 }),
    ];
    const sorted = sortByWeightedPriority(clients, highEffortWeights);
    expect(sorted[0].collegeBound).toBe(false);
    expect(sorted[0].behaviorScore).toBe(9);
  });

  it("manual sortOrder still overrides weighted scoring", () => {
    const clients = [
      makeClient({ collegeBound: true, behaviorScore: 10, sortOrder: 2 }),
      makeClient({ collegeBound: false, behaviorScore: 1, sortOrder: 1 }),
    ];
    const sorted = sortByWeightedPriority(clients, DEFAULT_WEIGHTS);
    expect(sorted[0].behaviorScore).toBe(1);
  });

  it("equal weights rank by total factor value", () => {
    const equalWeights: PriorityWeights = {
      collegeBoundWeight: 1,
      gradeLevelWeight: 1,
      effortWeight: 1,
    };
    const clients = [
      makeClient({ collegeBound: false, gradeLevel: "senior", behaviorScore: 10 }),
      makeClient({ collegeBound: true, gradeLevel: "freshman", behaviorScore: 1 }),
    ];
    const sorted = sortByWeightedPriority(clients, equalWeights);
    // non-college senior effort 10: 0+8+10=18
    // college freshman effort 1: 10+2+1=13
    expect(sorted[0].collegeBound).toBe(false);
  });

  it("default weights produce same top-level ordering as sortByPriority", () => {
    const roster = [
      makeClient({ collegeBound: false, gradeLevel: "freshman", behaviorScore: 8 }),
      makeClient({ collegeBound: true, gradeLevel: "senior", behaviorScore: 9 }),
      makeClient({ collegeBound: true, gradeLevel: "junior", behaviorScore: 8 }),
      makeClient({ collegeBound: false, gradeLevel: "senior", behaviorScore: 7 }),
    ];
    const tiered = sortByPriority(roster);
    const weighted = sortByWeightedPriority(roster, DEFAULT_WEIGHTS);

    // College-bound should be first in both
    expect(tiered[0].collegeBound).toBe(true);
    expect(weighted[0].collegeBound).toBe(true);
    expect(tiered[1].collegeBound).toBe(true);
    expect(weighted[1].collegeBound).toBe(true);
  });
});

describe("isSchedulable", () => {
  it("returns true for active clients", () => {
    expect(isSchedulable({ category: "active" })).toBe(true);
  });

  it("returns true for in-season clients", () => {
    expect(isSchedulable({ category: "in_season" })).toBe(true);
  });

  it("returns false for on-break clients", () => {
    expect(isSchedulable({ category: "on_break" })).toBe(false);
  });

  it("returns false for vacation clients", () => {
    expect(isSchedulable({ category: "vacation" })).toBe(false);
  });

  it("returns false for inactive clients", () => {
    expect(isSchedulable({ category: "inactive" })).toBe(false);
  });
});
