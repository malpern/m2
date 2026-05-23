import { describe, it, expect } from "vitest";
import { sortByPriority, isSchedulable } from "./priority";

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    collegeBound: false,
    gradeLevel: "junior" as const,
    behaviorScore: 5,
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

  it("sorts by grade level within college-bound group", () => {
    const clients = [
      makeClient({ collegeBound: true, gradeLevel: "junior", behaviorScore: 9 }),
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

  it("ranks adults below freshmen in the algorithmic sort", () => {
    const clients = [
      makeClient({ gradeLevel: "adult", behaviorScore: 10 }),
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
