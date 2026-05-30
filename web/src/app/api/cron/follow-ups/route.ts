import { db } from "@/db";
import { outreach, sessions, clients } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getMonday } from "@/lib/scheduler";
import { sendSMS, isDevAllowed } from "@/lib/twilio";
import { composeReply, type ConversationMessage } from "@/lib/classify-reply";
import { getOpenSlots, rankSlotsForClient, diversifyAcrossDays, tagOfferedSlots } from "@/lib/suggest-alternatives";
import { OUTREACH_DEFAULTS } from "@/lib/outreach-config";
import { NextRequest } from "next/server";

function formatSlotsText(slots: { day: string; slot: string }[]): string {
  const DAY_LABELS: Record<string, string> = {
    monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
    thursday: "Thursday", friday: "Friday", sunday: "Sunday",
  };
  return slots.map((s) => `${DAY_LABELS[s.day] ?? s.day} at ${s.slot}`).join(", ");
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const weekOf = getMonday().toISOString().split("T")[0];
  const now = Date.now();
  const followUpMs = OUTREACH_DEFAULTS.followUpAfterMinutes * 60 * 1000;
  const moveOnMs = OUTREACH_DEFAULTS.moveOnAfterMinutes * 60 * 1000;

  const allOutreach = await db
    .select({
      id: outreach.id,
      clientId: outreach.clientId,
      sessionId: outreach.sessionId,
      direction: outreach.direction,
      messageText: outreach.messageText,
      status: outreach.status,
      sentAt: outreach.sentAt,
      repliedAt: outreach.repliedAt,
      clientName: clients.name,
      clientPhone: clients.phone,
    })
    .from(outreach)
    .innerJoin(clients, eq(clients.id, outreach.clientId))
    .where(eq(outreach.weekOf, weekOf))
    .all();

  const sentAwaiting = allOutreach.filter(
    (o) => o.direction === "sent" && o.status === "awaiting_reply" && o.sentAt
  );

  const results: string[] = [];

  for (const sent of sentAwaiting) {
    const elapsed = now - new Date(sent.sentAt!).getTime();
    const hasReply = allOutreach.some(
      (o) => o.sessionId === sent.sessionId && o.direction === "received" &&
        (o.repliedAt ?? "") > (sent.sentAt ?? "")
    );

    if (hasReply) continue;

    const firstName = sent.clientName.split(" ")[0];

    if (elapsed >= moveOnMs) {
      await db.update(outreach).set({ status: "expired" }).where(eq(outreach.id, sent.id)).run();
      if (sent.sessionId) {
        await db.update(sessions).set({ status: "cancelled" }).where(eq(sessions.id, sent.sessionId)).run();
      }
      results.push(`moved-on: ${sent.clientName}`);
      continue;
    }

    if (elapsed >= followUpMs) {
      const alreadyFollowedUp = allOutreach.some(
        (o) => o.clientId === sent.clientId && o.direction === "sent" &&
          o.id !== sent.id && (o.sentAt ?? "") > (sent.sentAt ?? "")
      );
      if (alreadyFollowedUp) continue;

      if (!isDevAllowed(sent.clientPhone)) {
        results.push(`follow-up-skipped (dev guard): ${sent.clientName}`);
        continue;
      }

      const reply = `Hey ${firstName}, just checking in — did you want to keep your session this week? Let me know!`;

      await db.insert(outreach).values({
        clientId: sent.clientId,
        sessionId: sent.sessionId,
        weekOf,
        direction: "sent",
        messageText: reply,
        status: "awaiting_reply",
        sentAt: new Date().toISOString(),
      }).run();

      try {
        await sendSMS(sent.clientPhone, reply);
        results.push(`follow-up-sent: ${sent.clientName}`);
      } catch (e) {
        results.push(`follow-up-failed: ${sent.clientName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return Response.json({ processed: results.length, results });
}
