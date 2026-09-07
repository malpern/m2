import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetDailyDigest = vi.fn();
const mockSendSMS = vi.fn();
const mockIsDevAllowed = vi.fn();
const mockSendPush = vi.fn();

vi.mock("@/lib/alerting", () => ({
  getDailyDigest: (...args: unknown[]) => mockGetDailyDigest(...args),
}));

vi.mock("@/lib/twilio", () => ({
  sendSMS: (...args: unknown[]) => mockSendSMS(...args),
  isDevAllowed: (...args: unknown[]) => mockIsDevAllowed(...args),
}));

vi.mock("@/lib/push", () => ({
  sendPush: (...args: unknown[]) => mockSendPush(...args),
}));

const { POST } = await import("./route");

function makeRequest(secret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  return new NextRequest("http://localhost/api/cron/daily-digest", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");
  mockGetDailyDigest.mockResolvedValue("Test digest content");
  mockIsDevAllowed.mockReturnValue(true);
  mockSendSMS.mockResolvedValue("SM123");
  mockSendPush.mockResolvedValue({ status: "sent" });
});

describe("POST /api/cron/daily-digest", () => {
  it("returns 401 when no authorization header", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
  });

  it("returns 401 when authorization header has wrong secret", async () => {
    const res = await POST(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns digest and sends SMS + push on success", async () => {
    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.digest).toBe("Test digest content");
    expect(body.whatsapp).toBe("sent");
    expect(body.push).toBe("sent");

    expect(mockGetDailyDigest).toHaveBeenCalledOnce();
    expect(mockSendSMS).toHaveBeenCalledWith("+14082099509", "Test digest content");
    expect(mockSendPush).toHaveBeenCalledOnce();
  });

  it("skips SMS when dev guard blocks phone", async () => {
    mockIsDevAllowed.mockReturnValue(false);

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.whatsapp).toBeUndefined();
    expect(mockSendSMS).not.toHaveBeenCalled();
    expect(body.push).toBe("sent");
  });

  it("reports SMS failure without crashing", async () => {
    mockSendSMS.mockRejectedValue(new Error("Twilio down"));

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.whatsapp).toContain("failed");
    expect(body.push).toBe("sent");
  });

  it("reports a SKIPPED push as skipped, not as sent", async () => {
    // The failure mode that matters: Pushover unconfigured in production. It
    // does not throw — it returns a skip — and reporting that as "sent" is how
    // an alerting channel goes quiet without anyone noticing.
    mockSendPush.mockResolvedValue({
      status: "skipped",
      reason: "PUSHOVER_TOKEN / PUSHOVER_USER_KEY not set",
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.push).toContain("skipped");
    expect(body.push).toContain("PUSHOVER_TOKEN");
  });

  it("sends the digest at priority 0 — it is a daily read, not an interruption", async () => {
    await POST(makeRequest("test-secret"));
    expect(mockSendPush).toHaveBeenCalledWith(
      expect.stringContaining("M2 Daily Digest"),
      "Test digest content",
      0,
    );
  });
});
