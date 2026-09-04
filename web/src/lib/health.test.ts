import { describe, it, expect } from "vitest";
import {
  summarize, buildReport, checkEnv, checkCronFreshness, checkErrorRate,
  checkGoogle, checkOutreach, checkTwilio, checkAnthropic, unconfigured,
  failedCheck, needsAuthToken, REQUIRED_ENV, FEATURE_ENV,
} from "./health";

const ok = (name: string) => ({ name, status: "ok" as const, detail: "" });
const warn = (name: string) => ({ name, status: "warn" as const, detail: "" });
const fail = (name: string) => ({ name, status: "fail" as const, detail: "" });

describe("summarize", () => {
  it("is ok only when everything is ok", () => {
    expect(summarize([ok("a"), ok("b")])).toBe("ok");
  });

  it("is degraded on any warn", () => {
    expect(summarize([ok("a"), warn("b")])).toBe("degraded");
  });

  it("is down on any fail, even alongside warns", () => {
    expect(summarize([ok("a"), warn("b"), fail("c")])).toBe("down");
  });

  it("treats an empty check list as DOWN, not healthy", () => {
    // A probe that ran nothing has proved nothing. Reporting that as ok is the
    // exact bug this module exists to prevent.
    expect(summarize([])).toBe("down");
  });
});

describe("buildReport", () => {
  it("stamps the time and carries the checks through", () => {
    const now = new Date("2026-08-30T12:00:00Z");
    const r = buildReport([ok("a")], now);
    expect(r).toEqual({ status: "ok", checks: [ok("a")], checkedAt: "2026-08-30T12:00:00.000Z" });
  });
});

describe("checkEnv", () => {
  const full: Record<string, string | undefined> = {
    ...Object.fromEntries([...REQUIRED_ENV, ...FEATURE_ENV].map((k) => [k, "set"])),
    TURSO_DATABASE_URL: "libsql://m2.turso.io",
    TURSO_AUTH_TOKEN: "set",
  };

  it("passes when everything is present", () => {
    expect(checkEnv(full).status).toBe("ok");
  });

  it("fails when a required var is missing, and names it", () => {
    const c = checkEnv({ ...full, APP_PASSWORD: undefined });
    expect(c.status).toBe("fail");
    expect(c.detail).toContain("APP_PASSWORD");
  });

  it("fails on a var that is present but blank", () => {
    // A Vercel var set to "" is a real and confusing failure mode.
    expect(checkEnv({ ...full, CRON_SECRET: "   " }).status).toBe("fail");
  });

  it("only warns when an optional feature var is missing", () => {
    const c = checkEnv({ ...full, TWILIO_AUTH_TOKEN: undefined });
    expect(c.status).toBe("warn");
    expect(c.detail).toContain("TWILIO_AUTH_TOKEN");
  });

  it("prefers reporting the required failure over the optional one", () => {
    const c = checkEnv({ ...full, APP_PASSWORD: undefined, TWILIO_AUTH_TOKEN: undefined });
    expect(c.status).toBe("fail");
  });

  it("requires TURSO_AUTH_TOKEN for a remote database", () => {
    const c = checkEnv({ ...full, TURSO_AUTH_TOKEN: undefined });
    expect(c.status).toBe("fail");
    expect(c.detail).toContain("TURSO_AUTH_TOKEN");
  });

  it("does NOT require TURSO_AUTH_TOKEN for a local file database", () => {
    // Local dev and the test suite run on a `file:` URL with no token. Demanding
    // one would report every local environment as down.
    const c = checkEnv({ ...full, TURSO_DATABASE_URL: "file:./m2-dev.db", TURSO_AUTH_TOKEN: undefined });
    expect(c.status).toBe("ok");
  });

  it("never leaks a value, only the name", () => {
    const c = checkEnv({ ...full, APP_PASSWORD: "hunter2" });
    expect(JSON.stringify(c)).not.toContain("hunter2");
  });
});

describe("checkCronFreshness", () => {
  const now = new Date("2026-08-30T12:00:00Z");

  it("reads SQLite's naive timestamp as UTC, not local time", () => {
    // The regression: Date.parse treats "2026-08-30 08:00:00" as LOCAL, so on a
    // PT machine it landed 7h in the FUTURE and reported a negative age —
    // meaning a genuinely stale heartbeat would have read as fresh.
    const c = checkCronFreshness("2026-08-30 08:00:00", now);
    expect(c.status).toBe("ok");
    expect(c.detail).toContain("4h ago");
    expect(c.detail).not.toContain("-");
  });

  it("still detects staleness given SQLite-shaped input", () => {
    expect(checkCronFreshness("2026-08-25 12:00:00", now).status).toBe("fail");
  });

  it("is ok for a recent run", () => {
    expect(checkCronFreshness("2026-08-30T08:00:00Z", now).status).toBe("ok");
  });

  it("fails once nothing has run for longer than the threshold", () => {
    const c = checkCronFreshness("2026-08-25T12:00:00Z", now);
    expect(c.status).toBe("fail");
    expect(c.detail).toContain("120h");
  });

  it("warns rather than fails when nothing has run YET", () => {
    // A freshly deployed app has no heartbeat and is not broken.
    expect(checkCronFreshness(null, now).status).toBe("warn");
  });

  it("warns on an unparseable timestamp instead of throwing", () => {
    expect(checkCronFreshness("not-a-date", now).status).toBe("warn");
  });

  it("does not fail a run that is merely late", () => {
    // Hobby-plan crons are invoked approximately, not punctually.
    expect(checkCronFreshness("2026-08-29T00:00:00Z", now).status).toBe("ok");
  });

  it("honours a caller-supplied threshold", () => {
    expect(checkCronFreshness("2026-08-30T08:00:00Z", now, 2).status).toBe("fail");
  });
});

describe("checkErrorRate", () => {
  it("is ok at zero", () => {
    expect(checkErrorRate(0).status).toBe("ok");
  });

  it("warns on a single error — one catastrophic error is still an incident", () => {
    // checkAndAlert needs 3-in-10min to say anything, so a once-a-day fatal
    // error (a dead Google token, a 401ing cron) alerted nobody.
    expect(checkErrorRate(1).status).toBe("warn");
  });

  it("fails at volume", () => {
    const c = checkErrorRate(25);
    expect(c.status).toBe("fail");
    expect(c.detail).toContain("25");
  });
});

describe("checkGoogle", () => {
  it("reports the connected account", () => {
    const c = checkGoogle({ connected: true, email: "malpern@gmail.com" });
    expect(c.status).toBe("ok");
    expect(c.detail).toContain("malpern@gmail.com");
  });

  it("degrades rather than fails when disconnected, and passes the reason through", () => {
    // The app still schedules and texts without a calendar; paging at 3am for
    // it would train the alert to be ignored.
    const c = checkGoogle({ connected: false, reason: "Stored credentials could not be refreshed" });
    expect(c.status).toBe("warn");
    expect(c.detail).toContain("could not be refreshed");
  });

  it("still says something useful with no reason given", () => {
    expect(checkGoogle({ connected: false }).detail).toBeTruthy();
  });
});

describe("checkOutreach", () => {
  it("is informational in both directions", () => {
    expect(checkOutreach(true, 40).status).toBe("ok");
    expect(checkOutreach(false, 1).status).toBe("ok");
  });

  it("says plainly which mode is in force", () => {
    expect(checkOutreach(true, 40).detail).toContain("LIVE");
    expect(checkOutreach(false, 1).detail).toContain("Testing mode");
  });
});

describe("failedCheck", () => {
  it("turns a thrown probe into a fail, not a missing check", () => {
    const c = failedCheck("database", new Error("connection refused"));
    expect(c).toMatchObject({ name: "database", status: "fail" });
    expect(c.detail).toContain("connection refused");
  });

  it("handles a non-Error throw", () => {
    expect(failedCheck("database", "boom").detail).toContain("boom");
  });
});

describe("needsAuthToken", () => {
  it("is true for a remote libsql URL", () => {
    expect(needsAuthToken("libsql://m2-scheduler.turso.io")).toBe(true);
    expect(needsAuthToken("https://m2.turso.io")).toBe(true);
  });

  it("is false for a local file URL, in any casing", () => {
    expect(needsAuthToken("file:./m2-dev.db")).toBe(false);
    expect(needsAuthToken("FILE:./m2-dev.db")).toBe(false);
    expect(needsAuthToken("  file:./m2-dev.db  ")).toBe(false);
  });

  it("is false when there is no URL at all — the missing URL is the error to report", () => {
    expect(needsAuthToken(undefined)).toBe(false);
    expect(needsAuthToken("")).toBe(false);
  });
});

describe("checkTwilio", () => {
  it("passes on a working credential and says which account", () => {
    const c = checkTwilio({ ok: true, detail: "Account reachable — M2 (active)" }, false);
    expect(c).toMatchObject({ name: "twilio", status: "ok" });
    expect(c.detail).toContain("M2");
  });

  it("only WARNS about a dead credential while outreach is off", () => {
    // Nothing is being sent, so it is a latent problem rather than an outage.
    const c = checkTwilio({ ok: false, status: 401, reason: "authentication rejected" }, false);
    expect(c.status).toBe("warn");
    expect(c.detail).toContain("401");
    expect(c.detail).toContain("outreach is off");
  });

  it("FAILS on a dead credential once outreach is live", () => {
    // The same credential now means every message silently fails to send —
    // exactly the class of thing this probe exists to catch.
    const c = checkTwilio({ ok: false, status: 401, reason: "authentication rejected" }, true);
    expect(c.status).toBe("fail");
    expect(c.detail).toContain("not being delivered");
  });

  it("reports a non-401 rejection too", () => {
    const c = checkTwilio({ ok: false, status: 503, reason: "Service Unavailable" }, true);
    expect(c.status).toBe("fail");
    expect(c.detail).toContain("503");
  });

  it("never puts the credential in the detail", () => {
    const c = checkTwilio({ ok: false, status: 401, reason: "authentication rejected" }, true);
    expect(JSON.stringify(c)).not.toMatch(/AC[0-9a-f]{32}/);
  });
});

describe("checkAnthropic", () => {
  it("passes on a working key", () => {
    expect(checkAnthropic({ ok: true }).status).toBe("ok");
  });

  it("only warns on a dead key — scheduling still works without it", () => {
    const c = checkAnthropic({ ok: false, status: 401, reason: "authentication rejected" });
    expect(c.status).toBe("warn");
    expect(c.detail).toContain("not be classified");
  });
});

describe("unconfigured", () => {
  it("distinguishes 'never set' from 'rejected'", () => {
    const c = unconfigured("twilio", "the app cannot text anyone");
    expect(c).toMatchObject({ name: "twilio", status: "warn" });
    expect(c.detail).toContain("Not configured");
  });
});

describe("the probes change the overall status correctly", () => {
  it("a dead Twilio while LIVE takes the whole report down", () => {
    const checks = [
      { name: "database", status: "ok" as const, detail: "" },
      checkTwilio({ ok: false, status: 401, reason: "rejected" }, true),
    ];
    expect(summarize(checks)).toBe("down");
  });

  it("a dead Twilio while testing only degrades it", () => {
    const checks = [
      { name: "database", status: "ok" as const, detail: "" },
      checkTwilio({ ok: false, status: 401, reason: "rejected" }, false),
    ];
    expect(summarize(checks)).toBe("degraded");
  });
});
