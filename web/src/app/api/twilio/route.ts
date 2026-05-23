import { db } from "@/db";
import { outreach, clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { classifyReply } from "@/lib/classify-reply";
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
    const { interpretation } = await classifyReply(outreachMessage, body);

    await db.insert(outreach).values({
      clientId: client.id,
      sessionId: lastSent?.sessionId ?? null,
      weekOf: new Date().toISOString().split("T")[0],
      direction: "received",
      messageText: body,
      interpretation,
      status: interpretation === "confirmed" ? "confirmed"
        : interpretation === "declined" ? "expired"
        : "needs_matt",
      repliedAt: new Date().toISOString(),
    }).run();
  }

  return twiml();
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
