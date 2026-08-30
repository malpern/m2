import { describe, it, expect } from "vitest";
import { toSqlTimestamp, parseSqlTimestamp } from "./sql-time";

describe("toSqlTimestamp", () => {
  it("emits SQLite's CURRENT_TIMESTAMP shape, in UTC", () => {
    expect(toSqlTimestamp(new Date("2026-08-30T17:08:57.123Z"))).toBe("2026-08-30 17:08:57");
  });

  it("produces a value that compares correctly against a stored timestamp", () => {
    // The whole point. These are TEXT columns compared lexicographically, and
    // an ISO threshold ('T' = 0x54) always sorts above a stored value (' ' =
    // 0x20) on the same date — so `created_at >= isoThreshold` matched nothing.
    const stored = "2026-08-30 17:08:57";
    const tenMinutesEarlier = toSqlTimestamp(new Date("2026-08-30T16:58:57Z"));
    const isoThreshold = new Date("2026-08-30T16:58:57Z").toISOString();

    expect(stored >= tenMinutesEarlier).toBe(true);  // fixed
    expect(stored >= isoThreshold).toBe(false);      // the bug, preserved as a witness
  });

  it("orders chronologically as plain strings", () => {
    const a = toSqlTimestamp(new Date("2026-08-30T09:00:00Z"));
    const b = toSqlTimestamp(new Date("2026-08-30T17:00:00Z"));
    const c = toSqlTimestamp(new Date("2026-09-01T01:00:00Z"));
    expect([c, a, b].sort()).toEqual([a, b, c]);
  });
});

describe("parseSqlTimestamp", () => {
  it("reads a naive stored timestamp as UTC, not local time", () => {
    // Read as local on a PT box this lands 7h in the future, which made a
    // stale heartbeat look fresh — the one direction staleness must not fail.
    expect(parseSqlTimestamp("2026-08-30 17:08:57")).toBe(Date.parse("2026-08-30T17:08:57Z"));
  });

  it("never returns a future time for a timestamp written now", () => {
    const now = new Date();
    const parsed = parseSqlTimestamp(toSqlTimestamp(now));
    expect(parsed).not.toBeNull();
    expect(parsed! - now.getTime()).toBeLessThanOrEqual(0);
    expect(now.getTime() - parsed!).toBeLessThan(1000);
  });

  it("respects an explicit zone when one is present", () => {
    expect(parseSqlTimestamp("2026-08-30T17:08:57Z")).toBe(Date.parse("2026-08-30T17:08:57Z"));
    expect(parseSqlTimestamp("2026-08-30T10:08:57-07:00")).toBe(Date.parse("2026-08-30T17:08:57Z"));
    expect(parseSqlTimestamp("2026-08-30T17:08:57.123Z")).toBe(Date.parse("2026-08-30T17:08:57.123Z"));
  });

  it("returns null for absent or unparseable input rather than NaN", () => {
    for (const v of [null, undefined, "", "   ", "not-a-date"]) {
      expect(parseSqlTimestamp(v as string | null | undefined), String(v)).toBeNull();
    }
  });
});
