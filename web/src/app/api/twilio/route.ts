import { db } from "@/db";
import { outreach, clients, sessions } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { NextRequest } from "next/server";
import { classifyReply, ClassifyBillingError, type ReplyInterpretation } from "@/lib/classify-reply";
import { getOpenSlots, rankSlotsForClient, formatAlternativesMessage, isSlotStillOpen, tagOfferedSlots } from "@/lib/suggest-alternatives";
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

  // Handle STOP — Twilio handles opt-out automatically, but log it
  if (lower === "stop" || lower === "unsubscribe" || lower === "cancel" || lower === "quit") {
    return twiml();
  }

  // Handle HELP
  if (lower === "help" || lower === "info") {
    return twiml("M2 Performance & Therapy — session scheduling texts. Reply STOP to opt out. Contact: (408) 599-1777");
  }

  // Handle START / opt-in
  if (lower === "start" || lower === "subscribe" || (lower === "yes" && !await findClient(from))) {
    return twiml("M2 Performance: You're signed up for session scheduling texts. For help, reply HELP. To opt out, reply STOP. Msg & data rates may apply.");
  }

  // Find the client
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

    const outreachMessage = lastSent?.messageText ?? "";
    let result;
    try {
      result = await classifyReply(outreachMessage, body);
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

    await db.insert(outreach).values({
      clientId: client.id,
      sessionId: lastSent?.sessionId ?? null,
      weekOf: getMonday().toISOString().split("T")[0],
      direction: "received" as const,
      messageText: body,
      interpretation,
      status: statusMap[interpretation] ?? ("needs_matt" as OutreachStatus),
      repliedAt: new Date().toISOString(),
    }).run();

    const firstName = client.name.split(" ")[0];
    const weekOf = getMonday().toISOString().split("T")[0];

    if (interpretation === "confirmed" && lastSent?.sessionId) {
      await db.update(sessions).set({ status: "confirmed" }).where(eq(sessions.id, lastSent.sessionId)).run();
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

          const dayLabel = matched.day.charAt(0).toUpperCase() + matched.day.slice(1);
          const reply = `${dayLabel} at ${matched.slot} — you're confirmed! See you then.`;
          await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, reply);
          return twiml();
        } else if (matched) {
          const stillOpen = await getOpenSlots(weekOf, client.id);
          const reRanked = await rankSlotsForClient(client.id, stillOpen);
          const msg = `Sorry, that slot just got booked! ${formatAlternativesMessage(firstName, reRanked)}`;
          const reply = tagOfferedSlots(msg, reRanked.slice(0, 3));
          await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, reply);
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

          const dayLabel = matched.day.charAt(0).toUpperCase() + matched.day.slice(1);
          const msg = `I have ${dayLabel} at ${matched.slot} open — does that work?`;
          const reply = tagOfferedSlots(msg, [matched]);
          await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, reply);
          return twiml();
        }

        const requestedDay = result.extractedDay ? result.extractedDay.charAt(0).toUpperCase() + result.extractedDay.slice(1) : null;
        const requestedTime = result.extractedTime ?? null;
        const requestLabel = [requestedDay, requestedTime].filter(Boolean).join(" at ");

        const ranked = await rankSlotsForClient(client.id, open);
        const msg = `Sorry, ${requestLabel} isn't available this week.\n\n${formatAlternativesMessage(firstName, ranked)}`;
        const reply = tagOfferedSlots(msg, ranked.slice(0, 3));
        await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, reply);
        return twiml();
      }

      const ranked = await rankSlotsForClient(client.id, open);
      const msg = formatAlternativesMessage(firstName, ranked);
      const reply = tagOfferedSlots(msg, ranked.slice(0, 3));
      await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, reply);
      return twiml();
    }

    if (interpretation === "declined_skip_week" && lastSent?.sessionId) {
      await db.update(sessions).set({ status: "cancelled" }).where(eq(sessions.id, lastSent.sessionId)).run();
      const reply = `No problem, ${firstName}. We'll get you in next week!`;
      await logAndSend(client.id, lastSent.sessionId, weekOf, client.phone, reply);
      return twiml();
    }
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
  // Strip whatsapp: prefix and whitespace
  const normalized = phone.replace(/^whatsapp:/i, "").replace(/\s/g, "");
  const digits = normalized.replace(/\D/g, "");
  const allClients = await db.select().from(clients).all();
  return allClients.find((c) => {
    const clientDigits = c.phone.replace(/\D/g, "");
    // Match on last 10 digits to handle +1 prefix variations
    return clientDigits.slice(-10) === digits.slice(-10);
  }) ?? null;
}
