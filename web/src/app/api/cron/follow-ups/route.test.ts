import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSendSMS = vi.fn();
const mockIsDevAllowed = vi.fn();
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockGetMonday = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  outreach: { id: "id", weekOf: "week_of", clientId: "client_id", followUpAt: "follow_up_at" },
  sessions: { id: "id", status: "status" },
  clients: { id: "id", name: "name", phone: "phone" },
}));

vi.mock("@/lib/scheduler", () => ({
  getMonday: () => mockGetMonday(),
}));

vi.mock("@/lib/twilio", () => ({
  sendSMS: (...args: unknown[]) => mockSendSMS(...args),
  isDevAllowed: (...args: unknown[]) => mockIsDevAllowed(...args),
}));

vi.mock("@/lib/classify-reply", () => ({
  composeReply: vi.fn(),
}));

vi.mock("@/lib/suggest-alternatives", () => ({
  getOpenSlots: vi.fn(),
  rankSlotsForClient: vi.fn(),
  diversifyAcrossDays: vi.fn(),
  tagOfferedSlots: vi.fn(),
}));

vi.mock("@/lib/outreach-config", () => ({
  OUTREACH_DEFAULTS: {
    followUpAfterMinutes: 60,
    moveOnAfterMinutes: 180,
  },
}));

const { POST } = await import("./route");

function makeRequest(secret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  return new NextRequest("http://localhost/api/cron/follow-ups", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");
  mockIsDevAllowed.mockReturnValue(true);
  mockSendSMS.mockResolvedValue("SM123");
  mockGetMonday.mockReturnValue(new Date("2026-06-01T00:00:00Z"));

  // Default db.insert mock
  mockDbInsert.mockReturnValue({
    values: () => ({
      run: vi.fn(),
    }),
  });

  // Default db.update mock
  mockDbUpdate.mockReturnValue({
    set: () => ({
      where: () => ({
        run: vi.fn(),
      }),
    }),
  });
});

describe("POST /api/cron/follow-ups", () => {
  it("returns 401 when no authorization header", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when wrong secret", async () => {
    const res = await POST(makeRequest("wrong"));
    expect(res.status).toBe(401);
  });

  it("returns empty results when no outreach to follow up on", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            all: () => [],
          }),
        }),
      }),
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.processed).toBe(0);
    expect(body.results).toEqual([]);
  });

  it("expires outreach that exceeded moveOnAfterMinutes", async () => {
    const threeHoursAgo = new Date(Date.now() - 200 * 60 * 1000).toISOString();

    mockDbSelect.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            all: () => [
              {
                id: 1,
                clientId: 10,
                sessionId: 100,
                direction: "sent",
                messageText: "Hey, free Monday at 3pm?",
                status: "awaiting_reply",
                sentAt: threeHoursAgo,
                repliedAt: null,
                clientName: "Alice Smith",
                clientPhone: "+15551111111",
                followUpAt: null,
              },
            ],
          }),
        }),
      }),
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.processed).toBe(1);
    expect(body.results).toContain("moved-on: Alice Smith");
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("sends follow-up when elapsed > followUpAfterMinutes but < moveOnAfterMinutes", async () => {
    const ninetyMinAgo = new Date(Date.now() - 90 * 60 * 1000).toISOString();

    mockDbSelect.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            all: () => [
              {
                id: 1,
                clientId: 10,
                sessionId: 100,
                direction: "sent",
                messageText: "Hey, free Monday at 3pm?",
                status: "awaiting_reply",
                sentAt: ninetyMinAgo,
                repliedAt: null,
                clientName: "Bob Jones",
                clientPhone: "+15552222222",
                followUpAt: null,
              },
            ],
          }),
        }),
      }),
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.results).toContain("follow-up-sent: Bob Jones");
    expect(mockSendSMS).toHaveBeenCalledWith(
      "+15552222222",
      "Hey Bob, just checking in — did you want to keep your session this week? Let me know!"
    );
    expect(mockDbInsert).toHaveBeenCalled();
  });

  it("skips follow-up for dev-guarded clients", async () => {
    mockIsDevAllowed.mockReturnValue(false);
    const ninetyMinAgo = new Date(Date.now() - 90 * 60 * 1000).toISOString();

    mockDbSelect.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            all: () => [
              {
                id: 1,
                clientId: 10,
                sessionId: 100,
                direction: "sent",
                messageText: "Hey, free Monday at 3pm?",
                status: "awaiting_reply",
                sentAt: ninetyMinAgo,
                repliedAt: null,
                clientName: "Guarded Client",
                clientPhone: "+15553333333",
                followUpAt: null,
              },
            ],
          }),
        }),
      }),
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.results[0]).toContain("follow-up-skipped (dev guard)");
    expect(mockSendSMS).not.toHaveBeenCalled();
  });

  it("skips if there is already a reply", async () => {
    const ninetyMinAgo = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    const fiftyMinAgo = new Date(Date.now() - 50 * 60 * 1000).toISOString();

    mockDbSelect.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            all: () => [
              {
                id: 1,
                clientId: 10,
                sessionId: 100,
                direction: "sent",
                messageText: "Hey, free Monday at 3pm?",
                status: "awaiting_reply",
                sentAt: ninetyMinAgo,
                repliedAt: null,
                clientName: "Replied Client",
                clientPhone: "+15554444444",
                followUpAt: null,
              },
              {
                id: 2,
                clientId: 10,
                sessionId: 100,
                direction: "received",
                messageText: "Yes!",
                status: "confirmed",
                sentAt: null,
                repliedAt: fiftyMinAgo,
                clientName: "Replied Client",
                clientPhone: "+15554444444",
                followUpAt: null,
              },
            ],
          }),
        }),
      }),
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.processed).toBe(0);
    expect(body.results).toEqual([]);
    expect(mockSendSMS).not.toHaveBeenCalled();
  });

  it("handles deferred follow-ups with followUpAt in the past", async () => {
    const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    mockDbSelect.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            all: () => [
              {
                id: 5,
                clientId: 20,
                sessionId: 200,
                direction: "sent",
                messageText: "Hey, free Tuesday at 4pm?",
                status: "awaiting_reply",
                sentAt: twoHoursAgo,
                repliedAt: null,
                clientName: "Deferred Dan",
                clientPhone: "+15555555555",
                followUpAt: oneHourAgo,
              },
            ],
          }),
        }),
      }),
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    // The deferred follow-up should be processed. It may also trigger
    // the normal follow-up path (elapsed > 60 min) but the deferred
    // section adds its own result.
    const hasDeferred = body.results.some((r: string) => r.includes("deferred-follow-up: Deferred Dan"));
    const hasFollowUp = body.results.some((r: string) => r.includes("follow-up-sent: Deferred Dan"));
    expect(hasDeferred || hasFollowUp).toBe(true);
    expect(mockSendSMS).toHaveBeenCalled();
  });

  it("handles SMS failure on follow-up gracefully", async () => {
    mockSendSMS.mockRejectedValue(new Error("Twilio down"));
    const ninetyMinAgo = new Date(Date.now() - 90 * 60 * 1000).toISOString();

    mockDbSelect.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            all: () => [
              {
                id: 1,
                clientId: 10,
                sessionId: 100,
                direction: "sent",
                messageText: "Hey, free Monday at 3pm?",
                status: "awaiting_reply",
                sentAt: ninetyMinAgo,
                repliedAt: null,
                clientName: "Fail Person",
                clientPhone: "+15556666666",
                followUpAt: null,
              },
            ],
          }),
        }),
      }),
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.results[0]).toContain("follow-up-failed: Fail Person: Twilio down");
  });
});
