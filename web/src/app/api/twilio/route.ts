import { db } from "@/db";
import { outreach, clients, sessions } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { NextRequest } from "next/server";
import { classifyReply, classifyMultiSessionReply, composeReply, ClassifyBillingError, type ConversationMessage } from "@/lib/classify-reply";
import { getOpenSlots, rankSlotsForClient, formatAlternativesMessage, diversifyAcrossDays, isSlotStillOpen, tagOfferedSlots, whySlotUnavailable } from "@/lib/suggest-alternatives";
import { sendSMS } from "@/lib/twilio";
import { getMonday } from "@/lib/scheduler";
import { autoFillCancelledSlot } from "@/lib/auto-fill";
import { syslog } from "@/lib/logger";
import twilio from "twilio";

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function twiml(message?: string): Response {
  const body = message
    ? `<Response><Message>${escapeXml(message)}</Message></Response>`
    : "<Response/>";
  return new Response(body, {
    headers: { "Content-Type": "text/xml" },
  });
}

function verifyTwilioSignature(request: NextRequest, params: Record<string, string>): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;

  const signature = request.headers.get("x-twilio-signature") ?? "";
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://web-jet-mu-62.vercel.app"}/api/twilio`;

  return twilio.validateRequest(authToken, signature, url, params);
}

function stripOfferedTags(text: string): string {
  return text.replace(/\n?\[offered:[^\]]+\]/g, "").trim();
}

function buildConversationHistory(records: { direction: string; messageText: string; sentAt: string | null; repliedAt: string | null }[]): ConversationMessage[] {
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

function formatSlotsText(slots: { day: string; slot: string }[]): string {
  const DAY_LABELS: Record<string, string> = {
    monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
    thursday: "Thursday", friday: "Friday", sunday: "Sunday",
  };
  return slots.map((s) => `${DAY_LABELS[s.day] ?? s.day} at ${s.slot}`).join(", ");
}

async function getGroupedSessionIds(outreachGroupId: string | null): Promise<number[] | null> {
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

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => { params[key] = value.toString(); });

  if (!verifyTwilioSignature(request, params)) {
    return new Response("Forbidden", { status: 403 });
  }

  const from = params.From ?? "";
  const body = params.Body ?? "";

  if (!from || !body) return twiml();

  const lower = body.toLowerCase().trim();

  if (lower === "stop" || lower === "unsubscribe" || lower === "cancel" || lower === "quit") {
    return twiml();
  }

  if (lower === "help" || lower === "info") {
    return twiml("M2 Performance & Therapy — session scheduling texts. Reply STOP to opt out. Contact: (408) 599-1777");
  }

  if (lower === "start" || lower === "subscribe" || (lower === "yes" && !await findClient(from))) {
    return twiml("M2 Performance: You're signed up for session scheduling texts. For help, reply HELP. To opt out, reply STOP. Msg & data rates may apply.");
  }

  const client = await findClient(from);

  if (client) {
    const recentOutreach = await db
      .select()
      .from(outreach)
      .where(eq(outreach.clientId, client.id))
      .all();

    const lastSent = recentOutreach
      .filter((o) => o.direction === "sent")
      .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""))[0];

    const weekOf = getMonday().toISOString().split("T")[0];
    const firstName = client.name.split(" ")[0];

    // #59: Late reply — outreach is from a previous week
    if (lastSent && lastSent.weekOf !== weekOf) {
      await db.insert(outreach).values({
        clientId: client.id,
        sessionId: null,
        weekOf,
        direction: "received" as const,
        messageText: body,
        status: "needs_matt" as const,
        repliedAt: new Date().toISOString(),
      }).run();
      const history = buildConversationHistory(recentOutreach);
      const reply = await composeReply({
        firstName,
        history: [...history, { direction: "received" as const, text: body }],
        scenario: { type: "late_reply" },
      });
      await logAndSend(client.id, null, weekOf, client.phone, reply);
      return twiml();
    }

    // #62: Re-engage after move-on — outreach expired but client is replying
    if (lastSent && (lastSent.status === "expired" || lastSent.status === "confirmed")) {
      // Check if this is a cancellation of a confirmed session (#54)
      if (lastSent.status === "confirmed" && lastSent.sessionId) {
        const history = buildConversationHistory(recentOutreach);
        let result;
        try {
          result = await classifyReply(history, body);
        } catch (e) {
          if (e instanceof ClassifyBillingError) {
            await db.insert(outreach).values({
              clientId: client.id, sessionId: lastSent.sessionId, weekOf,
              direction: "received" as const, messageText: body,
              status: "needs_matt" as const, repliedAt: new Date().toISOString(),
              sendError: "ai_billing_exhausted",
            }).run();
            return twiml();
          }
          throw e;
        }

        if (result.interpretation === "cancellation") {
          await db.update(sessions).set({ status: "cancelled" }).where(eq(sessions.id, lastSent.sessionId)).run();
          const session = await db.select().from(sessions).where(eq(sessions.id, lastSent.sessionId)).get();
          const dayLabel = session ? new Date(session.scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" }) : "your session";
          const slot = session?.slot ?? "";

          await db.insert(outreach).values({
            clientId: client.id, sessionId: lastSent.sessionId, weekOf,
            direction: "received" as const, messageText: body,
            interpretation: "cancellation", status: "expired" as const,
            repliedAt: new Date().toISOString(),
          }).run();

          const reply = await composeReply({
            firstName,
            history: [...history, { direction: "received" as const, text: body }],
            scenario: { type: "cancellation", day: dayLabel, slot },
          });
          await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, reply);
          if (session) {
            autoFillCancelledSlot(session.scheduledDate, session.slot, client.id).catch(() => {});
          }
          return twiml();
        }

        // Not a cancellation — fall through to "pass along to Matt"
        await db.insert(outreach).values({
          clientId: client.id, sessionId: lastSent.sessionId, weekOf,
          direction: "received" as const, messageText: body,
          status: "needs_matt" as const, repliedAt: new Date().toISOString(),
        }).run();
        return twiml("Hey! I'll pass this along to Matt and he'll get back to you.");
      }

      // Expired/moved-on — try to re-engage
      await db.insert(outreach).values({
        clientId: client.id, sessionId: lastSent.sessionId, weekOf,
        direction: "received" as const, messageText: body,
        status: "awaiting_reply" as const, repliedAt: new Date().toISOString(),
      }).run();

      const open = await getOpenSlots(weekOf, client.id);
      const ranked = await rankSlotsForClient(client.id, open);
      const diverse = diversifyAcrossDays(ranked, 3);
      const history = buildConversationHistory(recentOutreach);
      const historyWithReply = [...history, { direction: "received" as const, text: body }];

      if (diverse.length > 0) {
        const altText = formatSlotsText(diverse);
        const reply = await composeReply({
          firstName, history: historyWithReply,
          scenario: { type: "re_engage", alternatives: altText },
        });
        const tagged = tagOfferedSlots(reply, diverse);
        await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, tagged);
      } else {
        const reply = await composeReply({
          firstName, history: historyWithReply,
          scenario: { type: "re_engage_full" },
        });
        await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, reply);
      }
      return twiml();
    }

    // No active outreach at all
    if (!lastSent || lastSent.status !== "awaiting_reply") {
      await db.insert(outreach).values({
        clientId: client.id,
        sessionId: null,
        weekOf,
        direction: "received" as const,
        messageText: body,
        status: "needs_matt" as const,
        repliedAt: new Date().toISOString(),
      }).run();
      return twiml("Hey! I'll pass this along to Matt and he'll get back to you.");
    }

    const history = buildConversationHistory(recentOutreach);

    const outreachGroupId = lastSent?.outreachGroupId
      ?? recentOutreach.find((o) => o.direction === "sent" && o.outreachGroupId)?.outreachGroupId
      ?? null;
    const groupIds = await getGroupedSessionIds(outreachGroupId);
    const isMultiSession = groupIds && groupIds.length > 1;

    if (isMultiSession) {
      const allGroupSessions = [];
      for (const sid of groupIds) {
        const s = await db.select().from(sessions).where(eq(sessions.id, sid)).get();
        if (s) allGroupSessions.push(s);
      }

      const pendingSessions = allGroupSessions.filter((s) => s.status === "proposed");
      const resolvedSessions = allGroupSessions.filter((s) => s.status === "confirmed" || s.status === "cancelled");

      if (pendingSessions.length > 0 && pendingSessions.length < allGroupSessions.length) {
        const lastSentText = lastSent?.messageText ?? "";
        const offeredMatch = lastSentText.match(/\[offered:([^\]]+)\]/);
        const offeredSlots = offeredMatch
          ? offeredMatch[1].split(",").map((s) => {
              const [date, slot] = s.split("|");
              const day = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" }).toLowerCase();
              return { date, slot, day };
            })
          : [];

        if (offeredSlots.length > 0) {
          const lower = body.toLowerCase().trim();
          let matchedSlots = offeredSlots.filter((s) => lower.includes(s.slot) || lower.includes(s.day.slice(0, 3)));

          if (matchedSlots.length === 0) {
            matchedSlots = offeredSlots.filter((s) => lower.includes(s.day));
          }

          const historyWithReply = [...history, { direction: "received" as const, text: body }];

          if (matchedSlots.length > 1) {
            const options = matchedSlots.map((s) => `${s.day.charAt(0).toUpperCase() + s.day.slice(1)} at ${s.slot}`).join(" or ");
            await db.insert(outreach).values({
              clientId: client.id, sessionId: lastSent?.sessionId ?? null, weekOf,
              direction: "received" as const, messageText: body,
              status: "awaiting_reply" as const, repliedAt: new Date().toISOString(),
            }).run();
            const reply = await composeReply({ firstName, history: historyWithReply, scenario: { type: "clarification" } });
            await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone, reply);
            return twiml();
          }

          if (matchedSlots.length === 1) {
            const picked = matchedSlots[0];
            const SLOT_TIMES: Record<string, string> = { "3pm": "15:00", "4pm": "16:00", "5pm": "17:00", "6pm": "18:00", "7pm": "19:00" };
            for (const ps of pendingSessions) {
              await db.update(sessions).set({
                scheduledDate: picked.date,
                scheduledTime: SLOT_TIMES[picked.slot] ?? "15:00",
                slot: picked.slot as "3pm" | "4pm" | "5pm" | "6pm" | "7pm",
                status: "confirmed",
              }).where(eq(sessions.id, ps.id)).run();
            }

            await db.insert(outreach).values({
              clientId: client.id, sessionId: lastSent?.sessionId ?? null, weekOf,
              direction: "received" as const, messageText: body,
              status: "confirmed" as const, repliedAt: new Date().toISOString(),
            }).run();

            const refreshed = [];
            for (const sid of groupIds) {
              const s = await db.select().from(sessions).where(eq(sessions.id, sid)).get();
              if (s) refreshed.push(s);
            }

            const finalParts: string[] = [];
            const conf = refreshed.filter((s) => s.status === "confirmed");
            const canc = refreshed.filter((s) => s.status === "cancelled");
            if (conf.length > 0) finalParts.push(`Confirmed: ${conf.map((s) => `${new Date(s.scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" })} at ${s.slot}`).join(", ")}.`);
            if (canc.length > 0) finalParts.push(`Cancelled: ${canc.map((s) => new Date(s.scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" })).join(", ")}.`);

            const reply = await composeReply({
              firstName, history: historyWithReply,
              scenario: { type: "multi_session_final", summary: `Here's your final schedule: ${finalParts.join(" ")}` },
            });
            await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone, reply);
            return twiml();
          }
        }

        // No offered slots or no match — use classifier for the follow-up
        let singleResult;
        try {
          singleResult = await classifyReply(history, body);
        } catch (e) {
          if (e instanceof ClassifyBillingError) throw e;
          singleResult = { interpretation: "ambiguous" as const, confidence: 0.3 };
        }

        if (singleResult.interpretation === "confirmed") {
          for (const ps of pendingSessions) {
            await db.update(sessions).set({ status: "confirmed" }).where(eq(sessions.id, ps.id)).run();
          }

          await db.insert(outreach).values({
            clientId: client.id, sessionId: lastSent?.sessionId ?? null, weekOf,
            direction: "received" as const, messageText: body,
            status: "confirmed" as const, repliedAt: new Date().toISOString(),
          }).run();

          const refreshed = [];
          for (const sid of groupIds) {
            const s = await db.select().from(sessions).where(eq(sessions.id, sid)).get();
            if (s) refreshed.push(s);
          }

          const finalParts: string[] = [];
          const conf = refreshed.filter((s) => s.status === "confirmed");
          const canc = refreshed.filter((s) => s.status === "cancelled");
          if (conf.length > 0) finalParts.push(`Confirmed: ${conf.map((s) => `${new Date(s.scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" })} at ${s.slot}`).join(", ")}.`);
          if (canc.length > 0) finalParts.push(`Cancelled: ${canc.map((s) => new Date(s.scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" })).join(", ")}.`);

          const historyWithReply = [...history, { direction: "received" as const, text: body }];
          const reply = await composeReply({
            firstName, history: historyWithReply,
            scenario: { type: "multi_session_final", summary: `Here's your final schedule: ${finalParts.join(" ")}` },
          });
          await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone, reply);
          return twiml();
        }
      }

      const offeredSessions = allGroupSessions.map((s) => ({
        day: new Date(s.scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" }).toLowerCase(),
        slot: s.slot,
      }));

      let multiResult;
      try {
        multiResult = await classifyMultiSessionReply(history, body, offeredSessions);
      } catch (e) {
        const errorType = e instanceof ClassifyBillingError ? "ai_billing_exhausted" : "ai_classify_error";
        await db.insert(outreach).values({
          clientId: client.id, sessionId: lastSent?.sessionId ?? null, weekOf,
          direction: "received" as const, messageText: body,
          status: "needs_matt" as const, repliedAt: new Date().toISOString(),
          sendError: errorType,
        }).run();
        syslog.error("classifier", `Couldn't understand ${firstName}'s reply — flagged for you`, `Multi-session classify failed: ${errorType}. Reply: "${body}"`, { clientId: client.id });
        await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone,
          "Let me check with Matt and get back to you.");
        return twiml();
      }

      await db.insert(outreach).values({
        clientId: client.id, sessionId: lastSent?.sessionId ?? null, weekOf,
        direction: "received" as const, messageText: body,
        status: "awaiting_reply" as const, repliedAt: new Date().toISOString(),
      }).run();

      const confirmed: string[] = [];
      const cancelled: string[] = [];
      const rescheduleNeeded: { session: typeof allGroupSessions[0]; requestedDay?: string; requestedTime?: string }[] = [];

      for (const action of multiResult.actions) {
        const matchedSession = allGroupSessions.find((s) => {
          const sDay = new Date(s.scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" }).toLowerCase();
          return sDay === action.day.toLowerCase();
        });

        if (!matchedSession) continue;

        const dayLabel = new Date(matchedSession.scheduledDate + "T12:00:00Z")
          .toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });

        if (action.action === "confirm") {
          await db.update(sessions).set({ status: "confirmed" }).where(eq(sessions.id, matchedSession.id)).run();
          confirmed.push(`${dayLabel} at ${matchedSession.slot}`);
        } else if (action.action === "cancel") {
          await db.update(sessions).set({ status: "cancelled" }).where(eq(sessions.id, matchedSession.id)).run();
          cancelled.push(`${dayLabel}`);
          autoFillCancelledSlot(matchedSession.scheduledDate, matchedSession.slot, client.id).catch(() => {});
        } else if (action.action === "reschedule") {
          rescheduleNeeded.push({ session: matchedSession, requestedDay: action.requestedDay, requestedTime: action.requestedTime });
        }
      }

      const pendingParts: string[] = [];
      let offeredAlternatives: { day: string; date: string; slot: string; time: string }[] = [];

      if (rescheduleNeeded.length > 0) {
        const open = await getOpenSlots(weekOf, client.id);
        for (const { session: rSession, requestedDay, requestedTime } of rescheduleNeeded) {
          const rDayLabel = new Date(rSession.scheduledDate + "T12:00:00Z")
            .toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });

          if (requestedDay || requestedTime) {
            const matched = open.find((s) =>
              (!requestedDay || s.day.startsWith(requestedDay.toLowerCase().slice(0, 3))) &&
              (!requestedTime || s.slot === requestedTime.toLowerCase())
            );

            if (matched && await isSlotStillOpen(matched.date, matched.time)) {
              await db.update(sessions).set({
                scheduledDate: matched.date, scheduledTime: matched.time,
                slot: matched.slot, status: "proposed",
              }).where(eq(sessions.id, rSession.id)).run();
              const mDayLabel = matched.day.charAt(0).toUpperCase() + matched.day.slice(1);
              pendingParts.push(`For ${rDayLabel}, how about ${mDayLabel} at ${matched.slot}?`);
              offeredAlternatives.push(matched);
            } else {
              const ranked = await rankSlotsForClient(client.id, open);
              const diverse = diversifyAcrossDays(ranked, 3);
              const altText = formatSlotsText(diverse);
              pendingParts.push(`For ${rDayLabel}, I don't have that time but I can do ${altText}.`);
              offeredAlternatives.push(...diverse);
            }
          } else {
            const ranked = await rankSlotsForClient(client.id, open);
            const diverse = diversifyAcrossDays(ranked, 3);
            const altText = formatSlotsText(diverse);
            pendingParts.push(`For ${rDayLabel}, I have ${altText} available.`);
            offeredAlternatives.push(...diverse);
          }
        }
      }

      const historyWithReply = [...history, { direction: "received" as const, text: body }];

      if (pendingParts.length > 0) {
        const intermediateParts: string[] = [];
        if (confirmed.length > 0) intermediateParts.push(`${confirmed.join(" and ")} — locked in.`);
        if (cancelled.length > 0) intermediateParts.push(`${cancelled.join(" and ")} — cancelled.`);
        intermediateParts.push(...pendingParts);

        const reply = await composeReply({
          firstName, history: historyWithReply,
          scenario: { type: "multi_session_update", summary: intermediateParts.join(" ") },
        });
        const tagged = offeredAlternatives.length > 0 ? tagOfferedSlots(reply, offeredAlternatives) : reply;
        await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone, tagged);
      } else {
        const allResolved = allGroupSessions.every((s) => {
          const current = confirmed.some((c) => c.includes(
            new Date(s.scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" })
          )) || cancelled.some((c) => c.includes(
            new Date(s.scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" })
          ));
          return current;
        });

        const finalParts: string[] = [];
        if (confirmed.length > 0) finalParts.push(`Confirmed: ${confirmed.join(", ")}.`);
        if (cancelled.length > 0) finalParts.push(`Cancelled: ${cancelled.join(", ")}.`);

        const scenario = allResolved
          ? { type: "multi_session_final" as const, summary: `Here's your final schedule: ${finalParts.join(" ")}` }
          : { type: "multi_session_update" as const, summary: finalParts.join(" ") };

        const reply = await composeReply({ firstName, history: historyWithReply, scenario });
        await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone, reply);
      }
      return twiml();
    }

    let result;
    try {
      result = await classifyReply(history, body);
    } catch (e) {
      const errorType = e instanceof ClassifyBillingError ? "ai_billing_exhausted" : "ai_classify_error";
      await db.insert(outreach).values({
        clientId: client.id,
        sessionId: lastSent?.sessionId ?? null,
        weekOf,
        direction: "received" as const,
        messageText: body,
        status: "needs_matt" as const,
        repliedAt: new Date().toISOString(),
        sendError: errorType,
      }).run();
      syslog.error("classifier", `Couldn't understand ${firstName}'s reply — flagged for you`, `Classify failed: ${errorType}. Reply: "${body}"`, { clientId: client.id });
      await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone,
        "Let me check with Matt and get back to you.");
      return twiml();
    }
    const interpretation = result.interpretation;

    type OutreachStatus = "pending" | "awaiting_reply" | "confirmed" | "needs_matt" | "expired";
    const statusMap: Record<string, OutreachStatus> = {
      confirmed: "confirmed",
      selecting_offered_slot: "confirmed",
      declined_skip_week: "expired",
      declined_wants_options: "needs_matt",
      declined_with_alternative: "needs_matt",
      reschedule_request: "needs_matt",
      cancellation: "expired",
      ambiguous: "needs_matt",
    };

    const replyRecord = await db.insert(outreach).values({
      clientId: client.id,
      sessionId: lastSent?.sessionId ?? null,
      weekOf: getMonday().toISOString().split("T")[0],
      direction: "received" as const,
      messageText: body,
      interpretation,
      status: statusMap[interpretation] ?? ("needs_matt" as OutreachStatus),
      repliedAt: new Date().toISOString(),
    }).returning().get();

    const historyWithReply = [...history, { direction: "received" as const, text: body }];

    if (interpretation === "confirmed") {
      const groupIds = await getGroupedSessionIds(lastSent?.outreachGroupId ?? null);
      const sidsToConfirm = groupIds ?? (lastSent?.sessionId ? [lastSent.sessionId] : []);

      for (const sid of sidsToConfirm) {
        await db.update(sessions).set({ status: "confirmed" }).where(eq(sessions.id, sid)).run();
      }

      if (sidsToConfirm.length > 0) {
        const confirmedSessions = [];
        for (const sid of sidsToConfirm) {
          const s = await db.select().from(sessions).where(eq(sessions.id, sid)).get();
          if (s) confirmedSessions.push(s);
        }

        if (confirmedSessions.length === 1) {
          const s = confirmedSessions[0];
          const dayLabel = new Date(s.scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });
          const reply = await composeReply({
            firstName, history: historyWithReply,
            scenario: { type: "confirmed", day: dayLabel, slot: s.slot },
          });
          await logAndSend(client.id, lastSent!.sessionId, weekOf, client.phone, reply);
        } else if (confirmedSessions.length > 1) {
          const sorted = confirmedSessions.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
          const slotList = sorted.map((s) => {
            const d = new Date(s.scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });
            return `${d} at ${s.slot}`;
          }).join(", ");
          const reply = await composeReply({
            firstName, history: historyWithReply,
            scenario: { type: "confirmed", day: slotList, slot: "" },
          });
          await logAndSend(client.id, lastSent!.sessionId, weekOf, client.phone, reply);
        } else {
          await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone,
            `You're confirmed, ${firstName}! See you then.`);
        }
      }
      return twiml();
    }

    if (interpretation === "selecting_offered_slot" && lastSent?.sessionId) {
      const session = await db.select().from(sessions).where(eq(sessions.id, lastSent.sessionId)).get();
      if (session) {
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

        if (matched && await isSlotStillOpen(matched.date, matched.time)) {
          await db.update(sessions).set({
            scheduledDate: matched.date,
            scheduledTime: matched.time,
            slot: matched.slot,
            status: "confirmed",
          }).where(eq(sessions.id, lastSent.sessionId)).run();
          await db.update(outreach).set({ status: "confirmed" }).where(eq(outreach.id, replyRecord.id)).run();

          const dayLabel = matched.day.charAt(0).toUpperCase() + matched.day.slice(1);
          const reply = await composeReply({
            firstName,
            history: historyWithReply,
            scenario: { type: "confirmed", day: dayLabel, slot: matched.slot },
          });
          await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, reply);
          return twiml();
        } else if (matched) {
          const stillOpen = await getOpenSlots(weekOf, client.id);
          const reRanked = await rankSlotsForClient(client.id, stillOpen);
          const diverse = diversifyAcrossDays(reRanked, 3);
          const altText = formatSlotsText(diverse);
          const reply = await composeReply({
            firstName,
            history: historyWithReply,
            scenario: { type: "slot_taken", alternatives: altText },
          });
          const tagged = tagOfferedSlots(reply, diverse);
          await db.update(outreach).set({ status: "awaiting_reply" }).where(eq(outreach.id, replyRecord.id)).run();
          await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, tagged);
          return twiml();
        }
      }
    }

    if ((interpretation === "declined_wants_options" ||
         interpretation === "declined_with_alternative" ||
         interpretation === "reschedule_request") && lastSent?.sessionId) {

      const groupIds = await getGroupedSessionIds(lastSent.outreachGroupId ?? null);

      if (groupIds && groupIds.length > 1 && result.extractedDay) {
        const allGroupSessions = [];
        for (const sid of groupIds) {
          const s = await db.select().from(sessions).where(eq(sessions.id, sid)).get();
          if (s) allGroupSessions.push(s);
        }

        const rejectedDay = result.extractedDay.toLowerCase().slice(0, 3);
        const rejected = allGroupSessions.filter((s) => {
          const d = new Date(s.scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" }).toLowerCase();
          return d.startsWith(rejectedDay);
        });
        const accepted = allGroupSessions.filter((s) => !rejected.includes(s));

        if (rejected.length > 0 && accepted.length > 0) {
          for (const s of accepted) {
            await db.update(sessions).set({ status: "confirmed" }).where(eq(sessions.id, s.id)).run();
          }
          await db.update(outreach).set({ status: "awaiting_reply" }).where(eq(outreach.id, replyRecord.id)).run();

          const confirmedList = accepted.map((s) => {
            const d = new Date(s.scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });
            return `${d} at ${s.slot}`;
          }).join(" and ");

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
          await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, tagged);
          return twiml();
        }
      }

      const open = await getOpenSlots(weekOf, client.id);

      if (result.extractedDay || result.extractedTime) {
        const matched = open.find((s) =>
          (!result.extractedDay || s.day.startsWith(result.extractedDay.toLowerCase().slice(0, 3))) &&
          (!result.extractedTime || s.slot === result.extractedTime.toLowerCase())
        );

        if (matched && await isSlotStillOpen(matched.date, matched.time)) {
          await db.update(sessions).set({
            scheduledDate: matched.date,
            scheduledTime: matched.time,
            slot: matched.slot,
            status: "proposed",
          }).where(eq(sessions.id, lastSent.sessionId)).run();
          await db.update(outreach).set({ status: "awaiting_reply" }).where(eq(outreach.id, replyRecord.id)).run();

          const dayLabel = matched.day.charAt(0).toUpperCase() + matched.day.slice(1);
          const reply = await composeReply({
            firstName,
            history: historyWithReply,
            scenario: { type: "counter_offer", day: dayLabel, slot: matched.slot },
          });
          const tagged = tagOfferedSlots(reply, [matched]);
          await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, tagged);
          return twiml();
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
          firstName,
          history: historyWithReply,
          scenario: { type: scenarioType, requestLabel, alternatives: altText },
        });
        const tagged = tagOfferedSlots(reply, diverse);
        await db.update(outreach).set({ status: "awaiting_reply" }).where(eq(outreach.id, replyRecord.id)).run();
        await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, tagged);
        return twiml();
      }

      const ranked = await rankSlotsForClient(client.id, open);
      const diverse = diversifyAcrossDays(ranked, 3);
      const altText = formatSlotsText(diverse);
      const reply = await composeReply({
        firstName,
        history: historyWithReply,
        scenario: { type: "alternatives", alternatives: altText },
      });
      const tagged = tagOfferedSlots(reply, diverse);
      await db.update(outreach).set({ status: "awaiting_reply" }).where(eq(outreach.id, replyRecord.id)).run();
      await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, tagged);
      return twiml();
    }

    if (interpretation === "declined_skip_week") {
      const groupIds = await getGroupedSessionIds(lastSent?.outreachGroupId ?? null);
      const sidsToCancel = groupIds ?? (lastSent?.sessionId ? [lastSent.sessionId] : []);
      const cancelledSlots: { date: string; slot: string; clientId: number }[] = [];
      for (const sid of sidsToCancel) {
        const s = await db.select().from(sessions).where(eq(sessions.id, sid)).get();
        await db.update(sessions).set({ status: "cancelled" }).where(eq(sessions.id, sid)).run();
        if (s) cancelledSlots.push({ date: s.scheduledDate, slot: s.slot, clientId: client.id });
      }
      const reply = await composeReply({
        firstName,
        history: historyWithReply,
        scenario: { type: "skip_week" },
      });
      await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone, reply);
      for (const cs of cancelledSlots) {
        autoFillCancelledSlot(cs.date, cs.slot, cs.clientId).catch(() => {});
      }
      return twiml();
    }

    if (interpretation === "cancellation") {
      const groupIds = await getGroupedSessionIds(lastSent?.outreachGroupId ?? null);
      const sidsToCancel = groupIds ?? (lastSent?.sessionId ? [lastSent.sessionId] : []);
      const cancelledSlots: { date: string; slot: string; clientId: number }[] = [];
      for (const sid of sidsToCancel) {
        const s = await db.select().from(sessions).where(eq(sessions.id, sid)).get();
        await db.update(sessions).set({ status: "cancelled" }).where(eq(sessions.id, sid)).run();
        if (s) cancelledSlots.push({ date: s.scheduledDate, slot: s.slot, clientId: client.id });
      }
      const session = cancelledSlots[0];
      const dayLabel = session ? new Date(session.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" }) : "your session";
      const reply = await composeReply({
        firstName,
        history: historyWithReply,
        scenario: { type: "cancellation", day: dayLabel, slot: session?.slot ?? "" },
      });
      await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone, reply);
      for (const cs of cancelledSlots) {
        autoFillCancelledSlot(cs.date, cs.slot, cs.clientId).catch(() => {});
      }
      return twiml();
    }

    if (interpretation === "ambiguous") {
      const recentAmbiguous = recentOutreach.filter(
        (o) => o.direction === "received" && o.interpretation === "ambiguous"
      ).length;

      if (recentAmbiguous >= 3) {
        const reply = "Let me check with Matt and get back to you.";
        await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone, reply);
        syslog.warn("classifier", `${firstName} has been unclear 3+ times — escalated to Matt`, `Escalated after ${recentAmbiguous} ambiguous replies`, { clientId: client.id });
      } else {
        const reply = await composeReply({
          firstName,
          history: historyWithReply,
          scenario: { type: "clarification" },
        });
        await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone, reply);
        syslog.info("classifier", `${firstName}'s reply was unclear — asked for clarification`, `Ambiguous reply (attempt ${recentAmbiguous + 1}/3): "${body}"`, { clientId: client.id });
      }
      return twiml();
    }
  }

  if (!client) {
    return twiml("This number is for M2 Performance scheduling. If you're a client, contact Matt at (408) 599-1777 to get set up.");
  }

  return twiml();
}

async function logAndSend(clientId: number, sessionId: number | null, weekOf: string, phone: string, message: string) {
  const row = await db.insert(outreach).values({
    clientId,
    sessionId,
    weekOf,
    direction: "sent",
    messageText: message,
    status: "awaiting_reply",
    sentAt: new Date().toISOString(),
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

async function findClient(phone: string) {
  const normalized = phone.replace(/^whatsapp:/i, "").replace(/\s/g, "");
  const digits = normalized.replace(/\D/g, "");
  const allClients = await db.select().from(clients).all();
  return allClients.find((c) => {
    const clientDigits = c.phone.replace(/\D/g, "");
    return clientDigits.slice(-10) === digits.slice(-10);
  }) ?? null;
}
