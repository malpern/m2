import { describe, it, expect } from "vitest";
import {
  resolveSessionRate,
  calculateRevenue,
  formatCentsAsDollars,
  type CompletedSessionWithRate,
} from "./revenue";

describe("resolveSessionRate", () => {
  it("prefers client sessionRate when both are set", () => {
    expect(resolveSessionRate(8000, 7500)).toBe(8000);
  });

  it("falls back to package pricePerSession when client rate is null", () => {
    expect(resolveSessionRate(null, 7500)).toBe(7500);
  });

  it("falls back to package pricePerSession when client rate is 0", () => {
    expect(resolveSessionRate(0, 7500)).toBe(7500);
  });

  it("returns null when neither rate is set", () => {
    expect(resolveSessionRate(null, null)).toBeNull();
  });

  it("returns null when both rates are 0", () => {
    expect(resolveSessionRate(0, 0)).toBeNull();
  });
});

describe("formatCentsAsDollars", () => {
  it("formats round dollar amounts", () => {
    expect(formatCentsAsDollars(10000)).toBe("$100");
  });

  it("formats zero", () => {
    expect(formatCentsAsDollars(0)).toBe("$0");
  });

  it("formats large amounts with comma separators", () => {
    const result = formatCentsAsDollars(125000);
    // "$1,250" — locale formatting
    expect(result).toContain("1");
    expect(result).toContain("250");
    expect(result).toContain("$");
  });
});

describe("calculateRevenue", () => {
  const makeSession = (
    overrides: Partial<CompletedSessionWithRate> & { sessionId: number },
  ): CompletedSessionWithRate => ({
    clientId: 1,
    clientSessionRate: null,
    packagePricePerSession: null,
    scheduledDate: "2026-05-15",
    ...overrides,
  });

  it("returns zeroes for an empty list", () => {
    const result = calculateRevenue([]);
    expect(result.totalRevenueCents).toBe(0);
    expect(result.sessionsWithRate).toBe(0);
    expect(result.totalCompletedSessions).toBe(0);
    expect(result.weeklyAvgRevenueCents).toBe(0);
  });

  it("computes total revenue from client rates", () => {
    const sessions = [
      makeSession({ sessionId: 1, clientSessionRate: 8000, scheduledDate: "2026-05-12" }),
      makeSession({ sessionId: 2, clientSessionRate: 8000, scheduledDate: "2026-05-13" }),
    ];
    const result = calculateRevenue(sessions);
    expect(result.totalRevenueCents).toBe(16000);
    expect(result.sessionsWithRate).toBe(2);
    expect(result.totalCompletedSessions).toBe(2);
  });

  it("skips sessions without rates", () => {
    const sessions = [
      makeSession({ sessionId: 1, clientSessionRate: 8000, scheduledDate: "2026-05-12" }),
      makeSession({ sessionId: 2, scheduledDate: "2026-05-13" }), // no rate
    ];
    const result = calculateRevenue(sessions);
    expect(result.totalRevenueCents).toBe(8000);
    expect(result.sessionsWithRate).toBe(1);
    expect(result.totalCompletedSessions).toBe(2);
  });

  it("uses package rate as fallback", () => {
    const sessions = [
      makeSession({
        sessionId: 1,
        clientSessionRate: null,
        packagePricePerSession: 7500,
        scheduledDate: "2026-05-12",
      }),
    ];
    const result = calculateRevenue(sessions);
    expect(result.totalRevenueCents).toBe(7500);
    expect(result.sessionsWithRate).toBe(1);
  });

  it("prefers client rate over package rate", () => {
    const sessions = [
      makeSession({
        sessionId: 1,
        clientSessionRate: 8000,
        packagePricePerSession: 7500,
        scheduledDate: "2026-05-12",
      }),
    ];
    const result = calculateRevenue(sessions);
    expect(result.totalRevenueCents).toBe(8000);
  });

  it("computes weekly average across distinct weeks", () => {
    const sessions = [
      // Week of 2026-05-11 (Mon)
      makeSession({ sessionId: 1, clientSessionRate: 8000, scheduledDate: "2026-05-12" }),
      makeSession({ sessionId: 2, clientSessionRate: 8000, scheduledDate: "2026-05-14" }),
      // Week of 2026-05-18 (Mon)
      makeSession({ sessionId: 3, clientSessionRate: 8000, scheduledDate: "2026-05-19" }),
    ];
    const result = calculateRevenue(sessions);
    // Total: 24000 cents over 2 weeks = 12000 per week
    expect(result.totalRevenueCents).toBe(24000);
    expect(result.weeklyAvgRevenueCents).toBe(12000);
  });

  it("provides display strings", () => {
    const sessions = [
      makeSession({ sessionId: 1, clientSessionRate: 8000, scheduledDate: "2026-05-12" }),
    ];
    const result = calculateRevenue(sessions);
    expect(result.totalRevenueDisplay).toContain("$");
    expect(result.totalRevenueDisplay).toContain("80");
    expect(result.weeklyAvgRevenueDisplay).toContain("$");
  });
});
