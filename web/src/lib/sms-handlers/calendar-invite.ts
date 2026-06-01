import { db } from "@/db";
import { clients, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAndSend, recordInboundReply, type WebhookContext } from "./shared";
import { syslog } from "@/lib/logger";

export function isCalendarInviteFlow(lastSentText: string): boolean {
  const lower = lastSentText.toLowerCase();
  return lower.includes("calendar invite") || lower.includes("email address");
}

export async function handleCalendarInviteFlow(ctx: WebhookContext): Promise<"handled" | "not_handled"> {
  const { client, body, weekOf, firstName, lastSent } = ctx;
  const lowerBody = body.toLowerCase().trim();
  const sessionId = lastSent?.sessionId ?? null;

  const emailMatch = body.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

  if (emailMatch) {
    const email = emailMatch[0].toLowerCase();
    if (email.length > 254 || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      await logAndSend(client.id, sessionId, weekOf, client.phone,
        "That doesn't look like a valid email. Could you double-check and send it again?");
      return "handled";
    }
    await db.update(clients).set({ email, calendarInviteOptIn: true }).where(eq(clients.id, client.id)).run();
    await recordInboundReply(client.id, sessionId, weekOf, body, "confirmed");

    if (lastSent?.sessionId) {
      await addAttendeeToEvent(lastSent.sessionId, email);
    }

    await logAndSend(client.id, sessionId, weekOf, client.phone,
      `Got it, ${email} — invite sent! You'll get calendar invites for future sessions too.`);
    syslog.info("outreach", `${firstName} opted in to calendar invites (${email})`, `Client ${client.id} email set to ${email}, calendarInviteOptIn=true`, { clientId: client.id });
    return "handled";
  }

  if (lowerBody === "no" || lowerBody === "nah" || lowerBody === "no thanks" || lowerBody.includes("don't") || lowerBody.includes("opt out")) {
    await db.update(clients).set({ calendarInviteOptIn: false }).where(eq(clients.id, client.id)).run();
    await recordInboundReply(client.id, sessionId, weekOf, body, "confirmed");
    await logAndSend(client.id, sessionId, weekOf, client.phone,
      "No problem! You won't get calendar invites.");
    return "handled";
  }

  if (lowerBody === "yes" || lowerBody === "yeah" || lowerBody === "sure" || lowerBody === "yep") {
    if (client.email) {
      await db.update(clients).set({ calendarInviteOptIn: true }).where(eq(clients.id, client.id)).run();
      await recordInboundReply(client.id, sessionId, weekOf, body, "confirmed");

      if (lastSent?.sessionId) {
        await addAttendeeToEvent(lastSent.sessionId, client.email);
      }

      await logAndSend(client.id, sessionId, weekOf, client.phone,
        `Invite sent to ${client.email}!`);
      return "handled";
    }

    await recordInboundReply(client.id, sessionId, weekOf, body, "awaiting_reply");
    await logAndSend(client.id, sessionId, weekOf, client.phone,
      "What's your email address?");
    return "handled";
  }

  return "not_handled";
}

async function addAttendeeToEvent(sessionId: number, email: string): Promise<void> {
  const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (session?.gcalEventId) {
    try {
      const { updateCalendarEventAttendee } = await import("@/lib/google-calendar");
      await updateCalendarEventAttendee(session.gcalEventId, email);
    } catch (e) {
      syslog.warn("system", "Failed to add attendee to calendar event", `updateCalendarEventAttendee failed for session ${sessionId}: ${e instanceof Error ? e.message : String(e)}`, { sessionId });
    }
  }
}
