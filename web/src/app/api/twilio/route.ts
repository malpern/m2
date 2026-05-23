import { db } from "@/db";
import { outreach, clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const from = formData.get("From") as string;
  const body = formData.get("Body") as string;

  if (!from || !body) {
    return new Response("<Response/>", {
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Normalize phone: strip spaces, ensure +1 prefix
  const normalized = from.replace(/\s/g, "");

  // Find the client by phone number
  const allClients = await db.select().from(clients).all();
  const client = allClients.find((c) => {
    const clientPhone = c.phone.replace(/\s/g, "");
    return clientPhone === normalized
      || clientPhone === normalized.replace("+1", "")
      || `+1${clientPhone.replace(/\D/g, "")}` === normalized;
  });

  if (client) {
    // Find the most recent outreach sent to this client
    const recentOutreach = await db
      .select()
      .from(outreach)
      .where(eq(outreach.clientId, client.id))
      .all();

    const lastSent = recentOutreach
      .filter((o) => o.direction === "sent")
      .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""))[0];

    // Classify the reply using simple keyword matching
    // (Claude API classification can be added later)
    const lower = body.toLowerCase().trim();
    let interpretation: "confirmed" | "declined" | "reschedule_request" | "ambiguous" = "ambiguous";

    if (/^(yes|yeah|yep|yup|sure|sounds good|see you|perfect|ok|okay|i'm in|let's do it|confirmed|down|bet)/i.test(lower)) {
      interpretation = "confirmed";
    } else if (/^(no|nah|can't|cant|not this week|pass|skip|i'm out|busy)/i.test(lower)) {
      interpretation = "declined";
    } else if (/instead|different|switch|change|move|reschedule|how about|what about|can we do/i.test(lower)) {
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

  // Respond with empty TwiML (no auto-reply)
  return new Response("<Response/>", {
    headers: { "Content-Type": "text/xml" },
  });
}
