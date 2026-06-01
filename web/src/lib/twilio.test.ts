import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock twilio before importing the module under test
const mockCreate = vi.fn();
vi.mock("twilio", () => ({
  default: vi.fn(() => ({
    messages: { create: mockCreate },
  })),
}));

describe("isDevAllowed", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("allows Micah's phone number", async () => {
    const { isDevAllowed } = await import("./twilio");
    expect(isDevAllowed("+14082099509")).toBe(true);
  });

  it("blocks other phone numbers in dev", async () => {
    const { isDevAllowed } = await import("./twilio");
    expect(isDevAllowed("+15551234567")).toBe(false);
  });

  it("blocks unknown numbers", async () => {
    const { isDevAllowed } = await import("./twilio");
    expect(isDevAllowed("+10000000000")).toBe(false);
  });
});

describe("sendSMS", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mockCreate.mockReset();
  });

  it("blocks non-dev numbers and returns DEV_SKIPPED", async () => {
    const { sendSMS } = await import("./twilio");
    const result = await sendSMS("+15551234567", "Hello test");
    expect(result).toBe("DEV_SKIPPED");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("sends via Twilio client for allowed numbers", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "authtoken123");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+12025551234");
    vi.stubEnv("TWILIO_USE_WHATSAPP", "false");

    mockCreate.mockResolvedValue({ sid: "SM_test_sid_123" });

    const { sendSMS } = await import("./twilio");
    const result = await sendSMS("+14082099509", "Session at 3pm");

    expect(result).toBe("SM_test_sid_123");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Session at 3pm",
        from: "+12025551234",
        to: "+14082099509",
      })
    );
  });

  it("applies WhatsApp prefix when TWILIO_USE_WHATSAPP is true", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "authtoken123");
    vi.stubEnv("TWILIO_USE_WHATSAPP", "true");

    mockCreate.mockResolvedValue({ sid: "SM_whatsapp_sid" });

    const { sendSMS } = await import("./twilio");
    const result = await sendSMS("+14082099509", "WhatsApp msg");

    expect(result).toBe("SM_whatsapp_sid");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "whatsapp:+14155238886",
        to: "whatsapp:+14082099509",
      })
    );
  });

  it("includes statusCallback when NEXT_PUBLIC_APP_URL is set", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "authtoken123");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+12025551234");
    vi.stubEnv("TWILIO_USE_WHATSAPP", "false");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");

    mockCreate.mockResolvedValue({ sid: "SM_callback_sid" });

    const { sendSMS } = await import("./twilio");
    await sendSMS("+14082099509", "Test callback");

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCallback: "https://example.com/api/twilio",
      })
    );
  });

  it("throws when TWILIO_PHONE_NUMBER is missing (non-WhatsApp)", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "authtoken123");
    vi.stubEnv("TWILIO_USE_WHATSAPP", "false");

    const { sendSMS } = await import("./twilio");
    await expect(sendSMS("+14082099509", "No from")).rejects.toThrow(
      "TWILIO_PHONE_NUMBER must be set"
    );
  });

  it("propagates Twilio send errors", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "authtoken123");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+12025551234");
    vi.stubEnv("TWILIO_USE_WHATSAPP", "false");

    mockCreate.mockRejectedValue(new Error("Twilio API error: 21211"));

    const { sendSMS } = await import("./twilio");
    await expect(sendSMS("+14082099509", "Fail msg")).rejects.toThrow(
      "Twilio API error: 21211"
    );
  });
});
