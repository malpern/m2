import { db } from "@/db";
import { outreach, sessions } from "@/db/schema";
import type { Session } from "@/db/schema";
import { eq } from "drizzle-orm";
import { classifyMultiSessionReply, composeReply, ClassifyBillingError } from "@/lib/classify-reply";
import { getOpenSlots, rankSlotsForClient, diversifyAcrossDays, isSlotStillOpen, tryBookSlot, tagOfferedSlots } from "@/lib/suggest-alternatives";
import { getInvitePrompt } from "@/lib/invite-prompt";
import { syslog } from "@/lib/logger";
import { capitalize, ESCALATION_MESSAGE } from "@/lib/constants";
import {
  SLOT_TIMES_MAP,
  logAndSend,
  formatSlotsText,
  getDayLabel,
  offerFreshAlternatives,
  safeSyncCalendar,
  safeCreditCancellation,
  safeAutoFill,
  recordInboundReply,
  type WebhookContext,
} from "./shared";

export async function handleMultiSessionReply(
  ctx: WebhookContext,
  groupIds: number[],
): Promise<void> {
  const { client, body, weekOf, firstName, lastSent, history } = ctx;
  const sessionId = lastSent?.sessionId ?? null;

  const allGroupSessions: Session[] = [];
  for (const sid of groupIds) {
    const s = await db.select().from(sessions).where(eq(sessions.id, sid)).get();
    if (s) allGroupSessions.push(s);
  }

  const pendingSessions = allGroupSessions.filter((s) => s.status === "proposed");

  if (pendingSessions.length > 0 && pendingSessions.length < allGroupSessions.length) {
    const result = await handlePartialResolution(ctx, groupIds, allGroupSessions, pendingSessions);
    if (result === "handled") return;
  }

  await handleFullMultiSession(ctx, groupIds, allGroupSessions);
}

async function handlePartialResolution(
  ctx: WebhookContext,
  groupIds: number[],
  allGroupSessions: Session[],
  pendingSessions: Session[],
): Promise<"handled" | "fall_through"> {
  const { client, body, weekOf, firstName, lastSent, history } = ctx;
  const sessionId = lastSent?.sessionId ?? null;
  const historyWithReply = [...history, { direction: "received" as const, text: body }];

  const lastSentText = lastSent?.messageText ?? "";
  const offeredMatch = lastSentText.match(/\[offered:([^\]]+)\]/);
  const parsedOfferedSlots = offeredMatch
    ? offeredMatch[1].split(",").map((s) => {
        const [date, slot] = s.split("|");
        const day = getDayLabel(date).toLowerCase();
        return { date, slot, day };
      })
    : [];

  const offeredSlots: typeof parsedOfferedSlots = [];
  for (const slot of parsedOfferedSlots) {
    const time = SLOT_TIMES_MAP[slot.slot];
    if (time && await isSlotStillOpen(slot.date, time)) {
      offeredSlots.push(slot);
    }
  }

  if (offeredSlots.length === 0 && parsedOfferedSlots.length > 0) {
    await recordInboundReply(client.id, sessionId, weekOf, body, "awaiting_reply");
    await offerFreshAlternatives(ctx, "slot_taken", sessionId);
    return "handled";
  }

  if (offeredSlots.length > 0) {
    const lower = body.toLowerCase().trim();
    let matchedSlots = offeredSlots.filter((s) => lower.includes(s.slot) || lower.includes(s.day.slice(0, 3)));
    if (matchedSlots.length === 0) {
      matchedSlots = offeredSlots.filter((s) => lower.includes(s.day));
    }

    if (matchedSlots.length === 0) {
      const matchedStale = parsedOfferedSlots.filter((s) => lower.includes(s.slot) || lower.includes(s.day.slice(0, 3)) || lower.includes(s.day));
      if (matchedStale.length > 0) {
        await db.insert(outreach).values({
          clientId: client.id, sessionId, weekOf,
          direction: "received" as const, messageText: body,
          status: "awaiting_reply" as const, repliedAt: new Date().toISOString(),
        }).run();
        await offerFreshAlternatives(ctx, "slot_taken", sessionId);
        return "handled";
      }
    }

    if (matchedSlots.length > 1) {
      await recordInboundReply(client.id, sessionId, weekOf, body, "awaiting_reply");
      const reply = await composeReply({ firstName, history: historyWithReply, scenario: { type: "clarification" } });
      await logAndSend(client.id, sessionId, weekOf, client.phone, reply);
      return "handled";
    }

    if (matchedSlots.length === 1) {
      const picked = matchedSlots[0];
      const sessionToMove = pendingSessions[0];
      const origDay = getDayLabel(sessionToMove.scheduledDate);

      await db.update(sessions).set({
        scheduledDate: picked.date,
        scheduledTime: SLOT_TIMES_MAP[picked.slot] ?? "15:00",
        slot: picked.slot as "3pm" | "4pm" | "5pm" | "6pm" | "7pm",
        status: "confirmed",
      }).where(eq(sessions.id, sessionToMove.id)).run();
      safeSyncCalendar(sessionToMove.id);

      await recordInboundReply(client.id, sessionId, weekOf, body, "confirmed");

      const refreshed = await refreshGroupSessions(groupIds);
      const summaryLines = buildSessionSummary(refreshed, [origDay], pendingSessions);

      let reply = await composeReply({
        firstName, history: historyWithReply,
        scenario: { type: "multi_session_final", summary: `Final schedule: ${summaryLines.join(". ")}.` },
      });
      const invitePrompt = await getInvitePrompt(client.id);
      if (invitePrompt) reply += invitePrompt;
      await logAndSend(client.id, sessionId, weekOf, client.phone, reply);
      return "handled";
    }
  }

  const pendingOffered = pendingSessions.map((s) => ({
    day: getDayLabel(s.scheduledDate).toLowerCase(),
    slot: s.slot,
  }));
  let pendingResult;
  try {
    pendingResult = await classifyMultiSessionReply(history, body, pendingOffered);
  } catch (e) {
    if (e instanceof ClassifyBillingError) throw e;
    pendingResult = null;
  }

  if (pendingResult && pendingResult.actions.every((a) => a.action === "confirm")) {
    for (const ps of pendingSessions) {
      await db.update(sessions).set({ status: "confirmed" }).where(eq(sessions.id, ps.id)).run();
      safeSyncCalendar(ps.id);
    }

    await recordInboundReply(client.id, sessionId, weekOf, body, "confirmed");

    const refreshed = await refreshGroupSessions(groupIds);
    const finalParts = buildFinalSummary(refreshed);

    let reply = await composeReply({
      firstName, history: historyWithReply,
      scenario: { type: "multi_session_final", summary: `Here's your final schedule: ${finalParts.join(" ")}` },
    });
    const invitePrompt = await getInvitePrompt(client.id);
    if (invitePrompt) reply += invitePrompt;
    await logAndSend(client.id, sessionId, weekOf, client.phone, reply);
    return "handled";
  }

  return "fall_through";
}

async function handleFullMultiSession(
  ctx: WebhookContext,
  groupIds: number[],
  allGroupSessions: Session[],
): Promise<void> {
  const { client, body, weekOf, firstName, lastSent, history } = ctx;
  const sessionId = lastSent?.sessionId ?? null;

  const offeredSessions = allGroupSessions.map((s) => ({
    day: getDayLabel(s.scheduledDate).toLowerCase(),
    slot: s.slot,
  }));

  let multiResult;
  try {
    multiResult = await classifyMultiSessionReply(history, body, offeredSessions);
  } catch (e) {
    const errorType = e instanceof ClassifyBillingError ? "ai_billing_exhausted" : "ai_classify_error";
    await recordInboundReply(client.id, sessionId, weekOf, body, "needs_matt", { sendError: errorType });
    syslog.error("classifier", `Couldn't understand ${firstName}'s reply — flagged for you`, `Multi-session classify failed: ${errorType}. Reply: "${body}"`, { clientId: client.id });
    await logAndSend(client.id, sessionId, weekOf, client.phone, ESCALATION_MESSAGE);
    return;
  }

  await recordInboundReply(client.id, sessionId, weekOf, body, "awaiting_reply");

  const sessionOutcomes: { originalDay: string; originalSlot: string; result: string; sessionId: number }[] = [];
  const cancelledDays = new Set<string>();
  const rescheduleNeeded: { session: Session; originalDay: string; requestedDay?: string; requestedTime?: string }[] = [];

  for (const action of multiResult.actions) {
    const actionDay = action.day.toLowerCase().slice(0, 3);
    const matchedSession = allGroupSessions.find((s) => {
      const sDay = getDayLabel(s.scheduledDate).toLowerCase();
      return sDay === action.day.toLowerCase() || sDay.startsWith(actionDay);
    });

    if (!matchedSession) {
      syslog.warn("classifier", `Multi-session action couldn't match a session`, `Action day "${action.day}" (${action.action}) didn't match any session for client ${client.id}`, { clientId: client.id });
      continue;
    }

    const dayLabel = getDayLabel(matchedSession.scheduledDate);

    if (action.action === "confirm") {
      await db.update(sessions).set({ status: "confirmed" }).where(eq(sessions.id, matchedSession.id)).run();
      safeSyncCalendar(matchedSession.id);
      sessionOutcomes.push({ originalDay: dayLabel, originalSlot: matchedSession.slot, result: `${dayLabel} at ${matchedSession.slot} — confirmed`, sessionId: matchedSession.id });
    } else if (action.action === "cancel") {
      await db.update(sessions).set({ status: "cancelled" }).where(eq(sessions.id, matchedSession.id)).run();
      safeCreditCancellation(matchedSession.id);
      safeSyncCalendar(matchedSession.id);
      cancelledDays.add(dayLabel.toLowerCase());
      sessionOutcomes.push({ originalDay: dayLabel, originalSlot: matchedSession.slot, result: `${dayLabel} — cancelled`, sessionId: matchedSession.id });
      safeAutoFill(matchedSession.scheduledDate, matchedSession.slot, client.id);
    } else if (action.action === "reschedule") {
      rescheduleNeeded.push({ session: matchedSession, originalDay: dayLabel, requestedDay: action.requestedDay, requestedTime: action.requestedTime });
    }
  }

  const pendingParts: string[] = [];
  const offeredAlternatives: { day: string; date: string; slot: string; time: string }[] = [];

  if (rescheduleNeeded.length > 0) {
    const open = await getOpenSlots(weekOf, client.id);
    const filteredOpen = open.filter((s) => !cancelledDays.has(s.day));

    for (const { session: rSession, originalDay, requestedDay, requestedTime } of rescheduleNeeded) {
      if (requestedDay || requestedTime) {
        const matched = filteredOpen.find((s) =>
          (!requestedDay || s.day.startsWith(requestedDay.toLowerCase().slice(0, 3))) &&
          (!requestedTime || s.slot === requestedTime.toLowerCase())
        );

        if (matched && await tryBookSlot(rSession.id, matched.date, matched.time, matched.slot, "proposed")) {
          const mDayLabel = capitalize(matched.day);
          pendingParts.push(`For ${originalDay}, how about ${mDayLabel} at ${matched.slot}?`);
          offeredAlternatives.push(matched);
        } else {
          const ranked = await rankSlotsForClient(client.id, filteredOpen);
          const diverse = diversifyAcrossDays(ranked, 3);
          const altText = formatSlotsText(diverse);
          pendingParts.push(`For ${originalDay}, I don't have that time but I can do ${altText}.`);
          offeredAlternatives.push(...diverse);
        }
      } else {
        const ranked = await rankSlotsForClient(client.id, filteredOpen);
        const diverse = diversifyAcrossDays(ranked, 3);
        const altText = formatSlotsText(diverse);
        pendingParts.push(`For ${originalDay}, I have ${altText} available.`);
        offeredAlternatives.push(...diverse);
      }
    }
  }

  const historyWithReply = [...history, { direction: "received" as const, text: body }];

  if (pendingParts.length > 0) {
    const intermediateParts: string[] = [];
    const confirmed = sessionOutcomes.filter((o) => o.result.includes("confirmed"));
    const cancelled = sessionOutcomes.filter((o) => o.result.includes("cancelled"));
    if (confirmed.length > 0) intermediateParts.push(`${confirmed.map((o) => `${o.originalDay} at ${o.originalSlot}`).join(" and ")} — locked in.`);
    if (cancelled.length > 0) intermediateParts.push(`${cancelled.map((o) => o.originalDay).join(" and ")} — cancelled.`);
    intermediateParts.push(...pendingParts);

    const reply = await composeReply({
      firstName, history: historyWithReply,
      scenario: { type: "multi_session_update", summary: intermediateParts.join(" ") },
    });
    const tagged = offeredAlternatives.length > 0 ? tagOfferedSlots(reply, offeredAlternatives) : reply;
    await logAndSend(client.id, sessionId, weekOf, client.phone, tagged);
  } else {
    const summaryText = sessionOutcomes.map((o) => o.result).join(". ") + ".";
    let reply = await composeReply({
      firstName, history: historyWithReply,
      scenario: { type: "multi_session_final", summary: `Final schedule: ${summaryText}` },
    });
    const invitePrompt = await getInvitePrompt(client.id);
    if (invitePrompt) reply += invitePrompt;
    await logAndSend(client.id, sessionId, weekOf, client.phone, reply);
  }
}

async function refreshGroupSessions(groupIds: number[]): Promise<Session[]> {
  const refreshed: Session[] = [];
  for (const sid of groupIds) {
    const s = await db.select().from(sessions).where(eq(sessions.id, sid)).get();
    if (s) refreshed.push(s);
  }
  return refreshed;
}

function buildSessionSummary(
  refreshed: Session[],
  rescheduledFrom: string[],
  pendingSessions: Session[],
): string[] {
  const summaryLines: string[] = [];
  for (const s of refreshed) {
    const sDay = getDayLabel(s.scheduledDate);
    if (s.status === "confirmed") {
      if (rescheduledFrom.length > 0 && rescheduledFrom[0] !== sDay) {
        summaryLines.push(`${rescheduledFrom[0]} moved to ${sDay} at ${s.slot}`);
      } else {
        summaryLines.push(`${sDay} at ${s.slot} — confirmed`);
      }
    } else if (s.status === "cancelled") {
      summaryLines.push(`${sDay} — cancelled`);
    }
  }
  return summaryLines;
}

function buildFinalSummary(refreshed: Session[]): string[] {
  const finalParts: string[] = [];
  const conf = refreshed.filter((s) => s.status === "confirmed");
  const canc = refreshed.filter((s) => s.status === "cancelled");
  if (conf.length > 0) finalParts.push(`Confirmed: ${conf.map((s) => `${getDayLabel(s.scheduledDate)} at ${s.slot}`).join(", ")}.`);
  if (canc.length > 0) finalParts.push(`Cancelled: ${canc.map((s) => getDayLabel(s.scheduledDate)).join(", ")}.`);
  return finalParts;
}
