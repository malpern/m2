import { db } from "@/db";
import { systemLogs } from "@/db/schema";
import { gte, eq, and } from "drizzle-orm";
import { sendSMS, isDevAllowed } from "./twilio";
import { sendEmail } from "./email";

const ALERT_PHONE = "+14082099509";
const ALERT_EMAIL = "malpern@gmail.com";
const THROTTLE_MS = 10 * 60 * 1000;

let lastAlertAt = 0;

export async function checkAndAlert(mattMessage: string, technicalMessage: string): Promise<void> {
  const now = Date.now();
  if (now - lastAlertAt < THROTTLE_MS) return;

  const tenMinutesAgo = new Date(now - THROTTLE_MS).toISOString();
  const recentErrors = await db
    .select({ id: systemLogs.id })
    .from(systemLogs)
    .where(and(
      eq(systemLogs.severity, "error"),
      gte(systemLogs.createdAt, tenMinutesAgo),
    ))
    .all();

  if (recentErrors.length < 3) return;

  lastAlertAt = now;

  const alertMsg = `🚨 M2 Alert: ${recentErrors.length} errors in the last 10 minutes.\n\nLatest: ${mattMessage}\n\nCheck logs: https://web-jet-mu-62.vercel.app/settings/logs`;

  if (!isDevAllowed(ALERT_PHONE)) {
    console.log(`[ALERT] Would send to ${ALERT_PHONE}: ${alertMsg.slice(0, 80)}`);
    return;
  }

  try {
    await sendSMS(ALERT_PHONE, alertMsg);
  } catch (e) {
    console.error("Failed to send WhatsApp alert:", e);
  }

  try {
    await sendEmail(
      ALERT_EMAIL,
      `🚨 M2 Alert: ${recentErrors.length} errors in 10 minutes`,
      `${alertMsg}\n\nTechnical: ${technicalMessage}`,
    );
  } catch (e) {
    console.error("Failed to send email alert:", e);
  }
}

export async function getDailyDigest(): Promise<string> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

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
    lines.push(``, `Check logs: https://web-jet-mu-62.vercel.app/settings/logs`);
  }

  return lines.join("\n");
}
