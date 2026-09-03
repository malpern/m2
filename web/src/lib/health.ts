/**
 * What "is m2 healthy?" means, as data.
 *
 * The app already had logging (`system_logs`) and reactive alerting
 * (`checkAndAlert`), but both only fire when something *does* something wrong.
 * Nothing detected absence: a cron that stopped running, a Google token that
 * expired, an env var that was never set. The Google refresh token was dead
 * from June until 2026-08-29 and the app reported itself fine the whole time,
 * because `isConnected()` checked that a row existed rather than that the
 * credential worked.
 *
 * This module is the positive statement — each subsystem is asked to prove it
 * works, and anything that cannot prove it is degraded, not silently fine.
 *
 * The scoring is pure so it can be tested exhaustively; the IO lives in
 * app/api/health/route.ts, which is responsible for making sure a hanging
 * dependency times out rather than hanging the probe.
 */

import { parseSqlTimestamp } from "./sql-time";

export type CheckStatus = "ok" | "warn" | "fail";

export type HealthCheck = {
  /** Stable machine-readable id — the watchdog greps for these. */
  name: string;
  status: CheckStatus;
  /** Human-readable, safe to put in a push notification. */
  detail: string;
};

export type OverallStatus = "ok" | "degraded" | "down";

export type HealthReport = {
  status: OverallStatus;
  checks: HealthCheck[];
  checkedAt: string;
};

/**
 * Any `fail` means down; any `warn` means degraded.
 *
 * An empty check list is `down`, not `ok`. A probe that ran nothing has not
 * established that anything works, and reporting that as healthy is exactly
 * the class of green-status bug this module exists to end.
 */
export function summarize(checks: HealthCheck[]): OverallStatus {
  if (checks.length === 0) return "down";
  if (checks.some((c) => c.status === "fail")) return "down";
  if (checks.some((c) => c.status === "warn")) return "degraded";
  return "ok";
}

export function buildReport(checks: HealthCheck[], now: Date): HealthReport {
  return { status: summarize(checks), checks, checkedAt: now.toISOString() };
}

/**
 * Env vars the app cannot function without, vs ones that only disable a
 * feature. A missing APP_PASSWORD means every page 503s; a missing
 * TWILIO_AUTH_TOKEN means texting is off, which during testing is normal.
 */
export const REQUIRED_ENV = [
  "APP_PASSWORD",
  "TURSO_DATABASE_URL",
  "CRON_SECRET",
] as const;

/**
 * TURSO_AUTH_TOKEN is required only for a REMOTE database.
 *
 * libSQL accepts `file:` URLs, which is how local development and the test
 * suite run, and those need no token. Demanding it unconditionally would have
 * reported every local and preview environment as "down" — an alert that cries
 * wolf in the one setting where people are most likely to be watching it.
 */
export function needsAuthToken(databaseUrl: string | undefined): boolean {
  return !!databaseUrl?.trim() && !databaseUrl.trim().toLowerCase().startsWith("file:");
}

export const FEATURE_ENV = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "ANTHROPIC_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

export function checkEnv(env: Record<string, string | undefined>): HealthCheck {
  const required: string[] = [...REQUIRED_ENV];
  if (needsAuthToken(env.TURSO_DATABASE_URL)) required.push("TURSO_AUTH_TOKEN");

  const missingRequired = required.filter((k) => !env[k]?.trim());
  if (missingRequired.length > 0) {
    return {
      name: "env",
      status: "fail",
      detail: `Missing required config: ${missingRequired.join(", ")}`,
    };
  }
  const missingFeature = FEATURE_ENV.filter((k) => !env[k]?.trim());
  if (missingFeature.length > 0) {
    return {
      name: "env",
      status: "warn",
      detail: `Set, but features disabled by: ${missingFeature.join(", ")}`,
    };
  }
  return { name: "env", status: "ok", detail: "All expected config present" };
}

/**
 * Cron freshness, measured from the unconditional heartbeat each cron writes
 * at the end of a run.
 *
 * The heartbeat had to be added: the routes only logged per-item, so a day
 * with no sessions to remind about wrote nothing at all, and "ran fine, no
 * work to do" was indistinguishable from "has not run since June".
 *
 * Vercel's hobby plan invokes daily crons roughly, not punctually, so the
 * threshold is generous — this is meant to catch "stopped", not "late".
 */
export const CRON_STALE_AFTER_HOURS = 36;

export function checkCronFreshness(
  lastRunISO: string | null | undefined,
  now: Date,
  staleAfterHours: number = CRON_STALE_AFTER_HOURS,
): HealthCheck {
  if (!lastRunISO) {
    return {
      name: "cron",
      status: "warn",
      detail: "No cron run recorded yet — expected within the first day of deploying",
    };
  }
  // SQLite writes a naive UTC timestamp; Date.parse would read it as LOCAL and
  // put it in the future, making a stale heartbeat look fresh.
  const then = parseSqlTimestamp(lastRunISO);
  if (then === null) {
    return { name: "cron", status: "warn", detail: `Unreadable cron timestamp: ${lastRunISO}` };
  }
  const ageHours = (now.getTime() - then) / 3_600_000;
  if (ageHours > staleAfterHours) {
    return {
      name: "cron",
      status: "fail",
      detail: `No cron has run for ${Math.floor(ageHours)}h (expected at least every ${staleAfterHours}h)`,
    };
  }
  return { name: "cron", status: "ok", detail: `Last cron ran ${Math.floor(ageHours)}h ago` };
}

/**
 * Recent error volume. Distinct from `checkAndAlert`, which reacts to errors
 * as they happen — this reports the standing level so a watchdog polling every
 * ten minutes sees a problem that started while nobody was looking.
 */
export function checkErrorRate(
  errorsLastHour: number,
  warnAt = 1,
  failAt = 10,
): HealthCheck {
  if (errorsLastHour >= failAt) {
    return { name: "errors", status: "fail", detail: `${errorsLastHour} errors in the last hour` };
  }
  if (errorsLastHour >= warnAt) {
    return { name: "errors", status: "warn", detail: `${errorsLastHour} errors in the last hour` };
  }
  return { name: "errors", status: "ok", detail: "No errors in the last hour" };
}

/**
 * Google Calendar, from the result of a *validating* connection check.
 *
 * `warn` rather than `fail` on purpose: m2 still schedules, texts and tracks
 * packages with the calendar disconnected. It is a degraded app, not a dead
 * one, and paging at 3am for it would train the alert to be ignored.
 */
export function checkGoogle(result: { connected: boolean; email?: string; reason?: string }): HealthCheck {
  if (!result.connected) {
    return {
      name: "google_calendar",
      status: "warn",
      detail: result.reason ?? "Google Calendar is not connected",
    };
  }
  return {
    name: "google_calendar",
    status: "ok",
    detail: `Connected as ${result.email ?? "unknown account"}`,
  };
}

/** Outreach posture — informational, never unhealthy. Both states are valid. */
export function checkOutreach(live: boolean, clientsWithPhone: number): HealthCheck {
  return {
    name: "outreach",
    status: "ok",
    detail: live
      ? `LIVE — texting ${clientsWithPhone} clients with a number on file`
      : `Testing mode — only allowlisted recipients receive anything (${clientsWithPhone} clients have a number)`,
  };
}

/** A check that threw. Never let a probe failure masquerade as health. */
export function failedCheck(name: string, error: unknown): HealthCheck {
  const message = error instanceof Error ? error.message : String(error);
  return { name, status: "fail", detail: `Check itself failed: ${message}` };
}

/**
 * The result of actually calling a third-party API with our stored credential.
 *
 * `checkEnv` above only proves a variable is *present*. That is the same
 * mistake `isConnected()` made for Google — it confirmed a row existed while
 * the token behind it had been dead since June. Presence is not validity, and
 * for the services m2 depends on to do its job, only an authenticated round
 * trip settles the question.
 */
export type CredentialProbe =
  | { ok: true; detail?: string }
  | { ok: false; status?: number; reason: string };

/**
 * Twilio. Severity depends on whether outreach is live, because the same dead
 * credential means different things: while testing it is a latent problem, and
 * once outreach is on it means every message silently fails to send.
 */
export function checkTwilio(probe: CredentialProbe, outreachLive: boolean): HealthCheck {
  if (probe.ok) {
    return { name: "twilio", status: "ok", detail: probe.detail ?? "Credentials valid" };
  }
  const code = probe.status ? ` (HTTP ${probe.status})` : "";
  return {
    name: "twilio",
    status: outreachLive ? "fail" : "warn",
    detail: outreachLive
      ? `Twilio rejected our credentials${code} — outreach is LIVE, so messages are not being delivered: ${probe.reason}`
      : `Twilio rejected our credentials${code} — harmless while outreach is off, but sending would fail today: ${probe.reason}`,
  };
}

/**
 * Anthropic. Always a warning, never a failure: reply classification degrades
 * to needing Matt's attention, which is inconvenient rather than broken.
 */
export function checkAnthropic(probe: CredentialProbe): HealthCheck {
  if (probe.ok) {
    return { name: "anthropic", status: "ok", detail: probe.detail ?? "Credentials valid" };
  }
  const code = probe.status ? ` (HTTP ${probe.status})` : "";
  return {
    name: "anthropic",
    status: "warn",
    detail: `Anthropic rejected our key${code} — replies will not be classified automatically: ${probe.reason}`,
  };
}

/** A credential that was never configured. Distinct from one that is rejected. */
export function unconfigured(name: string, consequence: string): HealthCheck {
  return { name, status: "warn", detail: `Not configured — ${consequence}` };
}
