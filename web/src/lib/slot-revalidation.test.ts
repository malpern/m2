import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the slot re-validation logic used during multi-turn conversations.
 * When a client replies to select an offered slot, we re-check availability
 * before confirming. This tests the pure filtering logic that mirrors what
 * the Twilio webhook does.
 */

/* ---------- DB mock ---------- */
const mockDbSelect = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("@/lib/google-calendar", () => ({
  isConnected: () => ({ connected: false }),
  listEvents: () => [],
}));

const { isSlotStillOpen } = await import("./suggest-alternatives");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isSlotStillOpen", () => {
  function setupSlotQuery(results: { id: number }[]) {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          all: () => results,
        }),
      }),
    });
  }

  it("returns true when no sessions exist at the given date/time", async () => {
    setupSlotQuery([]);
    const result = await isSlotStillOpen("2026-06-03", "15:00");
    expect(result).toBe(true);
  });

  it("returns false when a session exists at the given date/time", async () => {
    setupSlotQuery([{ id: 42 }]);
    const result = await isSlotStillOpen("2026-06-03", "15:00");
    expect(result).toBe(false);
  });

  it("returns false when multiple sessions exist at the given date/time", async () => {
    setupSlotQuery([{ id: 42 }, { id: 43 }]);
    const result = await isSlotStillOpen("2026-06-03", "15:00");
    expect(result).toBe(false);
  });
});

describe("offered slot re-validation filtering", () => {
  /**
   * This tests the pure filtering logic that the Twilio webhook applies:
   * Given a list of parsed offered slots, filter out any that are no longer open.
   */

  function setupSlotQueryForMultiple(openSlots: Set<string>) {
    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          all: () => {
            // We track calls to determine which slot is being checked
            // Return empty array (open) or [{id:1}] (taken) based on the set
            return [];
          },
        }),
      }),
    }));
  }

  it("filters out taken slots from offered list", async () => {
    const parsedOfferedSlots = [
      { date: "2026-06-03", slot: "3pm", day: "tuesday" },
      { date: "2026-06-04", slot: "4pm", day: "wednesday" },
      { date: "2026-06-05", slot: "5pm", day: "thursday" },
    ];

    const SLOT_TIMES: Record<string, string> = {
      "3pm": "15:00", "4pm": "16:00", "5pm": "17:00", "6pm": "18:00", "7pm": "19:00",
    };

    // Simulate: tuesday 3pm is taken, others are open
    let callCount = 0;
    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          all: () => {
            callCount++;
            // First call (3pm) → taken, second (4pm) → open, third (5pm) → open
            return callCount === 1 ? [{ id: 99 }] : [];
          },
        }),
      }),
    }));

    const stillOpen: typeof parsedOfferedSlots = [];
    for (const slot of parsedOfferedSlots) {
      const time = SLOT_TIMES[slot.slot];
      if (time && await isSlotStillOpen(slot.date, time)) {
        stillOpen.push(slot);
      }
    }

    expect(stillOpen).toHaveLength(2);
    expect(stillOpen.map((s) => s.slot)).toEqual(["4pm", "5pm"]);
  });

  it("returns empty when all offered slots are taken", async () => {
    const parsedOfferedSlots = [
      { date: "2026-06-03", slot: "3pm", day: "tuesday" },
      { date: "2026-06-04", slot: "4pm", day: "wednesday" },
    ];

    const SLOT_TIMES: Record<string, string> = {
      "3pm": "15:00", "4pm": "16:00", "5pm": "17:00", "6pm": "18:00", "7pm": "19:00",
    };

    // All slots are taken
    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          all: () => [{ id: 99 }],
        }),
      }),
    }));

    const stillOpen: typeof parsedOfferedSlots = [];
    for (const slot of parsedOfferedSlots) {
      const time = SLOT_TIMES[slot.slot];
      if (time && await isSlotStillOpen(slot.date, time)) {
        stillOpen.push(slot);
      }
    }

    expect(stillOpen).toHaveLength(0);
  });

  it("returns all when none are taken", async () => {
    const parsedOfferedSlots = [
      { date: "2026-06-03", slot: "3pm", day: "tuesday" },
      { date: "2026-06-04", slot: "4pm", day: "wednesday" },
    ];

    const SLOT_TIMES: Record<string, string> = {
      "3pm": "15:00", "4pm": "16:00", "5pm": "17:00", "6pm": "18:00", "7pm": "19:00",
    };

    // No slots are taken
    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          all: () => [],
        }),
      }),
    }));

    const stillOpen: typeof parsedOfferedSlots = [];
    for (const slot of parsedOfferedSlots) {
      const time = SLOT_TIMES[slot.slot];
      if (time && await isSlotStillOpen(slot.date, time)) {
        stillOpen.push(slot);
      }
    }

    expect(stillOpen).toHaveLength(2);
  });

  it("detects when user selects a stale slot that was in the original offer", () => {
    // This is a pure logic test for the matching behavior
    const parsedOfferedSlots = [
      { date: "2026-06-03", slot: "3pm", day: "tuesday" },
      { date: "2026-06-04", slot: "4pm", day: "wednesday" },
    ];
    const stillOpenSlots = [
      { date: "2026-06-04", slot: "4pm", day: "wednesday" },
    ];

    const userReply = "tuesday please";
    const lower = userReply.toLowerCase().trim();

    // Match against still-open slots → no match
    const matchedFromOpen = stillOpenSlots.filter(
      (s) => lower.includes(s.slot) || lower.includes(s.day.slice(0, 3)) || lower.includes(s.day)
    );
    expect(matchedFromOpen).toHaveLength(0);

    // Match against original parsed slots → finds the stale one
    const matchedFromOriginal = parsedOfferedSlots.filter(
      (s) => lower.includes(s.slot) || lower.includes(s.day.slice(0, 3)) || lower.includes(s.day)
    );
    expect(matchedFromOriginal).toHaveLength(1);
    expect(matchedFromOriginal[0].day).toBe("tuesday");

    // This means user selected a slot that got booked → should offer fresh alternatives
  });
});
