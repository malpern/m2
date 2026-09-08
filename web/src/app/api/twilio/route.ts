import { db } from "@/db";
import { interpretConsentReply, confirmedReply, declinedReply, keywordConfirmedReply, unknownNumberReply, helpReply, type ConsentStatus } from "@/lib/sms-consent";
import { recordReply, phoneStatus } from "@/lib/consent";
import { outreach, clients } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { NextRequest } from "next/server";
import { classifyReply, composeReply, ClassifyBillingError } from "@/lib/classify-reply";
import { getMonday } from "@/lib/scheduler";
import { syslog } from "@/lib/logger";
import { OUTREACH_HISTORY_LIMIT } from "@/lib/constants";
import twilio from "twilio";

/** Number shown in HELP / unknown-sender replies. Set BUSINESS_CONTACT_PHONE to override. */
const CONTACT_PHONE = process.env.BUSINESS_CONTACT_PHONE ?? "(408) 209-9509";
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
import { offerFreshAlternatives, recordInboundReply } from "@/lib/sms-handlers/shared";

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

  // Cache findClient so we only query once per request
  let cachedClient: Awaited<ReturnType<typeof findClient>> | undefined;
  const getClient = async () => {
    if (cachedClient === undefined) cachedClient = await findClient(from);
    return cachedClient;
  };

  // Carrier-level opt-out keywords. Twilio sends the opt-out reply itself, so
  // we answer with nothing — but we still RECORD it. Until this was added a
  // STOP left the app believing the client was confirmed, and our own record
  // of who declined is what stops us asking them again next month.
  if (lower === "stop" || lower === "unsubscribe" || lower === "cancel" || lower === "quit" || lower === "stopall") {
    const stopClient = await getClient();
    if (stopClient) {
      await recordReply({
        phone: stopClient.phone ?? from, clientId: stopClient.id,
        currentStatus: stopClient.smsConsentStatus as ConsentStatus,
        verdict: "decline", body, messageSid: params.MessageSid ?? null,
      });
      await syslog.info("twilio", `${stopClient.name} opted out of texts`,
        `Carrier STOP from client ${stopClient.id}`, { clientId: stopClient.id });
    } else if ((await phoneStatus(from)) !== "unknown") {
      // A parent's number, or a signup not yet matched to a client.
      await recordReply({ phone: from, clientId: null, currentStatus: await phoneStatus(from),
        verdict: "decline", body, messageSid: params.MessageSid ?? null });
    }
    return twiml();
  }

  if (lower === "stop invites" || lower === "stop calendar invites" || lower === "no more invites") {
    const inviteClient = await getClient();
    if (inviteClient) {
      await db.update(clients).set({ calendarInviteOptIn: false }).where(eq(clients.id, inviteClient.id)).run();
      return twiml("Got it — no more calendar invites. You'll still get scheduling texts.");
    }
    return twiml();
  }

  if (lower === "help" || lower === "info") {
    return twiml(helpReply(CONTACT_PHONE));
  }

  // Consent replies. The client is the only one who can opt in, and this is
  // where it happens: a YES to our verification text, or START/YES sent
  // unprompted by a client we already know. `recordReply` writes the event
  // (with the Twilio MessageSid as evidence) before touching the status.
  //
  // Placed ahead of the unknown-number handler below, which only talks.
  const consentClient = await getClient();
  if (consentClient) {
    const verdict = interpretConsentReply(body);
    if (verdict) {
      const result = await recordReply({
        phone: consentClient.phone ?? from, clientId: consentClient.id,
        currentStatus: consentClient.smsConsentStatus as ConsentStatus,
        verdict, body, messageSid: params.MessageSid ?? null,
      });
      if (result.outcome === "declined") {
        await syslog.info("twilio", `${consentClient.name} opted out of texts`,
          `Consent declined by reply from client ${consentClient.id}`, { clientId: consentClient.id });
        return twiml(declinedReply());
      }
      if (result.outcome === "confirmed") {
        await syslog.info("twilio", `${consentClient.name} confirmed texts`,
          `Consent confirmed by ${result.method} from client ${consentClient.id}`, { clientId: consentClient.id });
        return twiml(result.method === "sms_keyword" ? keywordConfirmedReply() : confirmedReply());
      }
      // "ignored": a bare "ok" from someone we never asked, or a repeat YES.
      // Fall through — it may be a scheduling reply.
    }
  } else {
    const verdict = interpretConsentReply(body);
    if (verdict) {
      // Not a client's number — but a parent's number that signed up on the
      // form has its own pending verification, and its YES or NO is recorded
      // against that number. Only a number with history counts; a stranger's
      // "yes" is not.
      const status = await phoneStatus(from);
      if (status !== "unknown") {
        const result = await recordReply({
          phone: from, clientId: null, currentStatus: status,
          verdict, body, messageSid: params.MessageSid ?? null,
        });
        if (result.outcome === "declined") return twiml(declinedReply());
        if (result.outcome === "confirmed") return twiml(confirmedReply());
      }
    }
    if (lower === "start" || lower === "subscribe" || lower === "yes" || lower === "unstop") {
      // Unknown number opting in: point at the form, store nothing. We never
      // create a client from an inbound text.
      return twiml(unknownNumberReply());
    }
  }

  const client = await getClient();

  if (!client) {
    return twiml(`This number is for M2 Performance scheduling. If you're a client, contact Matt at ${CONTACT_PHONE} to get set up.`);
  }

  const recentOutreach = await db
    .select()
    .from(outreach)
    .where(eq(outreach.clientId, client.id))
    .orderBy(desc(outreach.id))
    .limit(OUTREACH_HISTORY_LIMIT)
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
    await recordInboundReply(client.id, null, weekOf, body, "needs_matt");
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
          await recordInboundReply(client.id, lastSent.sessionId, weekOf, body, "needs_matt", { sendError: "ai_billing_exhausted" });
          return twiml();
        }
        throw e;
      }

      if (result.interpretation === "cancellation") {
        await handleConfirmedSessionCancellation(ctx);
        return twiml();
      }

      await recordInboundReply(client.id, lastSent.sessionId, weekOf, body, "needs_matt");
      return twiml("Hey! I'll pass this along to Matt and he'll get back to you.");
    }

    // Expired/moved-on — re-engage with fresh options
    await recordInboundReply(client.id, lastSent.sessionId, weekOf, body, "awaiting_reply");
    await offerFreshAlternatives(ctx, "re_engage", lastSent.sessionId);
    return twiml();
  }

  // No active outreach
  if (!lastSent || lastSent.status !== "awaiting_reply") {
    await recordInboundReply(client.id, null, weekOf, body, "needs_matt");
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
