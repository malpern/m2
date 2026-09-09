/**
 * Consent for text messaging: the record behind the gate.
 *
 * `sms-consent.ts` decides whether a message may go out given a status.
 * `outreach-policy.ts` decides whether an address may be contacted at all.
 * This module is where that status COMES FROM. Every transition writes a row
 * to `consent_events` first and only then touches `clients.sms_consent_*`, so
 * the fast columns the send gate reads are always explained by an event a
 * reviewer can inspect.
 *
 * Nobody opts a client in on their behalf. The two ways in are the public
 * signup form followed by a YES from the client's own phone, and a client
 * texting START or YES to us unprompted. Everything Matt can do here is
 * downward or sideways: mark someone out, link a signup to a client, change a
 * number (which resets consent). There is deliberately no function that sets
 * `confirmed` from a form field.
 */
import { db } from "@/db";
import { clients, consentEvents, type ConsentEvent } from "@/db/schema";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { sendSMS } from "./twilio";
import { canSend, confirmationMessage, CONSENT_TEXT_VERSION, type ConsentStatus } from "./sms-consent";
import { syslog } from "./logger";

/** How long a number waits before the form or Matt may send the verification text again. */
export const VERIFICATION_RESEND_HOURS = 24;

/** Bare keywords that opt a known client in without a prior signup. */
const OPT_IN_KEYWORDS = new Set(["start", "yes", "subscribe", "unstop"]);

export function isOptInKeyword(body: string): boolean {
  return OPT_IN_KEYWORDS.has(body.trim().toLowerCase().replace(/[.!,]+$/, ""));
}

function nowIso(): string {
  return new Date().toISOString();
}

async function findClientByPhone(phone: string) {
  return db.select().from(clients).where(eq(clients.phone, phone)).get();
}

async function latestEvent(phone: string): Promise<ConsentEvent | undefined> {
  return db.select().from(consentEvents)
    .where(eq(consentEvents.phone, phone))
    .orderBy(desc(consentEvents.id))
    .limit(1)
    .get();
}

/**
 * What a number's events say its status is, independent of any client row.
 * Needed for signups that have not been matched to a client yet, and used to
 * carry the status across when Matt links them.
 */
export async function phoneStatus(phone: string): Promise<ConsentStatus> {
  const rows = await db.select({ event: consentEvents.event }).from(consentEvents)
    .where(eq(consentEvents.phone, phone))
    .orderBy(desc(consentEvents.id))
    .all();
  for (const r of rows) {
    switch (r.event) {
      case "confirmed": return "confirmed";
      case "declined": return "declined";
      case "request_sent": return "pending";
      case "reset": return "unknown";
      case "signed_up": continue; // a signup alone is not yet pending — nothing has been sent
      case "linked": continue;
    }
  }
  return "unknown";
}

async function setClientStatus(clientId: number, status: ConsentStatus, method: string, at: string | null) {
  await db.update(clients)
    .set({ smsConsentStatus: status, smsConsentAt: at, smsConsentMethod: method })
    .where(eq(clients.id, clientId))
    .run();
}

export type SignupOutcome =
  | { outcome: "recorded"; clientId: number | null }
  | { outcome: "declined" };

/**
 * The public form was submitted. Records the fact and nothing else — sending
 * the verification text is a separate step so the form handler can apply its
 * own rate limits and give the same answer whether or not a text went out.
 *
 * A number that has opted out is refused: the client left, and a form
 * submission is not how they come back (texting START is).
 */
export async function recordSignup(input: {
  phone: string;
  name: string;
  guardianName?: string | null;
  evidence?: string | null;
}): Promise<SignupOutcome> {
  const client = await findClientByPhone(input.phone);
  const status = client ? (client.smsConsentStatus as ConsentStatus) : await phoneStatus(input.phone);
  if (status === "declined") return { outcome: "declined" };

  await db.insert(consentEvents).values({
    phone: input.phone,
    clientId: client?.id ?? null,
    event: "signed_up",
    method: "web_form",
    actor: "client",
    consentTextVersion: CONSENT_TEXT_VERSION,
    submittedName: input.name,
    guardianName: input.guardianName ?? null,
    evidence: input.evidence ?? null,
    createdAt: nowIso(),
  }).run();

  return { outcome: "recorded", clientId: client?.id ?? null };
}

export type VerificationResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string };

/**
 * Send the one verification text. Refuses if one went to this number within
 * the resend window, if the number is confirmed or declined, or if the send
 * itself is refused (allowlist, missing number). The status only moves to
 * `pending` when Twilio accepted the message — a client marked pending who
 * was never texted would wait forever for a question they never received.
 */
export async function sendVerification(phone: string): Promise<VerificationResult> {
  const client = await findClientByPhone(phone);
  const status = client ? (client.smsConsentStatus as ConsentStatus) : await phoneStatus(phone);

  const decision = canSend("consent_request", status);
  if (!decision.allowed) return { status: "skipped", reason: decision.reason };

  const since = new Date(Date.now() - VERIFICATION_RESEND_HOURS * 3600_000).toISOString();
  const recent = await db.select({ id: consentEvents.id }).from(consentEvents)
    .where(and(
      eq(consentEvents.phone, phone),
      eq(consentEvents.event, "request_sent"),
      gt(consentEvents.createdAt, since),
    ))
    .limit(1)
    .get();
  if (recent) return { status: "skipped", reason: `verification text already sent in the last ${VERIFICATION_RESEND_HOURS} hours` };

  const privacyUrl = process.env.PRIVACY_POLICY_URL ?? undefined;
  const result = await sendSMS(phone, confirmationMessage({ privacyUrl }), {
    purpose: "consent_request",
    consent: status,
  });
  if (result.status !== "sent") {
    await syslog.warn("outreach", "Verification text not sent", `To ${phone}: ${result.reason}`,
      client ? { clientId: client.id } : undefined);
    return { status: "skipped", reason: result.reason };
  }

  const at = nowIso();
  await db.insert(consentEvents).values({
    phone, clientId: client?.id ?? null, event: "request_sent", method: "web_form", actor: "system",
    evidence: result.sid, createdAt: at,
  }).run();
  if (client) await setClientStatus(client.id, "pending", "web_form", null);

  await syslog.info("outreach", "Verification text sent", `To ${phone}${client ? ` (client ${client.id})` : ""}`,
    client ? { clientId: client.id } : undefined);
  return { status: "sent" };
}

export type ReplyOutcome =
  | { outcome: "confirmed"; method: "sms_reply" | "sms_keyword" }
  | { outcome: "declined" }
  | { outcome: "ignored"; reason: string };

/**
 * An inbound text that reads as a consent answer.
 *
 * - A decline is honoured whatever state we thought they were in.
 * - A confirm counts as the answer to our verification text when the number is
 *   `pending`, and as an unprompted opt-in when it is `unknown` AND the word is
 *   one of the opt-in keywords. A stray "ok" from someone we never asked is
 *   ignored: it must not manufacture consent.
 * - Anything else is a no-op; the caller falls through to normal handling.
 */
export async function recordReply(input: {
  phone: string;
  clientId: number | null;
  currentStatus: ConsentStatus;
  verdict: "confirm" | "decline";
  body: string;
  messageSid?: string | null;
}): Promise<ReplyOutcome> {
  const evidence = `${input.body.trim()}${input.messageSid ? ` · ${input.messageSid}` : ""}`;
  const at = nowIso();

  if (input.verdict === "decline") {
    await db.insert(consentEvents).values({
      phone: input.phone, clientId: input.clientId, event: "declined", method: "sms_reply",
      actor: "client", evidence, createdAt: at,
    }).run();
    if (input.clientId !== null) await setClientStatus(input.clientId, "declined", "sms_reply", at);
    return { outcome: "declined" };
  }

  if (input.currentStatus === "confirmed") return { outcome: "ignored", reason: "already confirmed" };
  if (input.currentStatus === "declined") {
    // START after STOP is the one way back in, and only for a real keyword.
    if (!isOptInKeyword(input.body)) return { outcome: "ignored", reason: "opted out" };
  }

  let method: "sms_reply" | "sms_keyword";
  if (input.currentStatus === "pending") method = "sms_reply";
  else if (isOptInKeyword(input.body)) method = "sms_keyword";
  else return { outcome: "ignored", reason: "not asked, and not an opt-in keyword" };

  await db.insert(consentEvents).values({
    phone: input.phone, clientId: input.clientId, event: "confirmed", method,
    actor: "client", evidence, createdAt: at,
  }).run();
  if (input.clientId !== null) await setClientStatus(input.clientId, "confirmed", method, at);
  return { outcome: "confirmed", method };
}

/** Matt was told in person that a client wants no texts. Down is always allowed. */
export async function markOptedOut(clientId: number, note: string): Promise<void> {
  const client = await db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!client) throw new Error(`No client ${clientId}`);
  const at = nowIso();
  await db.insert(consentEvents).values({
    phone: client.phone ?? "", clientId, event: "declined", method: "manual", actor: "matt",
    evidence: note.trim() || null, createdAt: at,
  }).run();
  await setClientStatus(clientId, "declined", "manual", at);
}

/**
 * Consent is to a number. When the number changes, whatever the old one had
 * agreed to no longer applies, and the new one starts from nothing.
 */
export async function resetForPhoneChange(clientId: number, oldPhone: string | null, newPhone: string | null): Promise<void> {
  if ((oldPhone ?? null) === (newPhone ?? null)) return;
  // Logged against the OLD number: that is the consent being voided. Logging
  // it against the new one would bury any history the new number already has.
  await db.insert(consentEvents).values({
    phone: oldPhone ?? newPhone ?? "", clientId, event: "reset", method: "phone_changed", actor: "matt",
    evidence: `phone changed from ${oldPhone ?? "(none)"} to ${newPhone ?? "(none)"}`, createdAt: nowIso(),
  }).run();
  // If the new number already has its own history (signed up before Matt
  // typed it in), inherit it rather than discarding what the client did.
  const inherited = newPhone ? await phoneStatus(newPhone) : "unknown";
  await setClientStatus(clientId, inherited, inherited === "unknown" ? "phone_changed" : "web_form", null);
  if (newPhone && inherited !== "unknown") await linkSignupToClient(newPhone, clientId);
}

/**
 * Attach the events for a number that arrived before its client existed.
 * Copies the derived status onto the client so the gate sees what the events say.
 */
export async function linkSignupToClient(phone: string, clientId: number): Promise<ConsentStatus> {
  await db.update(consentEvents)
    .set({ clientId })
    .where(and(eq(consentEvents.phone, phone), isNull(consentEvents.clientId)))
    .run();
  const status = await phoneStatus(phone);
  const at = nowIso();
  await db.insert(consentEvents).values({
    phone, clientId, event: "linked", method: "manual", actor: "matt", createdAt: at,
  }).run();
  const latest = await latestConfirmOrDecline(phone);
  await setClientStatus(clientId, status, latest?.method ?? "web_form", latest?.createdAt ?? null);
  return status;
}

async function latestConfirmOrDecline(phone: string) {
  return db.select().from(consentEvents)
    .where(and(eq(consentEvents.phone, phone), sql`${consentEvents.event} IN ('confirmed','declined')`))
    .orderBy(desc(consentEvents.id))
    .limit(1)
    .get();
}

export async function consentHistory(clientId: number): Promise<ConsentEvent[]> {
  return db.select().from(consentEvents)
    .where(eq(consentEvents.clientId, clientId))
    .orderBy(desc(consentEvents.id))
    .all();
}

export type UnmatchedSignup = {
  phone: string;
  name: string | null;
  guardianName: string | null;
  status: ConsentStatus;
  signedUpAt: string;
};

/** Form signups that no client row claims yet — Matt's queue. */
export async function unmatchedSignups(): Promise<UnmatchedSignup[]> {
  const rows = await db.select().from(consentEvents)
    .where(isNull(consentEvents.clientId))
    .orderBy(desc(consentEvents.id))
    .all();
  const byPhone = new Map<string, ConsentEvent[]>();
  for (const r of rows) {
    const list = byPhone.get(r.phone) ?? [];
    list.push(r);
    byPhone.set(r.phone, list);
  }
  const out: UnmatchedSignup[] = [];
  for (const [phone, events] of byPhone) {
    const signup = events.find((e) => e.event === "signed_up");
    if (!signup) continue; // a stray unknown-number event with no signup is not a lead
    out.push({
      phone,
      name: signup.submittedName,
      guardianName: signup.guardianName,
      status: await phoneStatus(phone),
      signedUpAt: signup.createdAt,
    });
  }
  return out;
}

/** The event that made the current status what it is, for a one-line summary. */
export { latestEvent as latestConsentEvent };
