import { db } from "@/db";
import { outreach, clients, sessions } from "@/db/schema";
import type { Client, Outreach, Session } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { sendSMS } from "@/lib/twilio";
import { syslog } from "@/lib/logger";
import { getMonday } from "@/lib/scheduler";
import type { ConversationMessage } from "@/lib/classify-reply";
import { getOpenSlots, rankSlotsForClient, diversifyAcrossDays, tagOfferedSlots } from "@/lib/suggest-alternatives";
import { composeReply } from "@/lib/classify-reply";
import { SLOT_TIMES_MAP, formatSlotsText } from "@/lib/constants";

export { SLOT_TIMES_MAP, formatSlotsText };

export interface WebhookContext {
  client: Client;
  body: string;
  weekOf: string;
  firstName: string;
  lastSent: Outreach;
  recentOutreach: Outreach[];
  history: ConversationMessage[];
}

export function stripOfferedTags(text: string): string {
  return text.replace(/\n?\[offered:[^\]]+\]/g, "").trim();
}

export function buildConversationHistory(records: { direction: string; messageText: string; sentAt: string | null; repliedAt: string | null }[]): ConversationMessage[] {
  return records
    .sort((a, b) => {
      const ta = a.sentAt ?? a.repliedAt ?? "";
      const tb = b.sentAt ?? b.repliedAt ?? "";
      return ta.localeCompare(tb);
    })
    .map((r) => ({
      direction: r.direction as "sent" | "received",
      text: stripOfferedTags(r.messageText),
    }));
}

export function getDayLabel(scheduledDate: string): string {
  return new Date(scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });
}

export async function logAndSend(clientId: number, sessionId: number | null, weekOf: string, phone: string, message: string, followUpAt?: string) {
  const row = await db.insert(outreach).values({
    clientId,
    sessionId,
    weekOf,
    direction: "sent",
    messageText: message,
    status: "awaiting_reply",
    sentAt: new Date().toISOString(),
    followUpAt: followUpAt ?? null,
  }).returning().get();

  const smsText = message.replace(/\n\[offered:[^\]]+\]/, "");
  try {
    await sendSMS(phone, smsText);
    syslog.info("twilio", `Sent message to client`, `SMS sent to ${phone}, outreach id=${row.id}`, { clientId, sessionId });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    await db.update(outreach).set({
      status: "pending",
      sendError: errorMsg,
    }).where(eq(outreach.id, row.id)).run();
    syslog.error("twilio", `Failed to send message — will retry`, `SMS to ${phone} failed: ${errorMsg}`, { clientId, sessionId, metadata: { error: errorMsg } });
  }
}

export async function findClient(phone: string) {
  const normalized = phone.replace(/^whatsapp:/i, "").replace(/\s/g, "");
  const last10 = normalized.replace(/\D/g, "").slice(-10);
  if (last10.length < 10) return null;

  // Use SQL to match the last 10 digits server-side instead of loading all clients.
  // Strip common formatting chars (+, -, spaces, parens) from the stored phone before comparing.
  const result = await db
    .select()
    .from(clients)
    .where(
      sql`SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${clients.phone}, '-', ''), ' ', ''), '(', ''), ')', ''), '+', ''), -10) = ${last10}`
    )
    .limit(1)
    .all();

  return result[0] ?? null;
}

export async function getGroupedSessionIds(outreachGroupId: string | null): Promise<number[] | null> {
  if (!outreachGroupId) return null;
  const siblings = await db.select({ sessionId: outreach.sessionId })
    .from(outreach)
    .where(and(
      eq(outreach.outreachGroupId, outreachGroupId),
      eq(outreach.direction, "sent"),
    ))
    .all();
  return siblings.map((s) => s.sessionId).filter((id): id is number => id !== null);
}

export async function offerFreshAlternatives(
  ctx: WebhookContext,
  scenarioType: "slot_taken" | "re_engage" | "re_engage_full" | "alternatives",
  sessionId: number | null,
): Promise<void> {
  const { client, weekOf, firstName, history, body } = ctx;
  const historyWithReply = [...history, { direction: "received" as const, text: body }];

  const open = await getOpenSlots(weekOf, client.id);
  const ranked = await rankSlotsForClient(client.id, open);
  const diverse = diversifyAcrossDays(ranked, 3);

  if (diverse.length > 0) {
    const altText = formatSlotsText(diverse);
    const reply = await composeReply({
      firstName,
      history: historyWithReply,
      scenario: { type: scenarioType, alternatives: altText },
    });
    const tagged = tagOfferedSlots(reply, diverse);
    await logAndSend(client.id, sessionId, weekOf, client.phone, tagged);
  } else {
    const reply = await composeReply({
      firstName,
      history: historyWithReply,
      scenario: { type: "re_engage_full" },
    });
    await logAndSend(client.id, sessionId, weekOf, client.phone, reply);
  }
}
