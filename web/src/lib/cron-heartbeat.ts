import { db } from "@/db";
import { systemLogs } from "@/db/schema";
import { and, eq, like, desc } from "drizzle-orm";
import { syslog } from "./logger";

/**
 * Proof that a scheduled job ran.
 *
 * The cron routes logged per-item only — a reminder sent, a send that failed.
 * On a day with no sessions to remind about, `session-reminders` wrote nothing
 * at all, so "ran fine, nothing to do" and "has not run since June" produced
 * byte-identical evidence: silence. Absence of signal was invisible.
 *
 * Each route now records one unconditional heartbeat when it finishes, so
 * freshness is a thing that can actually be measured. It is written through
 * the normal logger, so it also shows up in Settings → Logs rather than being
 * a second, hidden logging path.
 */
export const CRON_HEARTBEAT_PREFIX = "cron-heartbeat:";

export type CronJob = "session-reminders" | "daily-digest" | "send-waves" | "follow-ups";

/**
 * Never throws. A job must not fail because its bookkeeping failed — a
 * heartbeat that can take the run down with it is worse than no heartbeat.
 */
export async function recordCronRun(job: CronJob, summary: string): Promise<void> {
  try {
    await syslog.info(
      "cron",
      `Scheduled job "${job}" finished`,
      `${CRON_HEARTBEAT_PREFIX}${job} ${summary}`,
      { metadata: { job, summary } },
    );
  } catch (e) {
    console.error(`Failed to record cron heartbeat for ${job}:`, e);
  }
}

/**
 * When did ANY scheduled job last complete?
 *
 * Deliberately "any" rather than per-job: only `session-reminders` is on a
 * schedule right now (the other three are unscheduled by choice — see
 * CLAUDE.md), so a per-job freshness rule would report the deliberately
 * dormant ones as broken every single day and train the alert to be ignored.
 */
export async function lastCronRunAt(): Promise<string | null> {
  const row = await db
    .select({ createdAt: systemLogs.createdAt })
    .from(systemLogs)
    .where(and(
      eq(systemLogs.category, "cron"),
      like(systemLogs.technicalMessage, `${CRON_HEARTBEAT_PREFIX}%`),
    ))
    .orderBy(desc(systemLogs.id))
    .limit(1)
    .get();

  return row?.createdAt ?? null;
}
