import { describe, it, expect, vi, beforeEach } from "vitest";
import { clients, consentEvents } from "@/db/schema";
import { eq } from "drizzle-orm";

// Real in-memory SQLite behind the real schema: the whole point of this module
// is what it writes, so the writes are exercised for real. Only Twilio is stubbed.
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: createTestDb() };
});
const mockSendSMS = vi.fn();
vi.mock("@/lib/twilio", () => ({ sendSMS: (...a: unknown[]) => mockSendSMS(...a) }));
vi.mock("@/lib/logger", () => ({ syslog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { db } = await import("@/db");
const {
  recordSignup, sendVerification, recordReply, markOptedOut, resetForPhoneChange,
  linkSignupToClient, phoneStatus, unmatchedSignups, consentHistory, isOptInKeyword, createClientFromSignup,
} = await import("./consent");

const PHONE = "+14085550100";

async function seedClient(phone: string | null = PHONE, status: "unknown" | "pending" | "confirmed" | "declined" = "unknown") {
  return db.insert(clients).values({ name: "Jordan Lee", phone, smsConsentStatus: status }).returning().get();
}
async function statusOf(id: number) {
  const c = await db.select().from(clients).where(eq(clients.id, id)).get();
  return c!.smsConsentStatus;
}
async function events(phone = PHONE) {
  return db.select().from(consentEvents).where(eq(consentEvents.phone, phone)).orderBy(consentEvents.id).all();
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockSendSMS.mockResolvedValue({ status: "sent", sid: "SM1" });
  await db.delete(consentEvents).run();
  await db.delete(clients).run();
});

describe("recordSignup", () => {
  it("writes a signed_up event tied to the matching client, with the consent text version", async () => {
    const c = await seedClient();
    const r = await recordSignup({ phone: PHONE, name: "Jordan Lee", guardianName: "Dana Lee", evidence: "ip:abc" });
    expect(r).toEqual({ outcome: "recorded", clientId: c.id });
    const [e] = await events();
    expect(e).toMatchObject({ event: "signed_up", method: "web_form", actor: "client", clientId: c.id,
      consentTextVersion: "v1", submittedName: "Jordan Lee", guardianName: "Dana Lee", evidence: "ip:abc" });
    // A signup alone changes nothing on the client — nothing has been sent yet.
    expect(await statusOf(c.id)).toBe("unknown");
  });

  it("records a signup for a number no client has yet, with a null client", async () => {
    const r = await recordSignup({ phone: PHONE, name: "Sam O" });
    expect(r).toEqual({ outcome: "recorded", clientId: null });
    expect((await events())[0].clientId).toBeNull();
  });

  it("refuses a number that has opted out and writes nothing", async () => {
    await seedClient(PHONE, "declined");
    const r = await recordSignup({ phone: PHONE, name: "Jordan Lee" });
    expect(r).toEqual({ outcome: "declined" });
    expect(await events()).toHaveLength(0);
  });
});

describe("sendVerification", () => {
  it("sends once, records request_sent with the message sid, and moves the client to pending", async () => {
    const c = await seedClient();
    const r = await sendVerification(PHONE);
    expect(r).toEqual({ status: "sent" });
    expect(mockSendSMS).toHaveBeenCalledWith(PHONE, expect.stringContaining("Reply YES to confirm"),
      expect.objectContaining({ purpose: "consent_request" }));
    expect(await statusOf(c.id)).toBe("pending");
    const e = (await events()).find((x) => x.event === "request_sent");
    expect(e).toMatchObject({ actor: "system", evidence: "SM1", clientId: c.id });
  });

  it("does not send again within the resend window", async () => {
    await seedClient();
    await sendVerification(PHONE);
    // Second attempt: the client is now pending, so the gate allows a re-ask,
    // but the 24h limit must refuse it.
    const r = await sendVerification(PHONE);
    expect(r.status).toBe("skipped");
    expect((r as { reason: string }).reason).toMatch(/already sent/);
    expect(mockSendSMS).toHaveBeenCalledTimes(1);
  });

  it("leaves the status alone when the send is refused", async () => {
    const c = await seedClient();
    mockSendSMS.mockResolvedValue({ status: "skipped", reason: "outreach is off" });
    const r = await sendVerification(PHONE);
    expect(r).toEqual({ status: "skipped", reason: "outreach is off" });
    expect(await statusOf(c.id)).toBe("unknown");
    expect((await events()).some((e) => e.event === "request_sent")).toBe(false);
  });

  it("refuses confirmed and declined numbers", async () => {
    await seedClient(PHONE, "confirmed");
    expect((await sendVerification(PHONE)).status).toBe("skipped");
    await db.update(clients).set({ smsConsentStatus: "declined" }).run();
    expect((await sendVerification(PHONE)).status).toBe("skipped");
    expect(mockSendSMS).not.toHaveBeenCalled();
  });

  it("works for a number with no client yet, tracking status through events", async () => {
    await recordSignup({ phone: PHONE, name: "Sam O" });
    expect(await sendVerification(PHONE)).toEqual({ status: "sent" });
    expect(await phoneStatus(PHONE)).toBe("pending");
  });
});

describe("recordReply", () => {
  it("YES while pending confirms via sms_reply and stores the reply with its sid", async () => {
    const c = await seedClient(PHONE, "pending");
    const r = await recordReply({ phone: PHONE, clientId: c.id, currentStatus: "pending", verdict: "confirm", body: "Yes", messageSid: "SM9" });
    expect(r).toEqual({ outcome: "confirmed", method: "sms_reply" });
    expect(await statusOf(c.id)).toBe("confirmed");
    const e = (await events()).find((x) => x.event === "confirmed");
    expect(e).toMatchObject({ method: "sms_reply", actor: "client", evidence: "Yes · SM9" });
  });

  it("START from an unasked client confirms via sms_keyword", async () => {
    const c = await seedClient(PHONE, "unknown");
    const r = await recordReply({ phone: PHONE, clientId: c.id, currentStatus: "unknown", verdict: "confirm", body: "START" });
    expect(r).toEqual({ outcome: "confirmed", method: "sms_keyword" });
    expect(await statusOf(c.id)).toBe("confirmed");
  });

  it("a stray 'ok' from an unasked client is ignored and manufactures nothing", async () => {
    const c = await seedClient(PHONE, "unknown");
    const r = await recordReply({ phone: PHONE, clientId: c.id, currentStatus: "unknown", verdict: "confirm", body: "ok" });
    expect(r.outcome).toBe("ignored");
    expect(await statusOf(c.id)).toBe("unknown");
    expect(await events()).toHaveLength(0);
  });

  it("a decline is honoured in every state", async () => {
    for (const [i, status] of (["unknown", "pending", "confirmed"] as const).entries()) {
      const c = await seedClient(`+1408555010${i}`, status);
      const r = await recordReply({ phone: c.phone!, clientId: c.id, currentStatus: status, verdict: "decline", body: "STOP" });
      expect(r).toEqual({ outcome: "declined" });
      expect(await statusOf(c.id)).toBe("declined");
    }
  });

  it("START after STOP is the one way back in; a plain 'yes' is not", async () => {
    const c = await seedClient(PHONE, "declined");
    expect((await recordReply({ phone: PHONE, clientId: c.id, currentStatus: "declined", verdict: "confirm", body: "yeah" })).outcome).toBe("ignored");
    expect(await statusOf(c.id)).toBe("declined");
    expect(await recordReply({ phone: PHONE, clientId: c.id, currentStatus: "declined", verdict: "confirm", body: "START" }))
      .toEqual({ outcome: "confirmed", method: "sms_keyword" });
    expect(await statusOf(c.id)).toBe("confirmed");
  });

  it("a repeat YES from a confirmed client is ignored", async () => {
    const c = await seedClient(PHONE, "confirmed");
    const r = await recordReply({ phone: PHONE, clientId: c.id, currentStatus: "confirmed", verdict: "confirm", body: "yes" });
    expect(r.outcome).toBe("ignored");
  });
});

describe("markOptedOut", () => {
  it("records a manual decline by Matt with the note", async () => {
    const c = await seedClient(PHONE, "confirmed");
    await markOptedOut(c.id, "Told me at the gym on Tuesday");
    expect(await statusOf(c.id)).toBe("declined");
    expect((await events())[0]).toMatchObject({ event: "declined", method: "manual", actor: "matt", evidence: "Told me at the gym on Tuesday" });
  });
});

describe("resetForPhoneChange", () => {
  it("a new number starts from nothing and the reset is logged with both numbers", async () => {
    const c = await seedClient(PHONE, "confirmed");
    await resetForPhoneChange(c.id, PHONE, "+14085550199");
    expect(await statusOf(c.id)).toBe("unknown");
    const e = (await events(PHONE))[0];
    expect(e).toMatchObject({ event: "reset", method: "phone_changed", clientId: c.id });
    expect(e.evidence).toContain(PHONE);
    expect(e.evidence).toContain("+14085550199");
  });

  it("is a no-op when the number did not change", async () => {
    const c = await seedClient(PHONE, "confirmed");
    await resetForPhoneChange(c.id, PHONE, PHONE);
    expect(await statusOf(c.id)).toBe("confirmed");
    expect(await events()).toHaveLength(0);
  });

  it("inherits the new number's own history when it signed up and confirmed before Matt typed it in", async () => {
    const NEW = "+14085550199";
    await recordSignup({ phone: NEW, name: "Jordan Lee" });
    await sendVerification(NEW);
    await recordReply({ phone: NEW, clientId: null, currentStatus: "pending", verdict: "confirm", body: "YES" });
    const c = await seedClient(PHONE, "unknown");
    await resetForPhoneChange(c.id, PHONE, NEW);
    expect(await statusOf(c.id)).toBe("confirmed");
    // and the orphan events now belong to the client
    expect((await events(NEW)).every((e) => e.clientId === c.id)).toBe(true);
  });
});

describe("linkSignupToClient / unmatchedSignups", () => {
  it("lists a signup with no client, then attaches it and copies the status across", async () => {
    await recordSignup({ phone: PHONE, name: "Sam O", guardianName: null });
    await sendVerification(PHONE);
    await recordReply({ phone: PHONE, clientId: null, currentStatus: "pending", verdict: "confirm", body: "yes", messageSid: "SM5" });

    const queue = await unmatchedSignups();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ phone: PHONE, name: "Sam O", status: "confirmed" });

    const c = await seedClient(null);
    await db.update(clients).set({ phone: PHONE }).where(eq(clients.id, c.id)).run();
    const status = await linkSignupToClient(PHONE, c.id);
    expect(status).toBe("confirmed");
    expect(await statusOf(c.id)).toBe("confirmed");
    expect(await unmatchedSignups()).toHaveLength(0);
    const hist = await consentHistory(c.id);
    expect(hist.map((e) => e.event)).toEqual(["linked", "confirmed", "request_sent", "signed_up"]);
  });

  it("does not list a number that merely texted START without a form signup", async () => {
    await recordReply({ phone: PHONE, clientId: null, currentStatus: "unknown", verdict: "confirm", body: "START" });
    expect(await unmatchedSignups()).toHaveLength(0);
  });
});

describe("phoneStatus", () => {
  it("derives from the latest decisive event", async () => {
    expect(await phoneStatus(PHONE)).toBe("unknown");
    await recordSignup({ phone: PHONE, name: "x" });
    expect(await phoneStatus(PHONE)).toBe("unknown");
    await sendVerification(PHONE);
    expect(await phoneStatus(PHONE)).toBe("pending");
    await recordReply({ phone: PHONE, clientId: null, currentStatus: "pending", verdict: "decline", body: "no" });
    expect(await phoneStatus(PHONE)).toBe("declined");
  });
});

describe("isOptInKeyword", () => {
  it("accepts bare opt-in words only", () => {
    expect(isOptInKeyword("START")).toBe(true);
    expect(isOptInKeyword(" yes. ")).toBe(true);
    expect(isOptInKeyword("ok")).toBe(false);
    expect(isOptInKeyword("yes tuesday works")).toBe(false);
  });
});

describe("createClientFromSignup", () => {
  it("creates the client from what was typed, links the events, and carries the status", async () => {
    await recordSignup({ phone: PHONE, name: "Sam O", guardianName: "Pat O" });
    await sendVerification(PHONE);
    const { clientId, status } = await createClientFromSignup(PHONE);
    expect(status).toBe("pending");
    const c = await db.select().from(clients).where(eq(clients.id, clientId)).get();
    expect(c).toMatchObject({ name: "Sam O", phone: PHONE, parentGuardian: "Pat O", smsConsentStatus: "pending" });
    expect(await unmatchedSignups()).toHaveLength(0);
  });

  it("refuses when there is nothing to create from", async () => {
    await expect(createClientFromSignup("+14085550199")).rejects.toThrow(/No unmatched signup/);
  });
});
