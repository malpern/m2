import { db } from "@/db";
import { outreach, sessions, clients, weeklySkips } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getMonday } from "@/lib/scheduler";
import { buildOutreachQueue, getNextWaveToSend } from "@/lib/outreach-engine";
import { sendSMS, isDevAllowed } from "@/lib/twilio";
import { syslog } from "@/lib/logger";
import { isVacationWeek } from "@/lib/vacation-detect";
import { isCronAuthorized } from "@/lib/cron-auth";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const monday = getMonday();
  const weekStart = monday.toISOString().split("T")[0];

  if (await isVacationWeek(weekStart)) {
    syslog.info("cron", "Skipping outreach — vacation week detected", `All slots disabled for week of ${weekStart}`, {});
    return Response.json({ skipped: true, reason: "vacation_week" });
  }
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const weekEnd = sunday.toISOString().split("T")[0];

  const weekSessions = await db
    .select({
      id: sessions.id,
      clientId: sessions.clientId,
      clientName: clients.name,
      clientPhone: clients.phone,
      standingSlot: clients.standingSlot,
      packageId: sessions.packageId,
      scheduledDate: sessions.scheduledDate,
      scheduledTime: sessions.scheduledTime,
      slot: sessions.slot,
      status: sessions.status,
      sessionType: sessions.sessionType,
      gcalEventId: sessions.gcalEventId,
      loggedToSheets: sessions.loggedToSheets,
      reconciled: sessions.reconciled,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(and(gte(sessions.scheduledDate, weekStart), lte(sessions.scheduledDate, weekEnd)))
    .all();

  const weekOutreach = await db
    .select()
    .from(outreach)
    .where(eq(outreach.weekOf, weekStart))
    .all();

  const skips = await db
    .select({ clientId: weeklySkips.clientId })
    .from(weeklySkips)
    .where(eq(weeklySkips.weekOf, weekStart))
    .all();
  const skippedIds = new Set(skips.map((s) => s.clientId));

  const items = buildOutreachQueue(weekSessions, weekOutreach);
  const { wave, items: waveItems } = getNextWaveToSend(items);

  if (wave === 0 || waveItems.length === 0) {
    return Response.json({ wave: 0, sent: 0, message: "No wave ready to send" });
  }

  const eligible = waveItems.filter((i) => !skippedIds.has(i.clientId));

  if (eligible.length === 0) {
    return Response.json({ wave, sent: 0, message: "All wave items are skipped" });
  }

  const byClient = new Map<number, typeof eligible>();
  for (const item of eligible) {
    const group = byClient.get(item.clientId) ?? [];
    group.push(item);
    byClient.set(item.clientId, group);
  }

  const results: string[] = [];
  const allOutreachRows: Array<{
    clientId: number;
    sessionId: number;
    weekOf: string;
    direction: string;
    messageText: string;
    status: string;
    sentAt: string;
    outreachGroupId: string | null;
  }> = [];
  const smsJobs: Array<{
    clientId: number;
    clientName: string;
    clientPhone: string;
    message: string;
    sessionCount: number;
  }> = [];

  const now = new Date().toISOString();

  for (const [clientId, clientItems] of byClient) {
    const first = clientItems[0];

    if (!isDevAllowed(first.clientPhone)) {
      results.push(`skipped (dev guard): ${first.clientName}`);
      continue;
    }

    const firstName = first.clientName.split(" ")[0];
    let message: string;
    const groupId = clientItems.length > 1 ? `og_${clientId}_${Date.now()}` : null;

    if (clientItems.length === 1) {
      const dayLabel = new Date(first.date + "T12:00:00Z")
        .toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });
      message = `Hey ${firstName}, are you free ${dayLabel} at ${first.slot} for a session?`;
    } else {
      const sorted = [...clientItems].sort((a, b) => a.date.localeCompare(b.date));
      const days = sorted.map((s) => {
        const d = new Date(s.date + "T12:00:00Z")
          .toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });
        return `• ${d} at ${s.slot}`;
      });
      message = `Hey ${firstName}, here's your schedule this week:\n${days.join("\n")}\nAll good, or need to change anything?`;
    }

    for (const item of clientItems) {
      allOutreachRows.push({
        clientId: item.clientId,
        sessionId: item.sessionId,
        weekOf: weekStart,
        direction: "sent",
        messageText: message,
        status: "awaiting_reply",
        sentAt: now,
        outreachGroupId: groupId,
      });
    }

    smsJobs.push({
      clientId,
      clientName: first.clientName,
      clientPhone: first.clientPhone,
      message,
      sessionCount: clientItems.length,
    });
  }

  // Batch-insert all outreach rows in a single DB write
  if (allOutreachRows.length > 0) {
    await db.insert(outreach).values(allOutreachRows).run();
  }

  // Send all SMS messages in parallel
  const smsResults = await Promise.allSettled(
    smsJobs.map((job) => sendSMS(job.clientPhone, job.message))
  );

  let sent = 0;
  for (let i = 0; i < smsJobs.length; i++) {
    const job = smsJobs[i];
    const result = smsResults[i];
    if (result.status === "fulfilled") {
      sent++;
      results.push(`sent wave ${wave}: ${job.clientName} (${job.sessionCount} sessions)`);
      syslog.info("outreach", `Sent wave ${wave} outreach to ${job.clientName}`, `Auto-wave ${wave}: ${job.sessionCount} sessions to ${job.clientPhone}`, { clientId: job.clientId });
    } else {
      const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      results.push(`failed: ${job.clientName}: ${errorMsg}`);
      syslog.error("outreach", `Wave ${wave} send failed for ${job.clientName}`, `Auto-wave send error: ${errorMsg}`, { clientId: job.clientId });
    }
  }

  return Response.json({ wave, sent, total: eligible.length, results });
}
