import { describe, it, expect } from "vitest";
import { needsRenewal, buildRenewalMessage, RENEWAL_THRESHOLD } from "./package-renewal";

const balance = (remaining: number) => ({ remaining, total: 10, used: 10 - remaining });

describe("needsRenewal", () => {
  it("prompts at or below the threshold", () => {
    expect(needsRenewal(balance(RENEWAL_THRESHOLD))).toBe(true);
    expect(needsRenewal(balance(RENEWAL_THRESHOLD - 1))).toBe(true);
  });

  it("stays quiet above the threshold", () => {
    expect(needsRenewal(balance(RENEWAL_THRESHOLD + 1))).toBe(false);
    expect(needsRenewal(balance(10))).toBe(false);
  });

  it("still prompts at zero — that is the most urgent case, not a finished one", () => {
    expect(needsRenewal(balance(0))).toBe(true);
  });

  it("prompts on an over-drawn package", () => {
    // manualAdjustment permits a negative balance; it should not read as "fine".
    expect(needsRenewal(balance(-1))).toBe(true);
  });

  it("does not prompt when the client has no package at all", () => {
    // Nothing to renew, and a CTA here would be nonsense rather than useful.
    expect(needsRenewal(null)).toBe(false);
  });
});

describe("buildRenewalMessage", () => {
  it("uses the first name only", () => {
    expect(buildRenewalMessage("Reggie Jackson", 2)).toContain("Hey Reggie,");
    expect(buildRenewalMessage("Reggie Jackson", 2)).not.toContain("Jackson");
  });

  it("pluralises correctly", () => {
    expect(buildRenewalMessage("Reggie Jackson", 2)).toContain("2 sessions left");
    expect(buildRenewalMessage("Reggie Jackson", 1)).toContain("1 session left");
    expect(buildRenewalMessage("Reggie Jackson", 1)).not.toContain("1 sessions");
  });

  it("does not say 'you've got 0 sessions left'", () => {
    const msg = buildRenewalMessage("Reggie Jackson", 0);
    expect(msg).toBe("Hey Reggie, you're out of sessions on your package. Want to re-up?");
    expect(msg).not.toContain("0 sessions");
  });

  it("reads sensibly for an over-drawn package", () => {
    expect(buildRenewalMessage("Reggie Jackson", -2)).toBe(
      "Hey Reggie, you're out of sessions on your package. Want to re-up?",
    );
  });

  it("copes with a single-word name", () => {
    expect(buildRenewalMessage("Cher", 3)).toContain("Hey Cher,");
  });

  it("copes with stray whitespace rather than greeting nobody", () => {
    expect(buildRenewalMessage("  Reggie  Jackson  ", 3)).toContain("Hey Reggie,");
  });
});
