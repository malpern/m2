import { db } from "@/db";
import { systemLogs } from "@/db/schema";
import { gte, eq, and } from "drizzle-orm";
import { sendSMS, isDevAllowed } from "./twilio";
import { sendEmail } from "./email";
import { toSqlTimestamp } from "./sql-time";

const ALERT_PHONE = process.env.ALERT_PHONE_NUMBER ?? "+14082099509";
const ALERT_EMAIL = process.env.ALERT_EMAIL ?? "malpern@gmail.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://web-jet-mu-62.vercel.app";
const THROTTLE_MS = 10 * 60 * 1000;

let lastAlertAt = 0;

/**
 * In-app alerting covers ERROR BURSTS, and only those. It is deliberately not
 * the whole alerting story, because it cannot be:
 *
 *  - It only runs when something calls `syslog.error`, so it is blind to
 *    absence — a cron that stopped, a token that expired, a deploy that never
 *    shipped. `/api/health` plus the external watchdog cover those.
 *  - It alerts through Twilio and Resend, the app's own dependencies. If the
 *    thing that is broken is the app, the alert path is broken too. The
 *    watchdog on the mini pages via Pushover, out of band, for that reason.
 *  - `lastAlertAt` is per-instance memory. On serverless each cold start gets
 *    a fresh one, so the throttle is a courtesy, not a guarantee.
 *
 * Treat it as the fast local signal and the watchdog as the reliable one.
 */
export async function checkAndAlert(mattMessage: string, technicalMessage: string): Promise<void> {
  const now = Date.now();
  if (now - lastAlertAt < THROTTLE_MS) return;

  // SQLite-shaped, not ISO — see lib/sql-time.ts. With an ISO threshold this
  // matched nothing and the alert never fired.
  const tenMinutesAgo = toSqlTimestamp(new Date(now - THROTTLE_MS));

  // Counting errors requires the database — which is itself a thing that can
  // be down. This used to be an unguarded await: the query threw, the caller
  // in logger.ts swallowed it, and a total database outage therefore produced
  // exactly ZERO alerts, which is the one case most worth waking up for.
  let errorCount: number;
  try {
    const recentErrors = await db
      .select({ id: systemLogs.id })
      .from(systemLogs)
      .where(and(
        eq(systemLogs.severity, "error"),
        gte(systemLogs.createdAt, tenMinutesAgo),
      ))
      .all();
    errorCount = recentErrors.length;
    if (errorCount < 3) return;
  } catch (e) {
    // Cannot assess, so assume the worst and say so plainly. Being unable to
    // read the log table IS the incident, not a reason to stay quiet.
    const why = e instanceof Error ? e.message : String(e);
    lastAlertAt = now;
    await deliver(
      `🚨 M2 Alert: the database is unreachable.\n\nCould not read system_logs: ${why}\n\nLatest error: ${mattMessage}`,
      "🚨 M2 Alert: database unreachable",
      technicalMessage,
    );
    return;
  }

  lastAlertAt = now;

  const alertMsg = `🚨 M2 Alert: ${errorCount} errors in the last 10 minutes.\n\nLatest: ${mattMessage}\n\nCheck logs: ${APP_URL}/settings/logs`;

  await deliver(alertMsg, `🚨 M2 Alert: ${errorCount} errors in 10 minutes`, technicalMessage);
}

/**
 * Send an alert on every channel we have, independently.
 *
 * Each channel is tried even if the previous one threw: an alert that gives up
 * because SMS failed is an alert that does not arrive.
 */
async function deliver(body: string, subject: string, technicalMessage: string): Promise<void> {
  if (!isDevAllowed(ALERT_PHONE)) {
    console.log(`[ALERT] Would send to ${ALERT_PHONE}: ${body.slice(0, 80)}`);
  } else {
    try {
      await sendSMS(ALERT_PHONE, body);
    } catch (e) {
      console.error("Failed to send SMS alert:", e);
    }
  }

  try {
    await sendEmail(ALERT_EMAIL, subject, `${body}\n\nTechnical: ${technicalMessage}`);
  } catch (e) {
    console.error("Failed to send email alert:", e);
  }
}

export async function getDailyDigest(): Promise<string> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = toSqlTimestamp(todayStart);

  const todayLogs = await db
    .select({
      severity: systemLogs.severity,
      category: systemLogs.category,
    })
    .from(systemLogs)
    .where(gte(systemLogs.createdAt, todayISO))
    .all();

  const errors = todayLogs.filter((l) => l.severity === "error").length;
  const warns = todayLogs.filter((l) => l.severity === "warn").length;
  const infos = todayLogs.filter((l) => l.severity === "info").length;

  const twilioEvents = todayLogs.filter((l) => l.category === "twilio").length;
  const classifierEvents = todayLogs.filter((l) => l.category === "classifier").length;
  const autoFillEvents = todayLogs.filter((l) => l.category === "auto_fill").length;

  const lines = [
    `📊 M2 Daily Digest`,
    ``,
    `${errors > 0 ? "🛑" : "✅"} ${errors} errors, ${warns} warnings, ${infos} info`,
    `📱 ${twilioEvents} messages sent`,
    `🧠 ${classifierEvents} classifications`,
    `🔄 ${autoFillEvents} auto-fills`,
  ];

  if (errors > 0) {
    lines.push(``, `Check logs: ${APP_URL}/settings/logs`);
  }

  return lines.join("\n");
}
