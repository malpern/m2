import { db } from "@/db";
import { outreach, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { classifyReply, composeReply, ClassifyBillingError } from "@/lib/classify-reply";
import { getOpenSlots, rankSlotsForClient, diversifyAcrossDays, tryBookSlot, tagOfferedSlots, whySlotUnavailable } from "@/lib/suggest-alternatives";
import { syncSessionToCalendar } from "@/lib/gcal-sync";
import { getInvitePrompt } from "@/lib/invite-prompt";
import { syslog } from "@/lib/logger";
import { getMonday } from "@/lib/scheduler";
import {
  logAndSend,
  formatSlotsText,
  getDayLabel,
  getGroupedSessionIds,
  type WebhookContext,
} from "./shared";
import { handleBalanceInquiry } from "./balance";
import { handleCancellation } from "./cancellation";

type OutreachStatus = "pending" | "awaiting_reply" | "confirmed" | "needs_matt" | "expired";

const STATUS_MAP: Record<string, OutreachStatus> = {
  confirmed: "confirmed",
  selecting_offered_slot: "confirmed",
  declined_skip_week: "expired",
  declined_wants_options: "needs_matt",
  declined_with_alternative: "needs_matt",
  reschedule_request: "needs_matt",
  cancellation: "expired",
  account_inquiry: "confirmed",
  deferred: "awaiting_reply",
  ambiguous: "needs_matt",
};

export async function handleSingleSessionReply(ctx: WebhookContext): Promise<void> {
  const { client, body, weekOf, firstName, lastSent, history, recentOutreach } = ctx;
  const sessionId = lastSent?.sessionId ?? null;

  let result;
  try {
    result = await classifyReply(history, body);
  } catch (e) {
    const errorType = e instanceof ClassifyBillingError ? "ai_billing_exhausted" : "ai_classify_error";
    await db.insert(outreach).values({
      clientId: client.id, sessionId, weekOf,
      direction: "received" as const, messageText: body,
      status: "needs_matt" as const, repliedAt: new Date().toISOString(),
      sendError: errorType,
    }).run();
    syslog.error("classifier", `Couldn't understand ${firstName}'s reply — flagged for you`, `Classify failed: ${errorType}. Reply: "${body}"`, { clientId: client.id });
    await logAndSend(client.id, sessionId, weekOf, client.phone,
      "Let me check with Matt and get back to you.");
    return;
  }

  const interpretation = result.interpretation;

  if (interpretation === "account_inquiry") {
    await handleBalanceInquiry(ctx);
    return;
  }

  if (interpretation === "deferred") {
    await handleDeferred(ctx, result.extractedDelayMinutes ?? 60);
    return;
  }

  const historyWithReply = [...history, { direction: "received" as const, text: body }];

  const replyRecord = await db.insert(outreach).values({
    clientId: client.id, sessionId, weekOf: getMonday().toISOString().split("T")[0],
    direction: "received" as const, messageText: body,
    interpretation, status: STATUS_MAP[interpretation] ?? ("needs_matt" as OutreachStatus),
    repliedAt: new Date().toISOString(),
  }).returning().get();

  if (interpretation === "confirmed") {
    await handleConfirmed(ctx, historyWithReply);
    return;
  }

  if (interpretation === "selecting_offered_slot" && lastSent?.sessionId) {
    const handled = await handleSelectingOfferedSlot(ctx, result, replyRecord.id, historyWithReply);
    if (handled) return;
  }

  if ((interpretation === "declined_wants_options" ||
       interpretation === "declined_with_alternative" ||
       interpretation === "reschedule_request") && lastSent?.sessionId) {
    await handleDeclinedOrReschedule(ctx, result, replyRecord.id, historyWithReply);
    return;
  }

  if (interpretation === "declined_skip_week") {
    await handleCancellation(ctx, "skip_week");
    return;
  }

  if (interpretation === "cancellation") {
    await handleCancellation(ctx, "cancellation");
    return;
  }

  if (interpretation === "ambiguous") {
    await handleAmbiguous(ctx, historyWithReply);
    return;
  }
}

async function handleDeferred(ctx: WebhookContext, delayMinutes: number): Promise<void> {
  const { client, body, weekOf, firstName, lastSent } = ctx;
  const sessionId = lastSent?.sessionId ?? null;
  const followUpAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

  await db.insert(outreach).values({
    clientId: client.id, sessionId, weekOf,
    direction: "received" as const, messageText: body,
    interpretation: "deferred", status: "awaiting_reply" as const,
    repliedAt: new Date().toISOString(),
  }).run();

  const delayLabel = delayMinutes >= 120 ? `${Math.round(delayMinutes / 60)} hours`
    : delayMinutes === 60 ? "an hour"
    : `${delayMinutes} minutes`;
  const deferredReply = `No problem, ${firstName}! I'll check back in ${delayLabel}.`;
  await logAndSend(client.id, sessionId, weekOf, client.phone, deferredReply, followUpAt);
  syslog.info("outreach", `${firstName} deferred — will follow up in ${delayLabel}`, `followUpAt: ${followUpAt}`, { clientId: client.id });
}

async function handleConfirmed(
  ctx: WebhookContext,
  historyWithReply: { direction: "sent" | "received"; text: string }[],
): Promise<void> {
  const { client, weekOf, firstName, lastSent } = ctx;

  const groupIds = await getGroupedSessionIds(lastSent?.outreachGroupId ?? null);
  const sidsToConfirm = groupIds ?? (lastSent?.sessionId ? [lastSent.sessionId] : []);

  for (const sid of sidsToConfirm) {
    await db.update(sessions).set({ status: "confirmed" }).where(eq(sessions.id, sid)).run();
    syncSessionToCalendar(sid).catch((e) => syslog.error("system", "Calendar sync failed", String(e), { sessionId: sid }));
  }

  if (sidsToConfirm.length > 0) {
    const confirmedSessions = [];
    for (const sid of sidsToConfirm) {
      const s = await db.select().from(sessions).where(eq(sessions.id, sid)).get();
      if (s) confirmedSessions.push(s);
    }

    if (confirmedSessions.length === 1) {
      const s = confirmedSessions[0];
      const dayLabel = getDayLabel(s.scheduledDate);
      let reply = await composeReply({
        firstName, history: historyWithReply,
        scenario: { type: "confirmed", day: dayLabel, slot: s.slot },
      });
      const invitePrompt = await getInvitePrompt(client.id);
      if (invitePrompt) reply += invitePrompt;
      await logAndSend(client.id, lastSent!.sessionId, weekOf, client.phone, reply);
    } else if (confirmedSessions.length > 1) {
      const sorted = confirmedSessions.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
      const slotList = sorted.map((s) => `${getDayLabel(s.scheduledDate)} at ${s.slot}`).join(", ");
      let reply = await composeReply({
        firstName, history: historyWithReply,
        scenario: { type: "confirmed", day: slotList, slot: "" },
      });
      const invitePrompt = await getInvitePrompt(client.id);
      if (invitePrompt) reply += invitePrompt;
      await logAndSend(client.id, lastSent!.sessionId, weekOf, client.phone, reply);
    } else {
      await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone,
        `You're confirmed, ${firstName}! See you then.`);
    }
  }
}

async function handleSelectingOfferedSlot(
  ctx: WebhookContext,
  result: { extractedDay?: string; extractedTime?: string },
  replyRecordId: number,
  historyWithReply: { direction: "sent" | "received"; text: string }[],
): Promise<boolean> {
  const { client, weekOf, firstName, lastSent } = ctx;
  const session = await db.select().from(sessions).where(eq(sessions.id, lastSent.sessionId!)).get();
  if (!session) return false;

  const open = await getOpenSlots(weekOf, client.id);
  const ranked = await rankSlotsForClient(client.id, open);

  let matched = ranked.find((s) =>
    (result.extractedDay && s.day.startsWith(result.extractedDay.toLowerCase().slice(0, 3))) &&
    (!result.extractedTime || s.slot === result.extractedTime.toLowerCase())
  );
  if (!matched && result.extractedTime) {
    matched = ranked.find((s) => s.slot === result.extractedTime!.toLowerCase());
  }
  if (!matched && result.extractedDay) {
    matched = ranked.find((s) => s.day.startsWith(result.extractedDay!.toLowerCase().slice(0, 3)));
  }

  if (matched && await tryBookSlot(lastSent.sessionId!, matched.date, matched.time, matched.slot, "confirmed")) {
    await db.update(outreach).set({ status: "confirmed" }).where(eq(outreach.id, replyRecordId)).run();
    const dayLabel = matched.day.charAt(0).toUpperCase() + matched.day.slice(1);
    const reply = await composeReply({
      firstName, history: historyWithReply,
      scenario: { type: "confirmed", day: dayLabel, slot: matched.slot },
    });
    await logAndSend(client.id, lastSent.sessionId!, weekOf, client.phone, reply);
    return true;
  } else if (matched) {
    const stillOpen = await getOpenSlots(weekOf, client.id);
    const reRanked = await rankSlotsForClient(client.id, stillOpen);
    const diverse = diversifyAcrossDays(reRanked, 3);
    const altText = formatSlotsText(diverse);
    const reply = await composeReply({
      firstName, history: historyWithReply,
      scenario: { type: "slot_taken", alternatives: altText },
    });
    const tagged = tagOfferedSlots(reply, diverse);
    await db.update(outreach).set({ status: "awaiting_reply" }).where(eq(outreach.id, replyRecordId)).run();
    await logAndSend(client.id, lastSent.sessionId!, weekOf, client.phone, tagged);
    return true;
  }

  return false;
}

async function handleDeclinedOrReschedule(
  ctx: WebhookContext,
  result: { extractedDay?: string; extractedTime?: string },
  replyRecordId: number,
  historyWithReply: { direction: "sent" | "received"; text: string }[],
): Promise<void> {
  const { client, weekOf, firstName, lastSent } = ctx;

  const groupIds = await getGroupedSessionIds(lastSent.outreachGroupId ?? null);

  if (groupIds && groupIds.length > 1 && result.extractedDay) {
    const allGroupSessions = [];
    for (const sid of groupIds) {
      const s = await db.select().from(sessions).where(eq(sessions.id, sid)).get();
      if (s) allGroupSessions.push(s);
    }

    const rejectedDay = result.extractedDay.toLowerCase().slice(0, 3);
    const rejected = allGroupSessions.filter((s) => getDayLabel(s.scheduledDate).toLowerCase().startsWith(rejectedDay));
    const accepted = allGroupSessions.filter((s) => !rejected.includes(s));

    if (rejected.length > 0 && accepted.length > 0) {
      for (const s of accepted) {
        await db.update(sessions).set({ status: "confirmed" }).where(eq(sessions.id, s.id)).run();
        syncSessionToCalendar(s.id).catch((e) => syslog.error("system", "Calendar sync failed", String(e), { sessionId: s.id }));
      }
      await db.update(outreach).set({ status: "awaiting_reply" }).where(eq(outreach.id, replyRecordId)).run();

      const confirmedList = accepted.map((s) => `${getDayLabel(s.scheduledDate)} at ${s.slot}`).join(" and ");

      const open = await getOpenSlots(weekOf, client.id);
      const ranked = await rankSlotsForClient(client.id, open);
      const diverse = diversifyAcrossDays(ranked, 3);
      const altText = formatSlotsText(diverse);

      const rejectedDay_ = result.extractedDay.charAt(0).toUpperCase() + result.extractedDay.slice(1);
      const reply = await composeReply({
        firstName, history: historyWithReply,
        scenario: { type: "not_available", requestLabel: rejectedDay_, alternatives: altText },
      });

      const prefixed = `Got it, ${confirmedList} confirmed. ${reply}`;
      const tagged = tagOfferedSlots(prefixed, diverse);
      await logAndSend(client.id, lastSent.sessionId!, weekOf, client.phone, tagged);
      return;
    }
  }

  const open = await getOpenSlots(weekOf, client.id);

  if (result.extractedDay || result.extractedTime) {
    const matched = open.find((s) =>
      (!result.extractedDay || s.day.startsWith(result.extractedDay.toLowerCase().slice(0, 3))) &&
      (!result.extractedTime || s.slot === result.extractedTime.toLowerCase())
    );

    if (matched && await tryBookSlot(lastSent.sessionId!, matched.date, matched.time, matched.slot, "proposed")) {
      await db.update(outreach).set({ status: "awaiting_reply" }).where(eq(outreach.id, replyRecordId)).run();
      const dayLabel = matched.day.charAt(0).toUpperCase() + matched.day.slice(1);
      const reply = await composeReply({
        firstName, history: historyWithReply,
        scenario: { type: "counter_offer", day: dayLabel, slot: matched.slot },
      });
      const tagged = tagOfferedSlots(reply, [matched]);
      await logAndSend(client.id, lastSent.sessionId!, weekOf, client.phone, tagged);
      return;
    }

    const requestedDay = result.extractedDay ? result.extractedDay.charAt(0).toUpperCase() + result.extractedDay.slice(1) : null;
    const requestedTime = result.extractedTime ?? null;
    const requestLabel = [requestedDay, requestedTime].filter(Boolean).join(" at ");

    const reason = await whySlotUnavailable(weekOf, result.extractedDay ?? null, result.extractedTime ?? null);
    const ranked = await rankSlotsForClient(client.id, open);
    const diverse = diversifyAcrossDays(ranked, 3);
    const altText = formatSlotsText(diverse);

    const scenarioType = (reason === "not_a_slot" || reason === "not_available") ? "not_available" as const : "already_booked" as const;
    const reply = await composeReply({
      firstName, history: historyWithReply,
      scenario: { type: scenarioType, requestLabel, alternatives: altText },
    });
    const tagged = tagOfferedSlots(reply, diverse);
    await db.update(outreach).set({ status: "awaiting_reply" }).where(eq(outreach.id, replyRecordId)).run();
    await logAndSend(client.id, lastSent.sessionId!, weekOf, client.phone, tagged);
    return;
  }

  const ranked = await rankSlotsForClient(client.id, open);
  const diverse = diversifyAcrossDays(ranked, 3);
  const altText = formatSlotsText(diverse);
  const reply = await composeReply({
    firstName, history: historyWithReply,
    scenario: { type: "alternatives", alternatives: altText },
  });
  const tagged = tagOfferedSlots(reply, diverse);
  await db.update(outreach).set({ status: "awaiting_reply" }).where(eq(outreach.id, replyRecordId)).run();
  await logAndSend(client.id, lastSent.sessionId!, weekOf, client.phone, tagged);
}

async function handleAmbiguous(
  ctx: WebhookContext,
  historyWithReply: { direction: "sent" | "received"; text: string }[],
): Promise<void> {
  const { client, weekOf, firstName, lastSent, recentOutreach } = ctx;

  const recentAmbiguous = recentOutreach.filter(
    (o) => o.direction === "received" && o.interpretation === "ambiguous"
  ).length;

  if (recentAmbiguous >= 3) {
    const reply = "Let me check with Matt and get back to you.";
    await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone, reply);
    syslog.warn("classifier", `${firstName} has been unclear 3+ times — escalated to Matt`, `Escalated after ${recentAmbiguous} ambiguous replies`, { clientId: client.id });
  } else {
    const reply = await composeReply({
      firstName, history: historyWithReply,
      scenario: { type: "clarification" },
    });
    await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone, reply);
    syslog.info("classifier", `${firstName}'s reply was unclear — asked for clarification`, `Ambiguous reply (attempt ${recentAmbiguous + 1}/3): "${ctx.body}"`, { clientId: client.id });
  }
}
