import { describe, it, expect } from "vitest";
import { reconcile, type AppSession } from "./calendar-reconcile";
import type { ClientRef } from "./calendar-match";

const clients: ClientRef[] = [
  { id: 1, name: "Luke Alexander" },
  { id: 2, name: "Jack Laptalo" },
  { id: 3, name: "Melody Fairweather" },
];

const ev = (title: string, when: string) => ({ title, start: `${when}-07:00` });

const session = (o: Partial<AppSession> = {}): AppSession => ({
  id: 100,
  clientId: 1,
  clientName: "Luke Alexander",
  scheduledDate: "2026-08-03",
  scheduledTime: "15:00",
  status: "completed",
  ...o,
});

describe("reconcile", () => {
  it("matches a calendar event to the session it corresponds to", () => {
    const r = reconcile([ev("Luke Alexander", "2026-08-03T15:00:00")], [session()], clients);
    expect(r.matched).toBe(1);
    expect(r.discrepancies).toHaveLength(0);
  });

  it("flags a session that happened but was never recorded — the missed deduction", () => {
    // This is the case the whole issue exists for.
    const r = reconcile([ev("Luke Alexander", "2026-08-03T15:00:00")], [], clients);
    expect(r.counts.missingFromApp).toBe(1);
    expect(r.discrepancies[0]).toMatchObject({
      type: "missing_from_app",
      clientId: 1,
      clientName: "Luke Alexander",
    });
  });

  it("flags a recorded session with nothing on the calendar to support it", () => {
    const r = reconcile([], [session()], clients);
    expect(r.counts.missingFromCalendar).toBe(1);
    expect(r.discrepancies[0]).toMatchObject({ type: "missing_from_calendar", sessionId: 100 });
  });

  it("does not treat a cancelled session as something that should be on the calendar", () => {
    const r = reconcile([], [session({ status: "cancelled" })], clients);
    expect(r.discrepancies).toHaveLength(0);
  });

  it("matches on the event's own wall-clock time, not the runtime's timezone", () => {
    // The calendar returns an offset; m2 stores local time. Slicing the string
    // keeps them comparable wherever this runs — otherwise CI in UTC would
    // report every session as a discrepancy.
    const r = reconcile(
      [{ title: "Luke Alexander", start: "2026-08-03T15:00:00-07:00" }],
      [session({ scheduledTime: "15:00" })],
      clients,
    );
    expect(r.matched).toBe(1);
  });

  it("routes a first-name-only match to review instead of counting it as a session", () => {
    const r = reconcile([ev("Melody Swim", "2026-08-03T09:00:00")], [], clients);
    expect(r.counts.missingFromApp).toBe(0);
    expect(r.counts.needsReview).toBe(1);
    expect(r.discrepancies[0]).toMatchObject({ type: "needs_review" });
  });

  it("ignores semi-groups and duals rather than reporting them as missed", () => {
    const r = reconcile(
      [ev("Semi-Group", "2026-08-03T12:00:00"), ev("Jaden and Jonah", "2026-08-03T13:00:00")],
      [],
      clients,
    );
    expect(r.discrepancies).toHaveLength(0);
    expect(r.counts.ignored).toBe(2);
  });

  it("ignores personal events instead of billing them", () => {
    const r = reconcile([ev("Woodhaven play date", "2026-08-03T10:00:00")], [], clients);
    expect(r.discrepancies).toHaveLength(0);
    expect(r.ignored[0].reason).toBe("no matching client");
  });

  it("does not match the right client at the wrong time", () => {
    const r = reconcile(
      [ev("Luke Alexander", "2026-08-03T16:00:00")],
      [session({ scheduledTime: "15:00" })],
      clients,
    );
    expect(r.matched).toBe(0);
    expect(r.counts.missingFromApp).toBe(1);
    expect(r.counts.missingFromCalendar).toBe(1);
  });

  it("accounts for every event and every session", () => {
    const events = [
      ev("Luke Alexander", "2026-08-03T15:00:00"),
      ev("Jack Laptalo", "2026-08-03T16:00:00"),
      ev("Semi Group", "2026-08-03T12:00:00"),
      ev("Melody Swim", "2026-08-03T09:00:00"),
    ];
    const sessions = [session(), session({ id: 101, clientId: 2, clientName: "Jack Laptalo", scheduledTime: "17:00" })];
    const r = reconcile(events, sessions, clients);
    const accounted = r.matched + r.discrepancies.filter(d => d.type !== "missing_from_calendar").length + r.ignored.length;
    expect(accounted).toBe(events.length);
  });

  it("sorts discrepancies chronologically so a review reads in order", () => {
    const r = reconcile(
      [ev("Luke Alexander", "2026-08-05T15:00:00"), ev("Jack Laptalo", "2026-08-01T16:00:00")],
      [],
      clients,
    );
    expect(r.discrepancies.map((d) => d.when)).toEqual(["2026-08-01 16:00", "2026-08-05 15:00"]);
  });
});
