import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetDailyDigest = vi.fn();
const mockSendSMS = vi.fn();
const mockIsDevAllowed = vi.fn();
const mockSendEmail = vi.fn();

vi.mock("@/lib/alerting", () => ({
  getDailyDigest: (...args: unknown[]) => mockGetDailyDigest(...args),
}));

vi.mock("@/lib/twilio", () => ({
  sendSMS: (...args: unknown[]) => mockSendSMS(...args),
  isDevAllowed: (...args: unknown[]) => mockIsDevAllowed(...args),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
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
  mockSendEmail.mockResolvedValue(true);
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

  it("returns digest and sends SMS + email on success", async () => {
    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.digest).toBe("Test digest content");
    expect(body.whatsapp).toBe("sent");
    expect(body.email).toBe("sent");

    expect(mockGetDailyDigest).toHaveBeenCalledOnce();
    expect(mockSendSMS).toHaveBeenCalledWith("+14082099509", "Test digest content");
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });

  it("skips SMS when dev guard blocks phone", async () => {
    mockIsDevAllowed.mockReturnValue(false);

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.whatsapp).toBeUndefined();
    expect(mockSendSMS).not.toHaveBeenCalled();
    expect(body.email).toBe("sent");
  });

  it("reports SMS failure without crashing", async () => {
    mockSendSMS.mockRejectedValue(new Error("Twilio down"));

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.whatsapp).toContain("failed");
    expect(body.email).toBe("sent");
  });

  it("reports email failure without crashing", async () => {
    mockSendEmail.mockRejectedValue(new Error("Gmail down"));

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.email).toContain("failed");
  });
});
