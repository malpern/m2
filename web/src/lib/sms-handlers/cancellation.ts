import { db } from "@/db";
import { outreach, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { composeReply } from "@/lib/classify-reply";
import { creditCancellation } from "@/lib/package-accounting";
import { syncSessionToCalendar } from "@/lib/gcal-sync";
import { autoFillCancelledSlot } from "@/lib/auto-fill";
import { syslog } from "@/lib/logger";
import { logAndSend, getDayLabel, getGroupedSessionIds, type WebhookContext } from "./shared";

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
    creditCancellation(sid).catch((e) => syslog.error("system", "Credit cancellation failed", String(e), { sessionId: sid }));
    syncSessionToCalendar(sid).catch((e) => syslog.error("system", "Calendar sync failed", String(e), { sessionId: sid }));
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
    autoFillCancelledSlot(cs.date, cs.slot, cs.clientId).catch((e) =>
      syslog.error("auto_fill", "Auto-fill failed after cancellation", String(e)));
  }
}

export async function handleConfirmedSessionCancellation(
  ctx: WebhookContext,
): Promise<void> {
  const { client, body, weekOf, firstName, lastSent, history } = ctx;
  const sessionId = lastSent.sessionId!;
  const historyWithReply = [...history, { direction: "received" as const, text: body }];

  await db.update(sessions).set({ status: "cancelled" }).where(eq(sessions.id, sessionId)).run();
  creditCancellation(sessionId).catch((e) => syslog.error("system", "Credit cancellation failed", String(e), { sessionId }));
  syncSessionToCalendar(sessionId).catch((e) => syslog.error("system", "Calendar sync failed", String(e), { sessionId }));

  const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  const dayLabel = session ? getDayLabel(session.scheduledDate) : "your session";
  const slot = session?.slot ?? "";

  await db.insert(outreach).values({
    clientId: client.id, sessionId, weekOf,
    direction: "received" as const, messageText: body,
    interpretation: "cancellation", status: "expired" as const,
    repliedAt: new Date().toISOString(),
  }).run();

  const reply = await composeReply({
    firstName,
    history: historyWithReply,
    scenario: { type: "cancellation", day: dayLabel, slot },
  });
  await logAndSend(client.id, sessionId, weekOf, client.phone, reply);

  if (session) {
    autoFillCancelledSlot(session.scheduledDate, session.slot, client.id).catch((e) =>
      syslog.error("auto_fill", "Auto-fill failed after cancellation", String(e)));
  }
}
