import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/twilio", () => ({ sendSMS: vi.fn() }));
vi.mock("@/lib/logger", () => ({ syslog: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { stripOfferedTags, buildConversationHistory, formatSlotsText, getDayLabel, SLOT_TIMES_MAP } from "./shared";

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
