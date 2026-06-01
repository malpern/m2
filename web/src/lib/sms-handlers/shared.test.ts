import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: () => ({
        run: () => {},
        returning: () => ({ get: () => ({ id: 99 }) }),
      }),
    })),
  },
}));
vi.mock("@/lib/twilio", () => ({ sendSMS: vi.fn() }));
vi.mock("@/lib/logger", () => ({ syslog: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/gcal-sync", () => ({ syncSessionToCalendar: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/package-accounting", () => ({ creditCancellation: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/auto-fill", () => ({ autoFillCancelledSlot: vi.fn().mockResolvedValue(undefined) }));

import {
  stripOfferedTags,
  buildConversationHistory,
  formatSlotsText,
  getDayLabel,
  SLOT_TIMES_MAP,
  capitalize,
  ESCALATION_MESSAGE,
  OUTREACH_HISTORY_LIMIT,
  safeSyncCalendar,
  safeCreditCancellation,
  safeAutoFill,
} from "./shared";
import { syncSessionToCalendar } from "@/lib/gcal-sync";
import { creditCancellation } from "@/lib/package-accounting";
import { autoFillCancelledSlot } from "@/lib/auto-fill";

describe("SLOT_TIMES_MAP", () => {
  it("maps slot labels to 24h times", () => {
    expect(SLOT_TIMES_MAP["3pm"]).toBe("15:00");
    expect(SLOT_TIMES_MAP["7pm"]).toBe("19:00");
  });

  it("has all five slots", () => {
    expect(Object.keys(SLOT_TIMES_MAP)).toEqual(["3pm", "4pm", "5pm", "6pm", "7pm"]);
  });
});

describe("stripOfferedTags", () => {
  it("removes offered tags from text", () => {
    expect(stripOfferedTags("Hey!\n[offered:2026-06-02|3pm]")).toBe("Hey!");
  });

  it("handles multiple tags", () => {
    expect(stripOfferedTags("text\n[offered:2026-06-02|3pm]\n[offered:2026-06-03|4pm]")).toBe("text");
  });

  it("returns plain text unchanged", () => {
    expect(stripOfferedTags("Hello there")).toBe("Hello there");
  });
});

describe("buildConversationHistory", () => {
  it("sorts by timestamp and strips offered tags", () => {
    const records = [
      { direction: "received", messageText: "Yes", sentAt: null, repliedAt: "2026-06-01T10:05:00Z" },
      { direction: "sent", messageText: "How about 3pm?\n[offered:2026-06-02|3pm]", sentAt: "2026-06-01T10:00:00Z", repliedAt: null },
    ];
    const result = buildConversationHistory(records);
    expect(result).toEqual([
      { direction: "sent", text: "How about 3pm?" },
      { direction: "received", text: "Yes" },
    ]);
  });

  it("handles empty records", () => {
    expect(buildConversationHistory([])).toEqual([]);
  });
});

describe("formatSlotsText", () => {
  it("formats slots with day labels", () => {
    const slots = [
      { day: "monday", slot: "3pm" },
      { day: "wednesday", slot: "5pm" },
    ];
    expect(formatSlotsText(slots)).toBe("Monday at 3pm, Wednesday at 5pm");
  });

  it("handles unknown days gracefully", () => {
    expect(formatSlotsText([{ day: "holiday", slot: "3pm" }])).toBe("holiday at 3pm");
  });
});

describe("getDayLabel", () => {
  it("returns the weekday name for a date", () => {
    expect(getDayLabel("2026-06-01")).toBe("Monday");
    expect(getDayLabel("2026-06-05")).toBe("Friday");
  });
});

describe("re-exported constants", () => {
  it("re-exports capitalize from constants", () => {
    expect(capitalize("monday")).toBe("Monday");
  });

  it("re-exports ESCALATION_MESSAGE", () => {
    expect(ESCALATION_MESSAGE).toBe("Let me check with Matt and get back to you.");
  });

  it("re-exports OUTREACH_HISTORY_LIMIT", () => {
    expect(OUTREACH_HISTORY_LIMIT).toBe(50);
  });
});

describe("safeSyncCalendar", () => {
  it("calls syncSessionToCalendar with the session id", () => {
    safeSyncCalendar(42);
    expect(syncSessionToCalendar).toHaveBeenCalledWith(42);
  });
});

describe("safeCreditCancellation", () => {
  it("calls creditCancellation with the session id", () => {
    safeCreditCancellation(42);
    expect(creditCancellation).toHaveBeenCalledWith(42);
  });
});

describe("safeAutoFill", () => {
  it("calls autoFillCancelledSlot with the correct args", () => {
    safeAutoFill("2026-06-03", "4pm", 1);
    expect(autoFillCancelledSlot).toHaveBeenCalledWith("2026-06-03", "4pm", 1);
  });
});
