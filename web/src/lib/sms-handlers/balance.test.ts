import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/twilio", () => ({ sendSMS: vi.fn() }));
vi.mock("@/lib/logger", () => ({ syslog: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/package-accounting", () => ({ getPackageBalance: vi.fn() }));

import { isBalanceInquiry } from "./balance";

describe("isBalanceInquiry", () => {
  it("matches 'how many sessions do I have left'", () => {
    expect(isBalanceInquiry("how many sessions do i have left?")).toBe(true);
  });

  it("matches 'sessions remaining'", () => {
    expect(isBalanceInquiry("how many sessions remaining")).toBe(true);
  });

  it("matches 'package balance'", () => {
    expect(isBalanceInquiry("what's my package balance?")).toBe(true);
  });

  it("matches 'sessions do i have'", () => {
    expect(isBalanceInquiry("how many sessions do i have")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(isBalanceInquiry("yes sounds good")).toBe(false);
  });

  it("does not match partial keywords", () => {
    expect(isBalanceInquiry("session")).toBe(false);
  });
});
