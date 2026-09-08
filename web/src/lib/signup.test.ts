import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRecordSignup = vi.fn();
const mockSendVerification = vi.fn();
vi.mock("@/lib/consent", () => ({
  recordSignup: (...a: unknown[]) => mockRecordSignup(...a),
  sendVerification: (...a: unknown[]) => mockSendVerification(...a),
}));

const { rateLimitMap } = await import("./rate-limit");
const { readSignupFields, validateSignup, processSignup, submissionEvidence, successMessage, SIGNUP_IP_MAX } = await import("./signup");

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const GOOD = { name: "Jordan Lee", phone: "(650) 555-0142", agreed: "on" };

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMap.clear();
  mockRecordSignup.mockResolvedValue({ outcome: "recorded", clientId: 1 });
  mockSendVerification.mockResolvedValue({ status: "sent" });
});

describe("validateSignup", () => {
  it("accepts a complete adult signup and normalises the number", () => {
    const v = validateSignup(readSignupFields(form(GOOD)));
    expect(v).toEqual({ ok: true, name: "Jordan Lee", e164: "+16505550142", guardianName: null });
  });

  it("refuses when the consent box is not ticked — the box is never assumed", () => {
    const v = validateSignup(readSignupFields(form({ name: "Jordan Lee", phone: "6505550142" })));
    expect(v).toMatchObject({ ok: false, error: expect.stringMatching(/tick the box/i) });
  });

  it("refuses an invalid or non-US number", () => {
    expect(validateSignup(readSignupFields(form({ ...GOOD, phone: "12345" }))).ok).toBe(false);
    expect(validateSignup(readSignupFields(form({ ...GOOD, phone: "+44 20 7946 0958" }))).ok).toBe(false);
  });

  it("requires the guardian's name when the athlete is a minor, and records it", () => {
    expect(validateSignup(readSignupFields(form({ ...GOOD, isMinor: "on" }))).ok).toBe(false);
    const v = validateSignup(readSignupFields(form({ ...GOOD, isMinor: "on", guardianName: "Dana Lee" })));
    expect(v).toMatchObject({ ok: true, guardianName: "Dana Lee" });
  });

  it("ignores a guardian name typed by an adult", () => {
    const v = validateSignup(readSignupFields(form({ ...GOOD, guardianName: "Someone" })));
    expect(v).toMatchObject({ ok: true, guardianName: null });
  });
});

describe("submissionEvidence", () => {
  it("does not contain the IP, but is stable for the same IP", () => {
    const a = submissionEvidence("203.0.113.9", "Mozilla/5.0");
    expect(a).not.toContain("203.0.113.9");
    expect(a).toContain("ua:Mozilla/5.0");
    expect(submissionEvidence("203.0.113.9", "x")).toContain(a.split(" · ")[1]);
    expect(submissionEvidence("203.0.113.10", "x")).not.toContain(a.split(" · ")[1]);
  });
});

describe("processSignup", () => {
  const ctx = { ip: "203.0.113.9", userAgent: "UA" };

  it("records the signup with evidence and sends the verification text", async () => {
    const r = await processSignup({ form: form(GOOD), ...ctx });
    expect(r).toMatchObject({ ok: true, message: expect.stringContaining("(650) 555-0142") });
    expect(mockRecordSignup).toHaveBeenCalledWith(expect.objectContaining({
      phone: "+16505550142", name: "Jordan Lee", guardianName: null, evidence: expect.stringContaining("web form"),
    }));
    expect(mockSendVerification).toHaveBeenCalledWith("+16505550142");
  });

  it("returns the validation error to the visitor", async () => {
    const r = await processSignup({ form: form({ name: "J", phone: "x", agreed: "on" }), ...ctx });
    expect(r.ok).toBe(false);
    expect(mockRecordSignup).not.toHaveBeenCalled();
  });

  it("gives the SAME success message when the number has opted out, and sends nothing", async () => {
    mockRecordSignup.mockResolvedValue({ outcome: "declined" });
    const r = await processSignup({ form: form(GOOD), ...ctx });
    expect(r).toEqual({ ok: true, message: successMessage("+16505550142") });
    expect(mockSendVerification).not.toHaveBeenCalled();
  });

  it("gives the SAME success message when the verification was skipped (already sent today, outreach off)", async () => {
    mockSendVerification.mockResolvedValue({ status: "skipped", reason: "outreach is off" });
    const r = await processSignup({ form: form(GOOD), ...ctx });
    expect(r).toEqual({ ok: true, message: successMessage("+16505550142") });
  });

  it("stops recording and sending past the per-IP limit, still answering as if it worked", async () => {
    for (let i = 0; i < SIGNUP_IP_MAX; i++) await processSignup({ form: form(GOOD), ...ctx });
    vi.clearAllMocks();
    const r = await processSignup({ form: form(GOOD), ...ctx });
    expect(r.ok).toBe(true);
    expect(mockRecordSignup).not.toHaveBeenCalled();
    expect(mockSendVerification).not.toHaveBeenCalled();
    // a different visitor is unaffected
    await processSignup({ form: form(GOOD), ip: "203.0.113.50", userAgent: "UA" });
    expect(mockRecordSignup).toHaveBeenCalledTimes(1);
  });
});
