import { db } from "@/db";
import { sessions, clients, outreachSettings, sessionAttendees } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { sendSMS, isDevAllowed } from "@/lib/twilio";
import { syslog } from "@/lib/logger";
import { isCronAuthorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-heartbeat";
import { sessionTypeSuffix } from "@/lib/session-description";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

  const settings = await db.select().from(outreachSettings).get();
  const globalEnabled = settings?.sessionRemindersGlobal ?? false;

  const todaySessions = await db
    .select({
      sessionId: sessions.id,
      clientId: clients.id,
      clientName: clients.name,
      clientPhone: clients.phone,
      scheduledTime: sessions.scheduledTime,
      slot: sessions.slot,
      sessionReminders: clients.sessionReminders,
      category: clients.category,
      sessionType: sessions.sessionType,
    })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(and(eq(sessions.scheduledDate, today), eq(sessions.status, "confirmed")))
    .all();

  // Roster sizes for today's sessions (#13), so a group message can say how many
  // others are in it. Counts only — never names (#56).
  const attendeeRows = await db
    .select({ sessionId: sessionAttendees.sessionId, n: sql<number>`count(*)` })
    .from(sessionAttendees)
    .groupBy(sessionAttendees.sessionId)
    .all();
  // +1 for the owning client, who is on the roster but not in this table.
  const attendeeCounts = new Map(attendeeRows.map((r) => [r.sessionId, Number(r.n) + 1]));

  const results: string[] = [];

  for (const s of todaySessions) {
    const isActive = s.category === "active" || s.category === "in_season";
    const clientOptedIn = s.sessionReminders === true;
    const shouldRemind = clientOptedIn || (globalEnabled && isActive && s.sessionReminders !== false);

    if (!shouldRemind) continue;

    if (!isDevAllowed(s.clientPhone)) {
      results.push(`skipped (outreach policy): ${s.clientName}`);
      continue;
    }

    const firstName = s.clientName.split(" ")[0];
    // #56 — say when it is a group or partner session. Individual sessions keep
    // the original wording, and no other client is ever named.
    const others = Math.max(0, (attendeeCounts.get(s.sessionId) ?? 0) - 1);
    const message = `Hey ${firstName}, see you today at ${s.slot}${sessionTypeSuffix(s.sessionType, others)}!`;

    try {
      await sendSMS(s.clientPhone, message);
      results.push(`sent: ${s.clientName} (${s.slot})`);
      syslog.info("cron", `Session reminder sent to ${s.clientName}`, `Reminder for ${today} at ${s.slot}`, { clientId: s.clientId, sessionId: s.sessionId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push(`failed: ${s.clientName}: ${msg}`);
      syslog.error("cron", `Failed to send session reminder to ${s.clientName}`, `SMS error: ${msg}`, { clientId: s.clientId, sessionId: s.sessionId });
    }
  }

  await recordCronRun("session-reminders", `${results.length} processed`);

  return Response.json({ date: today, processed: results.length, results });
}

/**
 * Vercel Cron invokes scheduled jobs with **GET**, not POST.
 *
 * This route was POST-only, so every scheduled invocation was answered with
 * 405 and the job never ran once — a scheduled cron that has never executed,
 * with nothing anywhere reporting a problem. Confirmed against production on
 * 2026-08-30: GET returned 405, POST returned 200.
 *
 * Both verbs are kept: GET is what the platform sends, POST is what manual
 * runs and the existing tests use. Both are CRON_SECRET-authenticated, so
 * exposing GET adds no reachable surface.
 */
export const GET = POST;
