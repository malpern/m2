import { describe, it, expect, beforeEach } from "vitest";
import { rateLimitMap, isRateLimited } from "./rate-limit";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

describe("rate limiter", () => {
  beforeEach(() => {
    rateLimitMap.clear();
  });

  it("allows up to 20 requests in a window", () => {
    const ip = "192.168.1.1";
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect(isRateLimited(ip)).toBe(false);
    }
  });

  it("blocks the 21st request within the window", () => {
    const ip = "192.168.1.2";
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      isRateLimited(ip);
    }
    expect(isRateLimited(ip)).toBe(true);
  });

  it("tracks keys independently", () => {
    const ipA = "10.0.0.1";
    const ipB = "10.0.0.2";
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      isRateLimited(ipA);
    }
    expect(isRateLimited(ipA)).toBe(true);
    expect(isRateLimited(ipB)).toBe(false);
  });

  it("allows requests again after old timestamps expire", () => {
    const ip = "172.16.0.1";
    // Seed with timestamps older than the window
    const old = Date.now() - RATE_LIMIT_WINDOW_MS - 1000;
    rateLimitMap.set(ip, Array.from({ length: RATE_LIMIT_MAX }, () => old));

    // Old entries should be pruned, so new request is allowed
    expect(isRateLimited(ip)).toBe(false);
  });

  it("prunes old entries on each call", () => {
    const ip = "172.16.0.2";
    const old = Date.now() - RATE_LIMIT_WINDOW_MS - 1;
    rateLimitMap.set(ip, Array.from({ length: RATE_LIMIT_MAX }, () => old));

    // First call prunes and allows
    isRateLimited(ip);

    // Only 1 recent entry now
    const stored = rateLimitMap.get(ip)!;
    expect(stored.length).toBe(1);
  });
});
