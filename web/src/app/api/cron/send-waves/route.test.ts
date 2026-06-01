import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSendSMS = vi.fn();
const mockIsDevAllowed = vi.fn();
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockBuildOutreachQueue = vi.fn();
const mockGetNextWaveToSend = vi.fn();
const mockGetMonday = vi.fn();
const mockIsVacationWeek = vi.fn();
const mockSyslog = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  outreach: {},
  sessions: { id: "id", clientId: "client_id", scheduledDate: "scheduled_date" },
  clients: { id: "id", name: "name", phone: "phone" },
  weeklySkips: { clientId: "client_id", weekOf: "week_of" },
}));

vi.mock("@/lib/scheduler", () => ({
  getMonday: () => mockGetMonday(),
}));

vi.mock("@/lib/outreach-engine", () => ({
  buildOutreachQueue: (...args: unknown[]) => mockBuildOutreachQueue(...args),
  getNextWaveToSend: (...args: unknown[]) => mockGetNextWaveToSend(...args),
}));

vi.mock("@/lib/twilio", () => ({
  sendSMS: (...args: unknown[]) => mockSendSMS(...args),
  isDevAllowed: (...args: unknown[]) => mockIsDevAllowed(...args),
}));

vi.mock("@/lib/logger", () => ({
  syslog: mockSyslog,
}));

vi.mock("@/lib/vacation-detect", () => ({
  isVacationWeek: (...args: unknown[]) => mockIsVacationWeek(...args),
}));

const { POST } = await import("./route");

function makeRequest(secret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  return new NextRequest("http://localhost/api/cron/send-waves", {
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
  mockIsVacationWeek.mockResolvedValue(false);
  mockBuildOutreachQueue.mockReturnValue([]);
  mockGetNextWaveToSend.mockReturnValue({ wave: 0, items: [] });

  // Default db.select mock chain
  mockDbSelect.mockReturnValue({
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          all: () => [],
        }),
      }),
      where: () => ({
        all: () => [],
      }),
      all: () => [],
    }),
  });

  // Default db.insert mock chain
  mockDbInsert.mockReturnValue({
    values: () => ({
      run: vi.fn(),
    }),
  });
});

describe("POST /api/cron/send-waves", () => {
  it("returns 401 when no authorization header", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when wrong secret", async () => {
    const res = await POST(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("skips when vacation week detected", async () => {
    mockIsVacationWeek.mockResolvedValue(true);

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("vacation_week");
    expect(mockBuildOutreachQueue).not.toHaveBeenCalled();
  });

  it("returns no wave when wave is 0", async () => {
    mockGetNextWaveToSend.mockReturnValue({ wave: 0, items: [] });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.wave).toBe(0);
    expect(body.sent).toBe(0);
    expect(body.message).toBe("No wave ready to send");
  });

  it("returns skip message when all wave items are in weekly_skips", async () => {
    const waveItems = [
      { clientId: 1, clientName: "Alice", clientPhone: "+15551111111", sessionId: 10, day: "monday", slot: "3pm", date: "2026-06-01" },
    ];
    mockGetNextWaveToSend.mockReturnValue({ wave: 1, items: waveItems });

    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        // sessions query
        return {
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                all: () => [],
              }),
            }),
          }),
        };
      }
      if (selectCall === 2) {
        // outreach query
        return {
          from: () => ({
            where: () => ({
              all: () => [],
            }),
          }),
        };
      }
      // weekly_skips query — return the client as skipped
      return {
        from: () => ({
          where: () => ({
            all: () => [{ clientId: 1 }],
          }),
        }),
      };
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.wave).toBe(1);
    expect(body.sent).toBe(0);
    expect(body.message).toBe("All wave items are skipped");
  });

  it("sends SMS for eligible wave items", async () => {
    const waveItems = [
      { clientId: 1, clientName: "Alice Smith", clientPhone: "+15551111111", sessionId: 10, day: "monday", slot: "3pm", date: "2026-06-01" },
    ];
    mockGetNextWaveToSend.mockReturnValue({ wave: 1, items: waveItems });

    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall <= 2) {
        return {
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                all: () => [],
              }),
            }),
            where: () => ({
              all: () => [],
            }),
          }),
        };
      }
      // skips query — no skips
      return {
        from: () => ({
          where: () => ({
            all: () => [],
          }),
        }),
      };
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.wave).toBe(1);
    expect(body.sent).toBe(1);
    expect(body.results[0]).toContain("sent wave 1: Alice Smith");
    expect(mockSendSMS).toHaveBeenCalled();
    expect(mockDbInsert).toHaveBeenCalled();
  });

  it("skips SMS for dev-guarded clients", async () => {
    mockIsDevAllowed.mockReturnValue(false);
    const waveItems = [
      { clientId: 1, clientName: "Dev Client", clientPhone: "+15550000000", sessionId: 10, day: "monday", slot: "3pm", date: "2026-06-01" },
    ];
    mockGetNextWaveToSend.mockReturnValue({ wave: 1, items: waveItems });

    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall <= 2) {
        return {
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                all: () => [],
              }),
            }),
            where: () => ({
              all: () => [],
            }),
          }),
        };
      }
      return {
        from: () => ({
          where: () => ({
            all: () => [],
          }),
        }),
      };
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.sent).toBe(0);
    expect(body.results[0]).toContain("skipped (dev guard)");
    expect(mockSendSMS).not.toHaveBeenCalled();
  });

  it("handles SMS failure gracefully", async () => {
    mockSendSMS.mockRejectedValue(new Error("Twilio error"));
    const waveItems = [
      { clientId: 1, clientName: "Fail Client", clientPhone: "+15551111111", sessionId: 10, day: "monday", slot: "3pm", date: "2026-06-01" },
    ];
    mockGetNextWaveToSend.mockReturnValue({ wave: 1, items: waveItems });

    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall <= 2) {
        return {
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                all: () => [],
              }),
            }),
            where: () => ({
              all: () => [],
            }),
          }),
        };
      }
      return {
        from: () => ({
          where: () => ({
            all: () => [],
          }),
        }),
      };
    });

    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.results[0]).toContain("failed: Fail Client: Twilio error");
    expect(mockSyslog.error).toHaveBeenCalled();
  });
});
