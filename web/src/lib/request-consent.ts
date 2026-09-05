import { db } from "@/db";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendSMS } from "./twilio";
import { confirmationMessage, canSend, type ConsentStatus } from "./sms-consent";
import { syslog } from "./logger";

/**
 * Ask one client to confirm they want scheduling texts.
 *
 * The status only moves to `pending` when the message was ACTUALLY sent. An
 * earlier generation of this codebase recorded outreach as sent before knowing
 * whether it went out, and follow-ups then cancelled real sessions over
 * messages nobody received (#227). A client marked `pending` who was never
 * texted would be worse here — they would sit un-contactable forever, waiting
 * to reply to a question they never got.
 */
export type ConsentRequestResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string };

export async function requestSmsConsent(clientId: number): Promise<ConsentRequestResult> {
  const client = await db
    .select({
      id: clients.id,
      name: clients.name,
      phone: clients.phone,
      smsConsentStatus: clients.smsConsentStatus,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .get();

  if (!client) return { status: "skipped", reason: "no such client" };
  if (!client.phone) return { status: "skipped", reason: "no phone number on file" };

  const decision = canSend("consent_request", client.smsConsentStatus as ConsentStatus);
  if (!decision.allowed) return { status: "skipped", reason: decision.reason };

  const privacyUrl = process.env.PRIVACY_POLICY_URL ?? "m2scheduler.com/privacy";
  const result = await sendSMS(client.phone, confirmationMessage({ privacyUrl }), {
    purpose: "consent_request",
    consent: client.smsConsentStatus as ConsentStatus,
  });

  if (result.status !== "sent") {
    await syslog.warn("outreach", `Could not ask ${client.name} to confirm texts`,
      `Consent request skipped: ${result.reason}`, { clientId: client.id });
    return { status: "skipped", reason: result.reason };
  }

  await db.update(clients)
    .set({ smsConsentStatus: "pending", smsConsentMethod: "verbal_at_signup" })
    .where(eq(clients.id, client.id))
    .run();

  await syslog.info("outreach", `Asked ${client.name} to confirm texts`,
    `Consent request sent to client ${client.id}`, { clientId: client.id });

  return { status: "sent" };
}
