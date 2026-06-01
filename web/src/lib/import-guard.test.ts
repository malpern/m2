import { describe, it, expect } from "vitest";
import { canReplace, hasExistingData, type DeletionCounts } from "./import-guard";

const EMPTY: DeletionCounts = { clients: 0, sessions: 0, packages: 0, outreach: 0 };
const WITH_DATA: DeletionCounts = { clients: 12, sessions: 80, packages: 12, outreach: 30 };

describe("hasExistingData", () => {
  it("is false for a fresh/empty database", () => {
    expect(hasExistingData(EMPTY)).toBe(false);
  });

  it("is true if any tracked table has rows", () => {
    expect(hasExistingData({ ...EMPTY, sessions: 1 })).toBe(true);
    expect(hasExistingData(WITH_DATA)).toBe(true);
  });
});

describe("canReplace", () => {
  it("blocks destructive replacement of real data without explicit confirmation", () => {
    expect(canReplace(undefined, WITH_DATA)).toBe(false);
    expect(canReplace(false, WITH_DATA)).toBe(false);
  });

  it("allows replacement when the operator explicitly confirmed", () => {
    expect(canReplace(true, WITH_DATA)).toBe(true);
  });

  it("allows the first import into an empty database without confirmation", () => {
    expect(canReplace(undefined, EMPTY)).toBe(true);
  });
});
