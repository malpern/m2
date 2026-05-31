import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSelect = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: () => mockDbSelect(),
  },
}));

vi.mock("@/db/schema", () => ({
  defaultAvailability: {},
  weeklyOverrides: {},
}));

const { isVacationWeek } = await import("./vacation-detect");

beforeEach(() => {
  vi.clearAllMocks();
});

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "sunday"];
const SLOTS = ["3pm", "4pm", "5pm", "6pm", "7pm"];

function makeDefaults(enabled: boolean) {
  return DAYS.flatMap((day) =>
    SLOTS.map((slot) => ({ day, slot, enabled }))
  );
}

describe("isVacationWeek", () => {
  it("returns false when all slots are enabled (no overrides)", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { from: () => ({ all: () => makeDefaults(true) }) };
      }
      return { from: () => ({ where: () => ({ all: () => [] }) }) };
    });

    const result = await isVacationWeek("2026-06-08");
    expect(result).toBe(false);
  });

  it("returns true when all defaults are disabled and no overrides", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { from: () => ({ all: () => makeDefaults(false) }) };
      }
      return { from: () => ({ where: () => ({ all: () => [] }) }) };
    });

    const result = await isVacationWeek("2026-06-08");
    expect(result).toBe(true);
  });

  it("returns true when overrides disable all remaining enabled slots", async () => {
    const defaults = makeDefaults(true);
    const overrides = DAYS.flatMap((day) =>
      SLOTS.map((slot) => ({ day, slot, enabled: false, weekOf: "2026-06-08" }))
    );

    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { from: () => ({ all: () => defaults }) };
      }
      return { from: () => ({ where: () => ({ all: () => overrides }) }) };
    });

    const result = await isVacationWeek("2026-06-08");
    expect(result).toBe(true);
  });

  it("returns false when one slot is still enabled via override", async () => {
    const defaults = makeDefaults(false);
    const overrides = [{ day: "monday", slot: "3pm", enabled: true, weekOf: "2026-06-08" }];

    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { from: () => ({ all: () => defaults }) };
      }
      return { from: () => ({ where: () => ({ all: () => overrides }) }) };
    });

    const result = await isVacationWeek("2026-06-08");
    expect(result).toBe(false);
  });
});
