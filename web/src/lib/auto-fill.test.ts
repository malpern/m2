import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSendSMS = vi.fn();
const mockIsDevAllowed = vi.fn();

vi.mock("@/db", () => {
  const selectResults: Record<string, unknown> = {};
  const insertResult = { id: 999, clientId: 1 };

  return {
    db: {
      select: () => ({
        from: (table: { clientId?: string }) => ({
          where: () => ({
            all: () => {
              if (table.clientId) return selectResults.sessions ?? [];
              return selectResults.clients ?? [];
            },
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: () => ({
            get: () => insertResult,
          }),
          run: () => {},
        }),
      }),
      _setResults: (key: string, value: unknown) => {
        selectResults[key] = value;
      },
    },
  };
});

vi.mock("@/db/schema", () => ({
  clients: {},
  sessions: { clientId: "client_id", scheduledDate: "scheduled_date", status: "status" },
  outreach: { clientId: "client_id" },
}));

vi.mock("@/lib/twilio", () => ({
  sendSMS: (...args: unknown[]) => mockSendSMS(...args),
  isDevAllowed: (...args: unknown[]) => mockIsDevAllowed(...args),
}));

vi.mock("@/lib/scheduler", () => ({
  getMonday: () => new Date("2026-06-01T00:00:00Z"),
}));

describe("auto-fill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDevAllowed.mockReturnValue(true);
    mockSendSMS.mockResolvedValue("SM123");
  });

  it("is importable and exports autoFillCancelledSlot", async () => {
    const mod = await import("./auto-fill");
    expect(mod.autoFillCancelledSlot).toBeDefined();
  });
});
