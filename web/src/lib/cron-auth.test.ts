import { describe, it, expect, beforeEach, vi } from "vitest";
import { isCronAuthorized } from "./cron-auth";

function reqWith(authHeader?: string) {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "authorization" ? authHeader ?? null : null,
    },
  };
}

describe("isCronAuthorized", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects when CRON_SECRET is unset, even with 'Bearer undefined'", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isCronAuthorized(reqWith("Bearer undefined"))).toBe(false);
    expect(isCronAuthorized(reqWith(undefined))).toBe(false);
  });

  it("rejects a missing or wrong header when secret is set", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isCronAuthorized(reqWith(undefined))).toBe(false);
    expect(isCronAuthorized(reqWith("Bearer wrong"))).toBe(false);
    expect(isCronAuthorized(reqWith("s3cret"))).toBe(false);
  });

  it("accepts the correct Bearer secret", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isCronAuthorized(reqWith("Bearer s3cret"))).toBe(true);
  });
});
