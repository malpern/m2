import { describe, it, expect } from "vitest";
import { generateWeek, getMonday, type ProposedSession } from "./scheduler";
import type { Client } from "@/db/schema";

function makeClient(overrides: Partial<Client> & { id: number; name: string }): Client {
  return {
    phone: "+1555",
    category: "active",
    gradeLevel: "junior",
    collegeBound: false,
    behaviorScore: 5,
    preferredDays: null,
    preferredTime: null,
    maxSessionsPerWeek: 1,
    standingSlot: null,
    sortOrder: null,
    notes: null,
    googleSheetsName: null,
    sessionRate: null,
    sessionType: null,
    parentGuardian: null,
    email: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

const MONDAY = new Date(2026, 4, 25);

describe("generateWeek", () => {
  it("schedules one session per client", () => {
    const clients = [
      makeClient({ id: 1, name: "A", preferredDays: '["monday"]', preferredTime: "3pm" }),
      makeClient({ id: 2, name: "B", preferredDays: '["monday"]', preferredTime: "5pm" }),
    ];

    const result = generateWeek(clients, MONDAY);
    expect(result).toHaveLength(2);
    expect(result.find((s) => s.clientId === 1)?.slot).toBe("3pm");
    expect(result.find((s) => s.clientId === 2)?.slot).toBe("5pm");
  });

  it("skips non-schedulable clients", () => {
    const clients = [
      makeClient({ id: 1, name: "Active", category: "active" }),
      makeClient({ id: 2, name: "OnBreak", category: "on_break" }),
      makeClient({ id: 3, name: "Vacation", category: "vacation" }),
    ];

    const result = generateWeek(clients, MONDAY);
    expect(result).toHaveLength(1);
    expect(result[0].clientName).toBe("Active");
  });

  it("fills 3pm before 5pm before 6pm when cascading", () => {
    const clients = [
      makeClient({ id: 1, name: "A", preferredDays: '["monday"]', preferredTime: "3pm" }),
      makeClient({ id: 2, name: "B", preferredDays: '["monday"]', preferredTime: "3pm" }),
      makeClient({ id: 3, name: "C", preferredDays: '["monday"]', preferredTime: "3pm" }),
    ];

    const result = generateWeek(clients, MONDAY);
    const mondaySlots = result.filter((s) => s.day === "monday").map((s) => s.slot);
    expect(mondaySlots).toContain("3pm");
    expect(mondaySlots).toContain("5pm");
    expect(mondaySlots).toContain("6pm");
  });

  it("gives college-bound athletes 2 sessions when max allows", () => {
    const clients = [
      makeClient({
        id: 1,
        name: "CollegeStar",
        collegeBound: true,
        maxSessionsPerWeek: 2,
        preferredDays: '["monday","wednesday"]',
        preferredTime: "3pm",
      }),
    ];

    const result = generateWeek(clients, MONDAY);
    expect(result).toHaveLength(2);
    const days = result.map((s) => s.day);
    expect(days).toContain("monday");
    expect(days).toContain("wednesday");
  });

  it("does not give non-college-bound athletes 2 sessions", () => {
    const clients = [
      makeClient({
        id: 1,
        name: "RegularAthlete",
        collegeBound: false,
        maxSessionsPerWeek: 2,
        preferredDays: '["monday","wednesday"]',
        preferredTime: "3pm",
      }),
    ];

    const result = generateWeek(clients, MONDAY);
    expect(result).toHaveLength(1);
  });

  it("assigns correct dates for the week", () => {
    const clients = [
      makeClient({ id: 1, name: "A", preferredDays: '["monday"]', preferredTime: "3pm" }),
      makeClient({ id: 2, name: "B", preferredDays: '["friday"]', preferredTime: "5pm" }),
    ];

    const result = generateWeek(clients, MONDAY);
    expect(result.find((s) => s.day === "monday")?.date).toBe("2026-05-25");
    expect(result.find((s) => s.day === "friday")?.date).toBe("2026-05-29");
  });

  it("never schedules on Saturday", () => {
    const manyClients = Array.from({ length: 20 }, (_, i) =>
      makeClient({ id: i + 1, name: `Client${i}`, preferredTime: "3pm" })
    );

    const result = generateWeek(manyClients, MONDAY);
    const days = result.map((s) => s.day);
    expect(days).not.toContain("saturday");
  });

  it("handles empty client list", () => {
    expect(generateWeek([], MONDAY)).toEqual([]);
  });

  it("respects priority order for contested slots", () => {
    const clients = [
      makeClient({
        id: 1,
        name: "LowPriority",
        collegeBound: false,
        gradeLevel: "freshman",
        behaviorScore: 3,
        preferredDays: '["monday"]',
        preferredTime: "3pm",
      }),
      makeClient({
        id: 2,
        name: "HighPriority",
        collegeBound: true,
        gradeLevel: "senior",
        behaviorScore: 9,
        preferredDays: '["monday"]',
        preferredTime: "3pm",
      }),
    ];

    const result = generateWeek(clients, MONDAY);
    const monday3pm = result.find((s) => s.day === "monday" && s.slot === "3pm");
    expect(monday3pm?.clientName).toBe("HighPriority");
  });
});

describe("standing slots", () => {
  it("auto-fills standing slots before priority algorithm", () => {
    const clients = [
      makeClient({
        id: 1,
        name: "StandingClient",
        standingSlot: "Mon 3pm, Wed 3pm",
        maxSessionsPerWeek: 2,
      }),
      makeClient({
        id: 2,
        name: "RegularClient",
        preferredDays: '["monday"]',
        preferredTime: "3pm",
      }),
    ];

    const result = generateWeek(clients, MONDAY);
    const mon3pm = result.find((s) => s.day === "monday" && s.slot === "3pm");
    expect(mon3pm?.clientName).toBe("StandingClient");
    const wed3pm = result.find((s) => s.day === "wednesday" && s.slot === "3pm");
    expect(wed3pm?.clientName).toBe("StandingClient");
  });

  it("skips additional scheduling if standing slots fill the max", () => {
    const clients = [
      makeClient({
        id: 1,
        name: "FullyBooked",
        standingSlot: "Mon 3pm",
        maxSessionsPerWeek: 1,
      }),
    ];

    const result = generateWeek(clients, MONDAY);
    const sessions = result.filter((s) => s.clientId === 1);
    expect(sessions).toHaveLength(1);
  });

  it("parses various standing slot formats", () => {
    const clients = [
      makeClient({
        id: 1,
        name: "FlexFormat",
        standingSlot: "Tue 5pm; Thu 3pm",
        maxSessionsPerWeek: 2,
      }),
    ];

    const result = generateWeek(clients, MONDAY);
    expect(result.find((s) => s.day === "tuesday" && s.slot === "5pm")).toBeTruthy();
    expect(result.find((s) => s.day === "thursday" && s.slot === "3pm")).toBeTruthy();
  });
});

describe("generateWeek with custom weights", () => {
  it("respects custom weights for priority order", () => {
    const highEffortWeights = {
      collegeBoundWeight: 1,
      gradeLevelWeight: 1,
      effortWeight: 5,
    };
    const clients = [
      makeClient({
        id: 1,
        name: "CollegeLowEffort",
        collegeBound: true,
        gradeLevel: "senior",
        behaviorScore: 2,
        preferredDays: '["monday"]',
        preferredTime: "3pm",
      }),
      makeClient({
        id: 2,
        name: "NoCollegeHighEffort",
        collegeBound: false,
        gradeLevel: "freshman",
        behaviorScore: 10,
        preferredDays: '["monday"]',
        preferredTime: "3pm",
      }),
    ];

    const result = generateWeek(clients, MONDAY, highEffortWeights);
    const mon3pm = result.find((s) => s.day === "monday" && s.slot === "3pm");
    expect(mon3pm?.clientName).toBe("NoCollegeHighEffort");
  });

  it("uses default priority when no weights provided", () => {
    const clients = [
      makeClient({
        id: 1,
        name: "College",
        collegeBound: true,
        preferredDays: '["monday"]',
        preferredTime: "3pm",
      }),
      makeClient({
        id: 2,
        name: "NotCollege",
        collegeBound: false,
        behaviorScore: 10,
        preferredDays: '["monday"]',
        preferredTime: "3pm",
      }),
    ];

    const result = generateWeek(clients, MONDAY);
    const mon3pm = result.find((s) => s.day === "monday" && s.slot === "3pm");
    expect(mon3pm?.clientName).toBe("College");
  });
});

describe("getMonday", () => {
  it("returns Monday for a Wednesday", () => {
    const wed = new Date(2026, 4, 27); // Wednesday
    const monday = getMonday(wed);
    expect(monday.toISOString().split("T")[0]).toBe("2026-05-25");
  });

  it("returns same day for a Monday", () => {
    const mon = new Date(2026, 4, 25);
    const monday = getMonday(mon);
    expect(monday.toISOString().split("T")[0]).toBe("2026-05-25");
  });

  it("returns previous Monday for a Sunday", () => {
    const sun = new Date(2026, 4, 31);
    const monday = getMonday(sun);
    expect(monday.toISOString().split("T")[0]).toBe("2026-05-25");
  });
});
