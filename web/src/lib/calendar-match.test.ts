import { describe, it, expect } from "vitest";
import { classifyEvent, classifyAll, type ClientRef } from "./calendar-match";

/**
 * Every case below is a real title observed on f4lathletics@gmail.com across a
 * month of events, not an invented example.
 */
const clients: ClientRef[] = [
  { id: 1, name: "Luke Alexander" },
  { id: 2, name: "Jack Laptalo" },
  { id: 3, name: "Ethan Bailon" },
  { id: 4, name: "Kenzie Lin" },
  { id: 5, name: "Melody Fairweather" }, // shares a first name with a personal event
  { id: 6, name: "Jack Donovan" }, // second Jack, to make first names ambiguous
];

const ev = (title: string) => ({ title, start: "2026-08-03T15:00:00-07:00" });

describe("classifyEvent", () => {
  it("matches a client by exact name", () => {
    const c = classifyEvent(ev("Luke Alexander"), clients);
    expect(c).toEqual({ kind: "client", clientId: 1, clientName: "Luke Alexander", confidence: "exact" });
  });

  it("ignores case and punctuation", () => {
    // Real titles include "Kiana nakamoto" and "Larkin green" — casing is not reliable.
    expect(classifyEvent(ev("ethan bailon"), clients)).toMatchObject({ clientId: 3, confidence: "exact" });
    expect(classifyEvent(ev("Kenzie  Lin."), clients)).toMatchObject({ clientId: 4, confidence: "exact" });
  });

  it("recognises a semi-group under both spellings seen on the calendar", () => {
    expect(classifyEvent(ev("Semi-Group"), clients)).toEqual({ kind: "semi-group" });
    expect(classifyEvent(ev("Semi Group"), clients)).toEqual({ kind: "semi-group" });
  });

  it("recognises a dual session", () => {
    const c = classifyEvent(ev("Jaden and Jonah"), clients);
    expect(c).toEqual({ kind: "dual", names: ["Jaden", "Jonah"] });
  });

  it("does NOT confidently claim a personal event that shares a first name", () => {
    // "Melody Swim" is a family swim lesson. Client "Melody Fairweather" exists.
    // Turning this into a billable session would be exactly the wrong outcome,
    // so it is surfaced for review rather than accepted.
    const c = classifyEvent(ev("Melody Swim"), clients);
    expect(c).toMatchObject({ kind: "client", confidence: "first-name" });
    expect(c).not.toMatchObject({ confidence: "exact" });
  });

  it("refuses to guess when a first name is ambiguous", () => {
    const c = classifyEvent(ev("Jack Somebodyelse"), clients);
    expect(c.kind).toBe("unknown");
    if (c.kind !== "unknown") return;
    expect(c.reason).toContain("matches 2 clients");
  });

  it("says it does not know rather than inventing a match", () => {
    // Real unmatched titles: clients genuinely absent from the database.
    const c = classifyEvent(ev("Nico Colella"), clients);
    expect(c).toEqual({ kind: "unknown", reason: "no matching client" });
  });

  it("handles an empty title", () => {
    expect(classifyEvent(ev("   "), clients)).toEqual({ kind: "unknown", reason: "no title" });
  });

  it("prefers an exact match over a dual reading", () => {
    const withAnd: ClientRef[] = [...clients, { id: 7, name: "Rock and Roll" }];
    expect(classifyEvent(ev("Rock and Roll"), withAnd)).toMatchObject({ confidence: "exact" });
  });
});

describe("classifyAll", () => {
  it("buckets a realistic mixed day", () => {
    const events = [
      ev("Luke Alexander"),
      ev("Jack Laptalo"),
      ev("Semi-Group"),
      ev("Semi Group"),
      ev("Jaden and Jonah"),
      ev("Melody Swim"),
      ev("Woodhaven play date"),
      ev("Nico Colella"),
    ];
    const out = classifyAll(events, clients);
    expect(out.exact).toHaveLength(2);
    expect(out.semiGroup).toHaveLength(2);
    expect(out.dual).toHaveLength(1);
    expect(out.needsReview).toHaveLength(1); // Melody Swim
    expect(out.unknown).toHaveLength(2); // play date + absent client
  });

  it("loses nothing — every event lands in exactly one bucket", () => {
    const events = [ev("Luke Alexander"), ev("Semi Group"), ev("???"), ev("Melody Swim")];
    const out = classifyAll(events, clients);
    const total =
      out.exact.length + out.needsReview.length + out.semiGroup.length +
      out.dual.length + out.unknown.length;
    expect(total).toBe(events.length);
  });
});
