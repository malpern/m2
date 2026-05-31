import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSendSMS = vi.fn();
const mockIsDevAllowed = vi.fn();
const mockDbSelect = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  systemLogs: { id: "id", severity: "severity", category: "category", createdAt: "created_at" },
}));

vi.mock("@/lib/twilio", () => ({
  sendSMS: (...args: unknown[]) => mockSendSMS(...args),
  isDevAllowed: (...args: unknown[]) => mockIsDevAllowed(...args),
}));

const { checkAndAlert, getDailyDigest } = await import("./alerting");

beforeEach(() => {
  vi.clearAllMocks();
  mockIsDevAllowed.mockReturnValue(true);
  mockSendSMS.mockResolvedValue("SM123");
});

describe("checkAndAlert", () => {
  it("does not alert when fewer than 3 errors", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          all: () => [{ id: 1 }, { id: 2 }],
        }),
      }),
    });

    await checkAndAlert("test", "test tech");
    expect(mockSendSMS).not.toHaveBeenCalled();
  });
});

describe("getDailyDigest", () => {
  it("returns a formatted digest", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          all: () => [
            { severity: "info", category: "twilio" },
            { severity: "info", category: "twilio" },
            { severity: "error", category: "classifier" },
          ],
        }),
      }),
    });

    const digest = await getDailyDigest();
    expect(digest).toContain("Daily Digest");
    expect(digest).toContain("1 errors");
    expect(digest).toContain("2 messages sent");
    expect(digest).toContain("1 classifications");
  });
});
