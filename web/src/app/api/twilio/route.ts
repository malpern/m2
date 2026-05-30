import { db } from "@/db";
import { outreach, clients, sessions } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { NextRequest } from "next/server";
import { classifyReply, composeReply, ClassifyBillingError, type ConversationMessage } from "@/lib/classify-reply";
import { getOpenSlots, rankSlotsForClient, formatAlternativesMessage, diversifyAcrossDays, isSlotStillOpen, tagOfferedSlots, whySlotUnavailable } from "@/lib/suggest-alternatives";
import { sendSMS } from "@/lib/twilio";
import { getMonday } from "@/lib/scheduler";
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
    const hasActiveOutreach = lastSent && lastSent.status === "awaiting_reply";

    if (!hasActiveOutreach) {
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

    let result;
    try {
      result = await classifyReply(history, body);
    } catch (e) {
      if (e instanceof ClassifyBillingError) {
        await db.insert(outreach).values({
          clientId: client.id,
          sessionId: lastSent?.sessionId ?? null,
          weekOf: getMonday().toISOString().split("T")[0],
          direction: "received" as const,
          messageText: body,
          status: "needs_matt" as const,
          repliedAt: new Date().toISOString(),
          sendError: "ai_billing_exhausted",
        }).run();
        return twiml();
      }
      throw e;
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

    const firstName = client.name.split(" ")[0];
    const historyWithReply = [...history, { direction: "received" as const, text: body }];

    if (interpretation === "confirmed" && lastSent?.sessionId) {
      await db.update(sessions).set({ status: "confirmed" }).where(eq(sessions.id, lastSent.sessionId)).run();
      const session = await db.select().from(sessions).where(eq(sessions.id, lastSent.sessionId)).get();
      if (session) {
        const dayLabel = new Date(session.scheduledDate + "T12:00:00")
          .toLocaleDateString("en-US", { weekday: "long" });
        const reply = await composeReply({
          firstName,
          history: historyWithReply,
          scenario: { type: "confirmed", day: dayLabel, slot: session.slot },
        });
        await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, reply);
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

    if (interpretation === "declined_skip_week" && lastSent?.sessionId) {
      await db.update(sessions).set({ status: "cancelled" }).where(eq(sessions.id, lastSent.sessionId)).run();
      const reply = await composeReply({
        firstName,
        history: historyWithReply,
        scenario: { type: "skip_week" },
      });
      await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, reply);
      return twiml();
    }

    if (interpretation === "ambiguous") {
      const reply = "Let me check with Matt and get back to you.";
      await logAndSend(client.id, lastSent?.sessionId ?? null, weekOf, client.phone, reply);
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
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`Failed to send SMS to ${phone}:`, e);
    await db.update(outreach).set({
      status: "pending",
      sendError: errorMsg,
    }).where(eq(outreach.id, row.id)).run();
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
