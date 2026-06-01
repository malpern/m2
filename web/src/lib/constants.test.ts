import { describe, it, expect } from "vitest";
import {
  SLOT_TIMES,
  SLOT_TIMES_MAP,
  DAY_NAMES_BY_INDEX,
  DAY_LABELS,
  GRADE_RANK,
  ESCALATION_MESSAGE,
  OUTREACH_HISTORY_LIMIT,
  capitalize,
  formatSlotsText,
} from "./constants";

describe("SLOT_TIMES", () => {
  it("maps all five slot labels to 24h times", () => {
    expect(SLOT_TIMES["3pm"]).toBe("15:00");
    expect(SLOT_TIMES["4pm"]).toBe("16:00");
    expect(SLOT_TIMES["5pm"]).toBe("17:00");
    expect(SLOT_TIMES["6pm"]).toBe("18:00");
    expect(SLOT_TIMES["7pm"]).toBe("19:00");
  });

  it("SLOT_TIMES_MAP is the same object", () => {
    expect(SLOT_TIMES_MAP).toBe(SLOT_TIMES);
  });
});

describe("DAY_NAMES_BY_INDEX", () => {
  it("maps JS getDay() indices to lowercase day names", () => {
    expect(DAY_NAMES_BY_INDEX[0]).toBe("sunday");
    expect(DAY_NAMES_BY_INDEX[1]).toBe("monday");
    expect(DAY_NAMES_BY_INDEX[6]).toBe("saturday");
  });
});

describe("DAY_LABELS", () => {
  it("capitalises weekday names", () => {
    expect(DAY_LABELS["monday"]).toBe("Monday");
    expect(DAY_LABELS["friday"]).toBe("Friday");
    expect(DAY_LABELS["sunday"]).toBe("Sunday");
  });
});

describe("GRADE_RANK", () => {
  it("ranks grades in ascending order", () => {
    expect(GRADE_RANK["adult"]).toBeLessThan(GRADE_RANK["freshman"]);
    expect(GRADE_RANK["freshman"]).toBeLessThan(GRADE_RANK["senior"]);
    expect(GRADE_RANK["senior"]).toBeLessThan(GRADE_RANK["post_grad"]);
  });
});

describe("formatSlotsText", () => {
  it("formats slot list with day labels", () => {
    const slots = [
      { day: "monday", slot: "3pm" },
      { day: "wednesday", slot: "5pm" },
    ];
    expect(formatSlotsText(slots)).toBe("Monday at 3pm, Wednesday at 5pm");
  });

  it("falls back to raw day name for unknown days", () => {
    expect(formatSlotsText([{ day: "holiday", slot: "3pm" }])).toBe("holiday at 3pm");
  });
});

describe("ESCALATION_MESSAGE", () => {
  it("contains the expected escalation text", () => {
    expect(ESCALATION_MESSAGE).toBe("Let me check with Matt and get back to you.");
  });
});

describe("OUTREACH_HISTORY_LIMIT", () => {
  it("is 50", () => {
    expect(OUTREACH_HISTORY_LIMIT).toBe(50);
  });
});

describe("capitalize", () => {
  it("capitalises the first letter of a lowercase string", () => {
    expect(capitalize("monday")).toBe("Monday");
  });

  it("leaves an already-capitalised string unchanged", () => {
    expect(capitalize("Tuesday")).toBe("Tuesday");
  });

  it("handles single-character strings", () => {
    expect(capitalize("a")).toBe("A");
  });

  it("handles empty string without error", () => {
    expect(capitalize("")).toBe("");
  });
});
