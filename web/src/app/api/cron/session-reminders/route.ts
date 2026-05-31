import { db } from "@/db";
import { sessions, clients, outreachSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { sendSMS, isDevAllowed } from "@/lib/twilio";
import { syslog } from "@/lib/logger";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
    })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(and(eq(sessions.scheduledDate, today), eq(sessions.status, "confirmed")))
    .all();

  const results: string[] = [];

  for (const s of todaySessions) {
    const isActive = s.category === "active" || s.category === "in_season";
    const clientOptedIn = s.sessionReminders === true;
    const shouldRemind = clientOptedIn || (globalEnabled && isActive && s.sessionReminders !== false);

    if (!shouldRemind) continue;

    if (!isDevAllowed(s.clientPhone)) {
      results.push(`skipped (dev guard): ${s.clientName}`);
      continue;
    }

    const firstName = s.clientName.split(" ")[0];
    const message = `Hey ${firstName}, see you today at ${s.slot}!`;

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

  return Response.json({ date: today, processed: results.length, results });
}
