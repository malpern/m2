import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {},
}));
vi.mock("@/lib/google-calendar", () => ({
  isConnected: () => ({ connected: false }),
  listEvents: () => [],
}));

const { diversifyAcrossDays } = await import("./suggest-alternatives");

describe("diversifyAcrossDays", () => {
  it("picks slots from different days when possible", () => {
    const ranked = [
      { day: "friday", slot: "3pm" as const },
      { day: "friday", slot: "4pm" as const },
      { day: "friday", slot: "5pm" as const },
      { day: "monday", slot: "3pm" as const },
      { day: "wednesday", slot: "4pm" as const },
    ];
    const result = diversifyAcrossDays(ranked, 3);
    const days = new Set(result.map((s) => s.day));
    expect(days.size).toBeGreaterThanOrEqual(2);
    expect(result).toHaveLength(3);
  });

  it("returns all slots when fewer than maxOptions", () => {
    const ranked = [
      { day: "friday", slot: "3pm" as const },
      { day: "friday", slot: "4pm" as const },
    ];
    const result = diversifyAcrossDays(ranked, 3);
    expect(result).toHaveLength(2);
  });

  it("fills remaining from same day if not enough unique days", () => {
    const ranked = [
      { day: "friday", slot: "3pm" as const },
      { day: "friday", slot: "4pm" as const },
      { day: "friday", slot: "5pm" as const },
    ];
    const result = diversifyAcrossDays(ranked, 3);
    expect(result).toHaveLength(3);
  });
});
