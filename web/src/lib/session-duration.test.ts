import { describe, it, expect } from "vitest";
import {
  slotsSpanned,
  occupiedKeys,
  resolveDuration,
  formatDuration,
  endTime,
} from "./session-duration";

describe("slotsSpanned", () => {
  it("keeps an hour session in its own slot", () => {
    expect(slotsSpanned("3pm", 60)).toEqual(["3pm"]);
  });

  it("spans two slots for 90 minutes — the hour it runs into must be blocked", () => {
    // This is the whole point of #2: before, a 90-minute session left 4pm
    // looking free and it could be double-booked.
    expect(slotsSpanned("3pm", 90)).toEqual(["3pm", "4pm"]);
  });

  it("spans exactly two for 120 minutes, not three", () => {
    expect(slotsSpanned("3pm", 120)).toEqual(["3pm", "4pm"]);
  });

  it("still consumes a whole slot when shorter than an hour", () => {
    // Only the top of the hour is bookable, so a 30-minute session does not
    // free up the back half for someone else.
    expect(slotsSpanned("5pm", 30)).toEqual(["5pm"]);
    expect(slotsSpanned("5pm", 45)).toEqual(["5pm"]);
  });

  it("does not invent slots past the end of the day", () => {
    expect(slotsSpanned("7pm", 120)).toEqual(["7pm"]);
    expect(slotsSpanned("6pm", 180)).toEqual(["6pm", "7pm"]);
  });

  it("falls back to one hour for a missing duration rather than zero slots", () => {
    expect(slotsSpanned("4pm", 0)).toEqual(["4pm"]);
  });

  it("returns nothing for a slot that does not exist", () => {
    expect(slotsSpanned("2pm" as never, 60)).toEqual([]);
  });
});

describe("occupiedKeys", () => {
  it("keys every hour a long session runs through", () => {
    expect(occupiedKeys("2026-06-01", "3pm", 90)).toEqual([
      "2026-06-01|15:00",
      "2026-06-01|16:00",
    ]);
  });

  it("keys a single hour for a normal session", () => {
    expect(occupiedKeys("2026-06-01", "5pm", 60)).toEqual(["2026-06-01|17:00"]);
  });
});

describe("resolveDuration", () => {
  it("prefers the session's own value", () => {
    expect(resolveDuration(90, 30)).toBe(90);
  });

  it("falls back to the client's default", () => {
    expect(resolveDuration(null, 30)).toBe(30);
  });

  it("falls back to the system default when neither is set", () => {
    expect(resolveDuration(null, null)).toBe(60);
  });

  it("treats zero and negatives as unset, not as a real length", () => {
    // A zero-length session is never what was meant, and honouring it would
    // make slotsSpanned fall back anyway — better to resolve it here.
    expect(resolveDuration(0, 45)).toBe(45);
    expect(resolveDuration(-30, null)).toBe(60);
    expect(resolveDuration(null, 0)).toBe(60);
  });
});

describe("formatDuration", () => {
  it("formats the common cases", () => {
    expect(formatDuration(30)).toBe("30m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(45)).toBe("45m");
  });
});

describe("endTime", () => {
  it("adds the duration to the start", () => {
    expect(endTime("15:00", 60)).toBe("16:00");
    expect(endTime("15:00", 90)).toBe("16:30");
    expect(endTime("17:30", 45)).toBe("18:15");
  });

  it("wraps rather than producing a 24+ hour clock", () => {
    expect(endTime("23:30", 60)).toBe("00:30");
  });
});
