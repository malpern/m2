import { describe, it, expect } from "vitest";

/**
 * Vercel Cron sends GET. Every one of these routes was POST-only, so the
 * scheduled job answered 405 and never ran — silently, for as long as it had
 * been scheduled. This asserts the platform's verb stays supported.
 */
const JOBS = ["session-reminders", "daily-digest", "send-waves", "follow-ups"] as const;

describe("cron routes answer the verb Vercel actually sends", () => {
  for (const job of JOBS) {
    it(`${job} exports GET`, async () => {
      const mod = await import(`./${job}/route`);
      expect(typeof mod.GET).toBe("function");
    });

    it(`${job} still exports POST for manual runs`, async () => {
      const mod = await import(`./${job}/route`);
      expect(typeof mod.POST).toBe("function");
    });

    it(`${job} handles both verbs identically`, async () => {
      const mod = await import(`./${job}/route`);
      expect(mod.GET).toBe(mod.POST);
    });
  }
});
