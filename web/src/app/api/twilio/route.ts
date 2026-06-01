import { db } from "@/db";
import { outreach, clients } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { NextRequest } from "next/server";
import { classifyReply, composeReply, ClassifyBillingError } from "@/lib/classify-reply";
import { getMonday } from "@/lib/scheduler";
import { syslog } from "@/lib/logger";
import twilio from "twilio";
import {
  findClient,
  logAndSend,
  buildConversationHistory,
  getGroupedSessionIds,
  isBalanceInquiry,
  handleBalanceInquiry,
  isCalendarInviteFlow,
  handleCalendarInviteFlow,
  handleConfirmedSessionCancellation,
  handleMultiSessionReply,
  handleSingleSessionReply,
  type WebhookContext,
} from "@/lib/sms-handlers";
import { offerFreshAlternatives } from "@/lib/sms-handlers/shared";

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
  try {
    return await handleWebhook(request);
  } catch (e) {
    syslog.error("webhook", "Webhook crashed — client got no reply", `Unhandled error: ${e instanceof Error ? e.message : String(e)}`, {
      metadata: { stack: e instanceof Error ? e.stack : undefined },
    });
    return twiml();
  }
}

async function handleWebhook(request: NextRequest): Promise<Response> {
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

  // Carrier-level opt-out keywords — Twilio handles these, just acknowledge
  if (lower === "stop" || lower === "unsubscribe" || lower === "cancel" || lower === "quit") {
    return twiml();
  }

  if (lower === "stop invites" || lower === "stop calendar invites" || lower === "no more invites") {
    const inviteClient = await findClient(from);
    if (inviteClient) {
      await db.update(clients).set({ calendarInviteOptIn: false }).where(eq(clients.id, inviteClient.id)).run();
      return twiml("Got it — no more calendar invites. You'll still get scheduling texts.");
    }
    return twiml();
  }

  if (lower === "help" || lower === "info") {
    return twiml(`M2 Performance & Therapy — session scheduling texts. Reply STOP to opt out. Contact: ${process.env.BUSINESS_CONTACT_PHONE ?? "(408) 599-1777"}`);
  }

  if (lower === "start" || lower === "subscribe" || (lower === "yes" && !await findClient(from))) {
    return twiml("M2 Performance: You're signed up for session scheduling texts. For help, reply HELP. To opt out, reply STOP. Msg & data rates may apply.");
  }

  const client = await findClient(from);

  if (!client) {
    return twiml(`This number is for M2 Performance scheduling. If you're a client, contact Matt at ${process.env.BUSINESS_CONTACT_PHONE ?? "(408) 599-1777"} to get set up.`);
  }

  const recentOutreach = await db
    .select()
    .from(outreach)
    .where(eq(outreach.clientId, client.id))
    .orderBy(desc(outreach.id))
    .limit(50)
    .all();

  const lastSent = recentOutreach
    .filter((o) => o.direction === "sent")
    .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""))[0];

  const weekOf = getMonday().toISOString().split("T")[0];
  const firstName = client.name.split(" ")[0];
  const history = buildConversationHistory(recentOutreach);

  const ctx: WebhookContext = { client, body, weekOf, firstName, lastSent, recentOutreach, history };

  // Balance inquiry — keyword match before classifier
  if (isBalanceInquiry(lower)) {
    await handleBalanceInquiry(ctx);
    return twiml();
  }

  // Late reply — outreach is from a previous week
  if (lastSent && lastSent.weekOf !== weekOf) {
    await db.insert(outreach).values({
      clientId: client.id, sessionId: null, weekOf,
      direction: "received" as const, messageText: body,
      status: "needs_matt" as const, repliedAt: new Date().toISOString(),
    }).run();
    const reply = await composeReply({
      firstName,
      history: [...history, { direction: "received" as const, text: body }],
      scenario: { type: "late_reply" },
    });
    await logAndSend(client.id, null, weekOf, client.phone, reply);
    return twiml();
  }

  // Re-engage after confirmed session cancellation or expired outreach
  if (lastSent && (lastSent.status === "expired" || lastSent.status === "confirmed")) {
    if (lastSent.status === "confirmed" && lastSent.sessionId) {
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
        await handleConfirmedSessionCancellation(ctx);
        return twiml();
      }

      await db.insert(outreach).values({
        clientId: client.id, sessionId: lastSent.sessionId, weekOf,
        direction: "received" as const, messageText: body,
        status: "needs_matt" as const, repliedAt: new Date().toISOString(),
      }).run();
      return twiml("Hey! I'll pass this along to Matt and he'll get back to you.");
    }

    // Expired/moved-on — re-engage with fresh options
    await db.insert(outreach).values({
      clientId: client.id, sessionId: lastSent.sessionId, weekOf,
      direction: "received" as const, messageText: body,
      status: "awaiting_reply" as const, repliedAt: new Date().toISOString(),
    }).run();
    await offerFreshAlternatives(ctx, "re_engage", lastSent.sessionId);
    return twiml();
  }

  // No active outreach
  if (!lastSent || lastSent.status !== "awaiting_reply") {
    await db.insert(outreach).values({
      clientId: client.id, sessionId: null, weekOf,
      direction: "received" as const, messageText: body,
      status: "needs_matt" as const, repliedAt: new Date().toISOString(),
    }).run();
    return twiml("Hey! I'll pass this along to Matt and he'll get back to you.");
  }

  // Calendar invite flow
  const lastSentText = (lastSent?.messageText ?? "").toLowerCase();
  if (isCalendarInviteFlow(lastSentText)) {
    const result = await handleCalendarInviteFlow(ctx);
    if (result === "handled") return twiml();
  }

  // Multi-session or single-session dispatch
  const outreachGroupId = lastSent?.outreachGroupId
    ?? recentOutreach.find((o) => o.direction === "sent" && o.outreachGroupId)?.outreachGroupId
    ?? null;
  const groupIds = await getGroupedSessionIds(outreachGroupId);
  const isMultiSession = groupIds && groupIds.length > 1;

  if (isMultiSession) {
    await handleMultiSessionReply(ctx, groupIds);
  } else {
    await handleSingleSessionReply(ctx);
  }

  return twiml();
}
