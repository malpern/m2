import { isCronAuthorized } from "@/lib/cron-auth";
import { db } from "@/db";
import { clients, systemLogs } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { isConnected } from "@/lib/google-calendar";
import { isOutreachLive } from "@/lib/outreach-policy";
import { lastCronRunAt } from "@/lib/cron-heartbeat";
import { toSqlTimestamp } from "@/lib/sql-time";
import {
  buildReport, checkEnv, checkCronFreshness, checkErrorRate, checkGoogle,
  checkOutreach, failedCheck, type HealthCheck,
} from "@/lib/health";

/**
 * The endpoint the external watchdog asks "are you actually working?".
 *
 * Authenticated with CRON_SECRET rather than the app password, for the same
 * reason the cron routes are: the watchdog runs unattended on the mini and
 * must not hold a session cookie. It fails closed — no secret, no answer.
 *
 * Two design rules, both learned from the failures this replaces:
 *
 *  - **Every check is isolated and time-limited.** One hanging dependency must
 *    not hang the probe, or the watchdog's own timeout becomes the only signal
 *    and it cannot say what broke.
 *  - **A check that throws is a FAILED check, never a missing one.** The whole
 *    class of bug here is a green status that reported the presence of a
 *    record rather than a working thing.
 */

export const dynamic = "force-dynamic";

const CHECK_TIMEOUT_MS = 5_000;

async function withTimeout<T>(ms: number, work: () => Promise<T>): Promise<T> {
  return await Promise.race([
    work(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/** Run a probe, converting any throw or timeout into a `fail` check. */
async function probe(name: string, work: () => Promise<HealthCheck>): Promise<HealthCheck> {
  try {
    return await withTimeout(CHECK_TIMEOUT_MS, work);
  } catch (e) {
    return failedCheck(name, e);
  }
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();

  // The database check doubles as the source for two others, so it runs first
  // and its result is reused rather than querying three times.
  let clientsWithPhone = 0;
  const databaseCheck = await probe("database", async () => {
    const row = await db
      .select({
        total: sql<number>`count(*)`,
        withPhone: sql<number>`sum(case when ${clients.phone} is not null then 1 else 0 end)`,
      })
      .from(clients)
      .get();
    clientsWithPhone = Number(row?.withPhone ?? 0);
    return {
      name: "database",
      status: "ok" as const,
      detail: `Reachable — ${Number(row?.total ?? 0)} clients, ${clientsWithPhone} with a phone number`,
    };
  });

  const [googleCheck, cronCheck, errorCheck] = await Promise.all([
    probe("google_calendar", async () => checkGoogle(await isConnected())),
    probe("cron", async () => checkCronFreshness(await lastCronRunAt(), now)),
    probe("errors", async () => {
      const oneHourAgo = toSqlTimestamp(new Date(now.getTime() - 3_600_000));
      const rows = await db
        .select({ n: sql<number>`count(*)` })
        .from(systemLogs)
        .where(and(eq(systemLogs.severity, "error"), gte(systemLogs.createdAt, oneHourAgo)))
        .get();
      return checkErrorRate(Number(rows?.n ?? 0));
    }),
  ]);

  const checks: HealthCheck[] = [
    checkEnv(process.env),
    databaseCheck,
    googleCheck,
    cronCheck,
    errorCheck,
    checkOutreach(isOutreachLive(), clientsWithPhone),
  ];

  const report = buildReport(checks, now);

  // 200 for ok/degraded, 503 for down — so a dumb HTTP check still notices,
  // while a degraded-but-serving app does not read as an outage.
  return Response.json(report, {
    status: report.status === "down" ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
}
