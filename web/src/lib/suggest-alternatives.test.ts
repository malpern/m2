import { describe, it, expect, vi, beforeEach } from "vitest";

/* ---------- DB & Google Calendar mocks ---------- */

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

vi.mock("@/lib/google-calendar", () => ({
  isConnected: () => ({ connected: false }),
  listEvents: () => [],
}));

const {
  diversifyAcrossDays,
  formatAlternativesMessage,
  whySlotUnavailable,
} = await import("./suggest-alternatives");

beforeEach(() => {
  vi.clearAllMocks();
});

/* ================================================================== */
/*  diversifyAcrossDays (existing tests, preserved)                    */
/* ================================================================== */
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

/* ================================================================== */
/*  formatAlternativesMessage                                          */
/* ================================================================== */
describe("formatAlternativesMessage", () => {
  it("returns a fully booked message when given empty slots", () => {
    const result = formatAlternativesMessage("Jordan", [], 3);
    expect(result).toContain("fully booked");
    expect(result).toContain("Jordan");
  });

  it("formats a single slot correctly", () => {
    const result = formatAlternativesMessage(
      "Jordan",
      [{ day: "monday", slot: "3pm" as const }],
      3,
    );
    expect(result).toContain("Monday at 3pm");
    expect(result).toContain("Any of those work?");
  });

  it("groups same-day slots with 'or' format", () => {
    const result = formatAlternativesMessage(
      "Jordan",
      [
        { day: "sunday", slot: "4pm" as const },
        { day: "sunday", slot: "5pm" as const },
        { day: "sunday", slot: "6pm" as const },
      ],
      3,
    );
    // Should produce "Sunday at 4pm, 5pm, or 6pm"
    expect(result).toContain("Sunday at 4pm, 5pm, or 6pm");
  });

  it("separates different-day slots with commas", () => {
    const result = formatAlternativesMessage(
      "Jordan",
      [
        { day: "monday", slot: "3pm" as const },
        { day: "wednesday", slot: "4pm" as const },
        { day: "friday", slot: "5pm" as const },
      ],
      3,
    );
    expect(result).toContain("Monday at 3pm");
    expect(result).toContain("Wednesday at 4pm");
    expect(result).toContain("Friday at 5pm");
  });

  it("orders same-day slots chronologically", () => {
    const result = formatAlternativesMessage(
      "Jordan",
      [
        { day: "tuesday", slot: "6pm" as const },
        { day: "tuesday", slot: "3pm" as const },
      ],
      3,
    );
    // The 3pm should appear before 6pm
    expect(result).toContain("Tuesday at 3pm, or 6pm");
  });

  it("respects maxOptions", () => {
    const result = formatAlternativesMessage(
      "Jordan",
      [
        { day: "monday", slot: "3pm" as const },
        { day: "tuesday", slot: "4pm" as const },
        { day: "wednesday", slot: "5pm" as const },
        { day: "thursday", slot: "6pm" as const },
        { day: "friday", slot: "7pm" as const },
      ],
      2,
    );
    // Should only include 2 options (diversifyAcrossDays limits it)
    // Should not include all 5 days
    const dayMentions = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].filter(
      (d) => result.includes(d),
    );
    expect(dayMentions.length).toBeLessThanOrEqual(2);
  });

  it("includes skip week note", () => {
    const result = formatAlternativesMessage(
      "Jordan",
      [{ day: "monday", slot: "3pm" as const }],
      3,
    );
    expect(result).toContain("skip this week");
  });
});

/* ================================================================== */
/*  whySlotUnavailable                                                 */
/* ================================================================== */
describe("whySlotUnavailable", () => {
  // Helper to make the chained DB calls work:
  // db.select().from(X).all() or .where(Y).all()
  function setupDbChain(defaults: unknown[], overrides: unknown[]) {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      const currentCall = callCount;
      return {
        from: () => ({
          // First select().from(defaultAvailability).all() — no where
          all: () => (currentCall === 1 ? defaults : overrides),
          where: () => ({
            all: () => overrides,
          }),
        }),
      };
    });
  }

  it("returns 'not_a_slot' when time is null", async () => {
    const result = await whySlotUnavailable("2026-06-01", "monday", null);
    expect(result).toBe("not_a_slot");
  });

  it("returns 'not_a_slot' when time is not a valid slot", async () => {
    const result = await whySlotUnavailable("2026-06-01", "monday", "2pm");
    expect(result).toBe("not_a_slot");
  });

  it("returns 'not_a_slot' when day is null", async () => {
    const result = await whySlotUnavailable("2026-06-01", null, "3pm");
    expect(result).toBe("not_a_slot");
  });

  it("returns 'not_available' when slot is disabled in defaults", async () => {
    setupDbChain(
      [{ day: "monday", slot: "3pm", enabled: false }],
      [],
    );

    const result = await whySlotUnavailable("2026-06-01", "monday", "3pm");
    expect(result).toBe("not_available");
  });

  it("returns 'not_available' when slot is disabled by override", async () => {
    setupDbChain(
      [{ day: "tuesday", slot: "4pm", enabled: true }],
      [{ day: "tuesday", slot: "4pm", enabled: false }],
    );

    const result = await whySlotUnavailable("2026-06-01", "tuesday", "4pm");
    expect(result).toBe("not_available");
  });

  it("returns 'booked' when slot is enabled (default fallthrough)", async () => {
    setupDbChain(
      [{ day: "friday", slot: "5pm", enabled: true }],
      [],
    );

    const result = await whySlotUnavailable("2026-06-01", "friday", "5pm");
    expect(result).toBe("booked");
  });

  it("returns 'booked' when slot has no explicit availability record", async () => {
    setupDbChain([], []);

    const result = await whySlotUnavailable("2026-06-01", "wednesday", "6pm");
    expect(result).toBe("booked");
  });

  it("override re-enables a disabled default", async () => {
    setupDbChain(
      [{ day: "monday", slot: "3pm", enabled: false }],
      [{ day: "monday", slot: "3pm", enabled: true }],
    );

    const result = await whySlotUnavailable("2026-06-01", "monday", "3pm");
    // Override sets enabled=true, so the availMap value is true, so it falls through to "booked"
    expect(result).toBe("booked");
  });
});
