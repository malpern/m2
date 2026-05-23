import { db } from "@/db";
import { outreach, clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

function twiml(message?: string): Response {
  const body = message
    ? `<Response><Message>${message}</Message></Response>`
    : "<Response/>";
  return new Response(body, {
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const from = formData.get("From") as string;
  const body = formData.get("Body") as string;

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
  if (lower === "start" || lower === "subscribe" || lower === "yes" && !await findClient(from)) {
    return twiml("M2 Performance: You're signed up for session scheduling texts. For help, reply HELP. To opt out, reply STOP. Msg & data rates may apply.");
  }

  // Normalize phone
  const normalized = from.replace(/\s/g, "");

  // Find the client
  const client = await findClient(normalized);

  if (client) {
    const recentOutreach = await db
      .select()
      .from(outreach)
      .where(eq(outreach.clientId, client.id))
      .all();

    const lastSent = recentOutreach
      .filter((o) => o.direction === "sent")
      .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""))[0];

    let interpretation: "confirmed" | "declined" | "reschedule_request" | "ambiguous" = "ambiguous";

    if (/^(yes|yeah|yep|yup|sure|sounds good|see you|perfect|ok|okay|i'm in|let's do it|confirmed|down|bet|absolutely|for sure|works for me|i'll be there)/i.test(lower)) {
      interpretation = "confirmed";
    } else if (/^(no|nah|can't|cant|not this week|pass|skip|i'm out|busy|won't make it)/i.test(lower)) {
      interpretation = "declined";
    } else if (/instead|different|switch|change|move|reschedule|how about|what about|can we do|another time|later/i.test(lower)) {
      interpretation = "reschedule_request";
    }

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
  const normalized = phone.replace(/\s/g, "");
  const allClients = await db.select().from(clients).all();
  return allClients.find((c) => {
    const clientPhone = c.phone.replace(/\s/g, "");
    return clientPhone === normalized
      || clientPhone === normalized.replace("+1", "")
      || `+1${clientPhone.replace(/\D/g, "")}` === normalized;
  }) ?? null;
}
