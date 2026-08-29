import { describe, it, expect } from "vitest";
import {
  analyseStandingSlotDrift,
  formatStandingSlot,
  type SessionForDrift,
} from "./standing-slot-drift";

const TODAY = new Date("2026-06-15T12:00:00Z"); // a Monday

/** Build one attended session on the given weekday, `weeksAgo` weeks back. */
function session(weeksAgo: number, weekday: number, slot: string, status = "completed"): SessionForDrift {
  // TODAY is a Monday; step back whole weeks then forward to the weekday.
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() - weeksAgo * 7);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (weekday - dow));
  return { scheduledDate: d.toISOString().slice(0, 10), slot, status };
}

const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5;

describe("analyseStandingSlotDrift", () => {
  it("reports no drift when the pattern matches the standing slot", () => {
    const sessions = [1, 2, 3, 4, 5].flatMap((w) => [
      session(w, MON, "3pm"),
      session(w, WED, "3pm"),
    ]);
    const r = analyseStandingSlotDrift("Mon 3pm, Wed 3pm", sessions, TODAY);
    expect(r.drifted).toBe(false);
  });

  it("detects a clean move to different days", () => {
    const sessions = [1, 2, 3, 4, 5].flatMap((w) => [
      session(w, TUE, "5pm"),
      session(w, FRI, "3pm"),
    ]);
    const r = analyseStandingSlotDrift("Mon 3pm, Thu 3pm", sessions, TODAY);
    expect(r.drifted).toBe(true);
    if (!r.drifted) return;
    expect(r.observed.map((e) => `${e.day} ${e.slot}`)).toEqual(["tuesday 5pm", "friday 3pm"]);
    expect(r.summary).toBe("now booking Tue 5pm, Fri 3pm instead of Mon 3pm, Thu 3pm");
  });

  it("detects a same-day time shift", () => {
    const sessions = [1, 2, 3, 4, 5].map((w) => session(w, MON, "6pm"));
    const r = analyseStandingSlotDrift("Mon 3pm", sessions, TODAY);
    expect(r.drifted).toBe(true);
    if (!r.drifted) return;
    expect(r.summary).toBe("now booking Mon 6pm instead of Mon 3pm");
  });

  it("ignores a one-off reschedule", () => {
    // Four weeks on the standing slot, one week moved. Should not flag.
    const sessions = [
      session(1, MON, "3pm"),
      session(2, MON, "3pm"),
      session(3, THU, "5pm"), // the odd week out
      session(4, MON, "3pm"),
      session(5, MON, "3pm"),
    ];
    const r = analyseStandingSlotDrift("Mon 3pm", sessions, TODAY);
    expect(r.drifted).toBe(false);
  });

  it("will not judge on thin data", () => {
    const sessions = [session(1, TUE, "5pm"), session(2, TUE, "5pm")];
    const r = analyseStandingSlotDrift("Mon 3pm", sessions, TODAY);
    expect(r.drifted).toBe(false);
    if (r.drifted) return;
    expect(r.reason).toContain("not enough");
  });

  it("does not count proposed sessions — they are generated FROM the standing slot", () => {
    // If proposals counted, the standing slot would confirm itself and drift
    // could never be detected. All five weeks are proposals on the old slot,
    // plus real attendance on a new one.
    const sessions = [
      ...[1, 2, 3, 4, 5].map((w) => session(w, MON, "3pm", "proposed")),
      ...[1, 2, 3, 4, 5].map((w) => session(w, FRI, "5pm", "completed")),
    ];
    const r = analyseStandingSlotDrift("Mon 3pm", sessions, TODAY);
    expect(r.drifted).toBe(true);
    if (!r.drifted) return;
    expect(r.observed).toEqual([{ day: "friday", slot: "5pm" }]);
  });

  it("does not count cancellations or no-shows as attendance", () => {
    const sessions = [
      ...[1, 2, 3, 4, 5].map((w) => session(w, TUE, "5pm", "cancelled")),
      ...[1, 2, 3, 4, 5].map((w) => session(w, WED, "4pm", "no_show")),
    ];
    const r = analyseStandingSlotDrift("Mon 3pm", sessions, TODAY);
    expect(r.drifted).toBe(false);
    if (r.drifted) return;
    expect(r.reason).toContain("not enough");
  });

  it("ignores sessions older than the window", () => {
    const sessions = [
      ...[1, 2, 3, 4, 5].map((w) => session(w, MON, "3pm")),
      ...[10, 11, 12, 13].map((w) => session(w, FRI, "7pm")), // long past
    ];
    const r = analyseStandingSlotDrift("Mon 3pm", sessions, TODAY);
    expect(r.drifted).toBe(false);
  });

  it("does not let one busy week outvote a steady weekly habit", () => {
    // Three Friday sessions crammed into a single week must not beat a
    // Monday that shows up in five separate weeks.
    const sessions = [
      ...[1, 2, 3, 4, 5].map((w) => session(w, MON, "3pm")),
      { ...session(2, FRI, "7pm") },
      { ...session(2, FRI, "6pm") },
      { ...session(2, FRI, "5pm") },
    ];
    const r = analyseStandingSlotDrift("Mon 3pm", sessions, TODAY);
    expect(r.drifted).toBe(false);
  });

  it("says so when there is no standing slot to compare against", () => {
    const r = analyseStandingSlotDrift(null, [], TODAY);
    expect(r.drifted).toBe(false);
    if (r.drifted) return;
    expect(r.reason).toContain("No standing slot");
  });

  it("says so when the standing slot cannot be parsed", () => {
    const r = analyseStandingSlotDrift("whenever he shows up", [], TODAY);
    expect(r.drifted).toBe(false);
    if (r.drifted) return;
    expect(r.reason).toContain("could not be parsed");
  });

  it("round-trips through the standing slot format", () => {
    const sessions = [1, 2, 3, 4, 5].flatMap((w) => [
      session(w, TUE, "5pm"),
      session(w, FRI, "3pm"),
    ]);
    const r = analyseStandingSlotDrift("Mon 3pm", sessions, TODAY);
    expect(r.drifted).toBe(true);
    if (!r.drifted) return;
    const written = formatStandingSlot(r.observed);
    expect(written).toBe("Tue 5pm, Fri 3pm");
    // Applying the suggestion must make the drift go away, or the one-click
    // update would leave the flag stuck on screen.
    expect(analyseStandingSlotDrift(written, sessions, TODAY).drifted).toBe(false);
  });
});
