import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { composeReply } from "@/lib/classify-reply";
import { syslog } from "@/lib/logger";
import {
  logAndSend,
  getDayLabel,
  getGroupedSessionIds,
  safeSyncCalendar,
  safeCreditCancellation,
  safeAutoFill,
  recordInboundReply,
  type WebhookContext,
} from "./shared";

export async function handleCancellation(
  ctx: WebhookContext,
  scenarioType: "cancellation" | "skip_week",
): Promise<void> {
  const { client, body, weekOf, firstName, lastSent, history } = ctx;
  const historyWithReply = [...history, { direction: "received" as const, text: body }];

  const groupIds = await getGroupedSessionIds(lastSent?.outreachGroupId ?? null);
  const sidsToCancel = groupIds ?? (lastSent?.sessionId ? [lastSent.sessionId] : []);
  const cancelledSlots: { date: string; slot: string; clientId: number }[] = [];

  for (const sid of sidsToCancel) {
    const s = await db.select().from(sessions).where(eq(sessions.id, sid)).get();
    await db.update(sessions).set({ status: "cancelled" }).where(eq(sessions.id, sid)).run();
    safeCreditCancellation(sid);
    safeSyncCalendar(sid);
    if (s) cancelledSlots.push({ date: s.scheduledDate, slot: s.slot, clientId: client.id });
  }

  if (scenarioType === "skip_week") {
    const reply = await composeReply({
      firstName,
      history: historyWithReply,
      scenario: { type: "skip_week" },
    });
    await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone, reply);
  } else {
    const session = cancelledSlots[0];
    const dayLabel = session ? getDayLabel(session.date) : "your session";
    const reply = await composeReply({
      firstName,
      history: historyWithReply,
      scenario: { type: "cancellation", day: dayLabel, slot: session?.slot ?? "" },
    });
    await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone, reply);
  }

  for (const cs of cancelledSlots) {
    safeAutoFill(cs.date, cs.slot, cs.clientId);
  }
}

export async function handleConfirmedSessionCancellation(
  ctx: WebhookContext,
): Promise<void> {
  const { client, body, weekOf, firstName, lastSent, history } = ctx;
  const sessionId = lastSent.sessionId!;
  const historyWithReply = [...history, { direction: "received" as const, text: body }];

  await db.update(sessions).set({ status: "cancelled" }).where(eq(sessions.id, sessionId)).run();
  safeCreditCancellation(sessionId);
  safeSyncCalendar(sessionId);

  const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  const dayLabel = session ? getDayLabel(session.scheduledDate) : "your session";
  const slot = session?.slot ?? "";

  await recordInboundReply(client.id, sessionId, weekOf, body, "expired", { interpretation: "cancellation" });

  const reply = await composeReply({
    firstName,
    history: historyWithReply,
    scenario: { type: "cancellation", day: dayLabel, slot },
  });
  await logAndSend(client.id, sessionId, weekOf, client.phone, reply);

  if (session) {
    safeAutoFill(session.scheduledDate, session.slot, client.id);
  }
}
