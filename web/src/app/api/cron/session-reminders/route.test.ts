import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSendSMS = vi.fn();
const mockIsDevAllowed = vi.fn();
const mockDbSelect = vi.fn();
const mockSyslog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  sessions: { id: "id", clientId: "client_id", scheduledDate: "scheduled_date", status: "status", scheduledTime: "scheduled_time", slot: "slot" },
  clients: { id: "id", name: "name", phone: "phone", sessionReminders: "session_reminders", category: "category" },
  outreachSettings: {},
}));

vi.mock("@/lib/twilio", () => ({
  sendSMS: (...args: unknown[]) => mockSendSMS(...args),
  isDevAllowed: (...args: unknown[]) => mockIsDevAllowed(...args),
}));

vi.mock("@/lib/logger", () => ({
  syslog: mockSyslog,
}));

const { POST } = await import("./route");

function makeRequest(secret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  return new NextRequest("http://localhost/api/cron/session-reminders", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");
  mockIsDevAllowed.mockReturnValue(true);
  mockSendSMS.mockResolvedValue("SM123");
});

describe("POST /api/cron/session-reminders", () => {
  it("returns 401 when no authorization header", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when wrong secret", async () => {
    const res = await POST(makeRequest("wrong"));
    expect(res.status).toBe(401);
  });

  it("sends reminders for opted-in clients", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // outreachSettings query
        return {
          from: () => ({
            get: () => ({ sessionRemindersGlobal: false }),
          }),
        };
      }
      // sessions query
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              all: () => [
                {
                  sessionId: 1,
                  clientId: 10,
                  clientName: "Alice Smith",
                  clientPhone: "+15551234567",
                  scheduledTime: "15:00",
                  slot: "3pm",
                  sessionReminders: true,
                  category: "active",
                },
              ],
            }),
          }),
        }),
      };
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.processed).toBe(1);
    expect(body.results).toContain("sent: Alice Smith (3pm)");
    expect(mockSendSMS).toHaveBeenCalledWith("+15551234567", "Hey Alice, see you today at 3pm!");
  });

  it("sends reminders for active clients when global setting is on", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: () => ({
            get: () => ({ sessionRemindersGlobal: true }),
          }),
        };
      }
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              all: () => [
                {
                  sessionId: 1,
                  clientId: 10,
                  clientName: "Bob Jones",
                  clientPhone: "+15559999999",
                  scheduledTime: "16:00",
                  slot: "4pm",
                  sessionReminders: null,
                  category: "active",
                },
              ],
            }),
          }),
        }),
      };
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.processed).toBe(1);
    expect(mockSendSMS).toHaveBeenCalled();
  });

  it("skips clients not opted in and global off", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: () => ({
            get: () => ({ sessionRemindersGlobal: false }),
          }),
        };
      }
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              all: () => [
                {
                  sessionId: 1,
                  clientId: 10,
                  clientName: "Charlie Doe",
                  clientPhone: "+15550000000",
                  scheduledTime: "15:00",
                  slot: "3pm",
                  sessionReminders: null,
                  category: "active",
                },
              ],
            }),
          }),
        }),
      };
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.processed).toBe(0);
    expect(mockSendSMS).not.toHaveBeenCalled();
  });

  it("skips dev-guarded clients", async () => {
    mockIsDevAllowed.mockReturnValue(false);
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: () => ({
            get: () => ({ sessionRemindersGlobal: false }),
          }),
        };
      }
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              all: () => [
                {
                  sessionId: 1,
                  clientId: 10,
                  clientName: "Dave Guard",
                  clientPhone: "+15550000001",
                  scheduledTime: "17:00",
                  slot: "5pm",
                  sessionReminders: true,
                  category: "active",
                },
              ],
            }),
          }),
        }),
      };
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.results).toContain("skipped (dev guard): Dave Guard");
    expect(mockSendSMS).not.toHaveBeenCalled();
  });

  it("handles SMS failure gracefully", async () => {
    mockSendSMS.mockRejectedValue(new Error("SMS fail"));
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: () => ({
            get: () => ({ sessionRemindersGlobal: false }),
          }),
        };
      }
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              all: () => [
                {
                  sessionId: 1,
                  clientId: 10,
                  clientName: "Eve Fail",
                  clientPhone: "+15550000002",
                  scheduledTime: "18:00",
                  slot: "6pm",
                  sessionReminders: true,
                  category: "active",
                },
              ],
            }),
          }),
        }),
      };
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.results[0]).toContain("failed: Eve Fail: SMS fail");
    expect(mockSyslog.error).toHaveBeenCalled();
  });

  it("returns empty results when no sessions today", async () => {
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: () => ({
            get: () => ({ sessionRemindersGlobal: true }),
          }),
        };
      }
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              all: () => [],
            }),
          }),
        }),
      };
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.processed).toBe(0);
    expect(body.results).toEqual([]);
  });
});
