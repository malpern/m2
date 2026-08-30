import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSendSMS = vi.fn();
const mockIsDevAllowed = vi.fn();
const mockDbSelect = vi.fn();
const mockSendEmail = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  systemLogs: { id: "id", severity: "severity", category: "category", createdAt: "created_at" },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
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
  mockSendEmail.mockResolvedValue({ status: "sent" });
});

/**
 * `lastAlertAt` is module-level state, so a test that fires an alert would
 * throttle every test after it. Re-import for a clean instance.
 */
async function freshAlerting() {
  vi.resetModules();
  return await import("./alerting");
}

const errorsInDb = (n: number) =>
  mockDbSelect.mockReturnValue({
    from: () => ({ where: () => ({ all: () => Array.from({ length: n }, (_, i) => ({ id: i })) }) }),
  });

const dbThrows = (message: string) =>
  mockDbSelect.mockReturnValue({
    from: () => ({ where: () => ({ all: () => { throw new Error(message); } }) }),
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

  it("alerts once the burst threshold is crossed", async () => {
    errorsInDb(3);
    const { checkAndAlert: fresh } = await freshAlerting();
    await fresh("something broke", "stack trace");
    expect(mockSendSMS).toHaveBeenCalledOnce();
    expect(mockSendSMS.mock.calls[0][1]).toContain("3 errors");
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });

  it("ALERTS when the database itself is unreachable", async () => {
    // The regression this exists for: counting errors requires the database,
    // so an unguarded query meant a total database outage produced zero
    // alerts — the one failure most worth waking up for.
    dbThrows("SQLITE_BUSY: connection refused");
    const { checkAndAlert: fresh } = await freshAlerting();
    await fresh("latest failure", "tech detail");

    expect(mockSendSMS).toHaveBeenCalledOnce();
    expect(mockSendSMS.mock.calls[0][1]).toContain("database is unreachable");
    expect(mockSendSMS.mock.calls[0][1]).toContain("connection refused");
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });

  it("still emails when SMS throws — one dead channel must not eat the alert", async () => {
    errorsInDb(5);
    mockSendSMS.mockRejectedValue(new Error("twilio down"));
    const { checkAndAlert: fresh } = await freshAlerting();
    await expect(fresh("broke", "tech")).resolves.toBeUndefined();
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });

  it("still emails when the alert phone is not allowlisted", async () => {
    errorsInDb(5);
    mockIsDevAllowed.mockReturnValue(false);
    const { checkAndAlert: fresh } = await freshAlerting();
    await fresh("broke", "tech");
    expect(mockSendSMS).not.toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });

  it("throttles a second alert in the same window", async () => {
    errorsInDb(5);
    const { checkAndAlert: fresh } = await freshAlerting();
    await fresh("first", "tech");
    await fresh("second", "tech");
    expect(mockSendSMS).toHaveBeenCalledOnce();
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
