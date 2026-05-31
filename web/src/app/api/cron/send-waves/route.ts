import { db } from "@/db";
import { outreach, sessions, clients, weeklySkips } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getMonday } from "@/lib/scheduler";
import { buildOutreachQueue, getNextWaveToSend } from "@/lib/outreach-engine";
import { sendSMS, isDevAllowed } from "@/lib/twilio";
import { syslog } from "@/lib/logger";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const monday = getMonday();
  const weekStart = monday.toISOString().split("T")[0];
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

  let sent = 0;
  const results: string[] = [];

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

    const now = new Date().toISOString();
    for (const item of clientItems) {
      await db.insert(outreach).values({
        clientId: item.clientId,
        sessionId: item.sessionId,
        weekOf: weekStart,
        direction: "sent",
        messageText: message,
        status: "awaiting_reply",
        sentAt: now,
        outreachGroupId: groupId,
      }).run();
    }

    try {
      await sendSMS(first.clientPhone, message);
      sent++;
      results.push(`sent wave ${wave}: ${first.clientName} (${clientItems.length} sessions)`);
      syslog.info("outreach", `Sent wave ${wave} outreach to ${first.clientName}`, `Auto-wave ${wave}: ${clientItems.length} sessions to ${first.clientPhone}`, { clientId });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      results.push(`failed: ${first.clientName}: ${errorMsg}`);
      syslog.error("outreach", `Wave ${wave} send failed for ${first.clientName}`, `Auto-wave send error: ${errorMsg}`, { clientId });
    }
  }

  return Response.json({ wave, sent, total: eligible.length, results });
}
