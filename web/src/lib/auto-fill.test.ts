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
            get: () => selectResults.singleClient ?? null,
          }),
          all: () => selectResults.clients ?? [],
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

import { db } from "@/db";

const setResults = (db as unknown as { _setResults: (k: string, v: unknown) => void })._setResults;

const makeClient = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: "Sarah Johnson",
  phone: "+14082099509",
  category: "active",
  collegeBound: true,
  gradeLevel: "senior",
  behaviorScore: 8,
  noShowCount: 0,
  sortOrder: null,
  ...overrides,
});

describe("auto-fill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDevAllowed.mockReturnValue(true);
    mockSendSMS.mockResolvedValue("SM123");
  });

  it("exports all expected functions", async () => {
    const mod = await import("./auto-fill");
    expect(mod.autoFillCancelledSlot).toBeDefined();
    expect(mod.getAutoFillCandidate).toBeDefined();
    expect(mod.sendAutoFillOffer).toBeDefined();
    expect(mod.buildAutoFillMessage).toBeDefined();
  });
});

describe("buildAutoFillMessage", () => {
  it("builds a message with first name, day, and slot", async () => {
    const { buildAutoFillMessage } = await import("./auto-fill");
    const msg = buildAutoFillMessage("Sarah Johnson", "2026-06-03", "4pm");
    expect(msg).toContain("Hey Sarah");
    expect(msg).toContain("4pm");
    expect(msg).toContain("just opened up");
  });
});

describe("getAutoFillCandidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDevAllowed.mockReturnValue(true);
  });

  it("returns null when no eligible clients", async () => {
    setResults("sessions", []);
    setResults("clients", []);
    const { getAutoFillCandidate } = await import("./auto-fill");
    const result = await getAutoFillCandidate("2026-06-03", "4pm", 99);
    expect(result).toBeNull();
  });

  it("returns top priority candidate with draft message", async () => {
    setResults("sessions", []);
    setResults("clients", [makeClient({ id: 5, name: "Alex Smith" })]);
    const { getAutoFillCandidate } = await import("./auto-fill");
    const result = await getAutoFillCandidate("2026-06-03", "4pm", 99);
    expect(result).not.toBeNull();
    expect(result!.clientId).toBe(5);
    expect(result!.clientName).toBe("Alex Smith");
    expect(result!.draftMessage).toContain("Hey Alex");
    expect(result!.draftMessage).toContain("4pm");
  });

  it("returns null when dev guard blocks", async () => {
    mockIsDevAllowed.mockReturnValue(false);
    setResults("sessions", []);
    setResults("clients", [makeClient()]);
    const { getAutoFillCandidate } = await import("./auto-fill");
    const result = await getAutoFillCandidate("2026-06-03", "4pm", 99);
    expect(result).toBeNull();
  });

  it("excludes the cancelled client", async () => {
    setResults("sessions", []);
    setResults("clients", [makeClient({ id: 10 })]);
    const { getAutoFillCandidate } = await import("./auto-fill");
    const result = await getAutoFillCandidate("2026-06-03", "4pm", 10);
    expect(result).toBeNull();
  });
});

describe("sendAutoFillOffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendSMS.mockResolvedValue("SM123");
    setResults("singleClient", makeClient({ id: 5 }));
  });

  it("sends SMS and returns offered true", async () => {
    const { sendAutoFillOffer } = await import("./auto-fill");
    const result = await sendAutoFillOffer("2026-06-03", "4pm", 5, "Hey Sarah, want a slot?");
    expect(result.offered).toBe(true);
    expect(result.clientName).toBe("Sarah Johnson");
    expect(mockSendSMS).toHaveBeenCalledWith("+14082099509", "Hey Sarah, want a slot?");
  });

  it("returns offered false when client not found", async () => {
    setResults("singleClient", null);
    const { sendAutoFillOffer } = await import("./auto-fill");
    const result = await sendAutoFillOffer("2026-06-03", "4pm", 999, "Hey!");
    expect(result.offered).toBe(false);
  });

  it("still returns offered true when SMS fails", async () => {
    mockSendSMS.mockRejectedValue(new Error("Twilio down"));
    const { sendAutoFillOffer } = await import("./auto-fill");
    const result = await sendAutoFillOffer("2026-06-03", "4pm", 5, "Hey!");
    expect(result.offered).toBe(true);
  });
});

describe("autoFillCancelledSlot (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDevAllowed.mockReturnValue(true);
    mockSendSMS.mockResolvedValue("SM123");
  });

  it("composes getAutoFillCandidate + sendAutoFillOffer", async () => {
    setResults("sessions", []);
    setResults("clients", [makeClient({ id: 7, name: "Jordan Lee" })]);
    setResults("singleClient", makeClient({ id: 7, name: "Jordan Lee" }));
    const { autoFillCancelledSlot } = await import("./auto-fill");
    const result = await autoFillCancelledSlot("2026-06-03", "4pm", 99);
    expect(result.offered).toBe(true);
    expect(result.clientName).toBe("Jordan Lee");
    expect(mockSendSMS).toHaveBeenCalled();
  });

  it("returns offered false when no candidates", async () => {
    setResults("sessions", []);
    setResults("clients", []);
    const { autoFillCancelledSlot } = await import("./auto-fill");
    const result = await autoFillCancelledSlot("2026-06-03", "4pm", 99);
    expect(result.offered).toBe(false);
  });
});
