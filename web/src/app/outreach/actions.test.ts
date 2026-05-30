import { describe, it, expect, vi, beforeEach } from "vitest";

/* ---------- Mocks ---------- */

const mockSendSMS = vi.fn();
const mockRevalidatePath = vi.fn();

// Mock chain builder helpers
function chainGet(value: unknown) {
  return {
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          get: () => value,
        }),
      }),
      where: () => ({
        get: () => value,
        run: () => {},
      }),
    }),
  };
}

function chainReturningGet(value: unknown) {
  return {
    values: () => ({
      returning: () => ({
        get: () => value,
      }),
    }),
  };
}

function chainRun() {
  return {
    set: () => ({
      where: () => ({
        run: () => {},
      }),
    }),
  };
}

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  outreach: { id: "id", clientId: "client_id", sessionId: "session_id", messageText: "message_text" },
  sessions: { id: "id", clientId: "client_id", scheduledDate: "scheduled_date", scheduledTime: "scheduled_time", slot: "slot", status: "status" },
  clients: { id: "id", name: "name", phone: "phone" },
}));

vi.mock("@/lib/twilio", () => ({
  sendSMS: (...args: unknown[]) => mockSendSMS(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

const { sendOutreachBatch, retrySend } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
});

/* ================================================================== */
/*  sendOutreachBatch                                                  */
/* ================================================================== */
describe("sendOutreachBatch", () => {
  const fakeSession = {
    id: 1,
    clientId: 10,
    clientName: "John Smith",
    clientPhone: "+15551234567",
    scheduledDate: "2026-06-03",
    scheduledTime: "16:00",
    slot: "4pm",
  };

  function setupForSuccess() {
    // db.select() for session lookup
    mockDbSelect.mockReturnValue(chainGet(fakeSession));
    // db.insert() for outreach record
    mockDbInsert.mockReturnValue(
      chainReturningGet({ id: 100, clientId: 10, sessionId: 1 }),
    );
    // db.update() (only called on error)
    mockDbUpdate.mockReturnValue(chainRun());
    // sendSMS succeeds
    mockSendSMS.mockResolvedValue("SM123");
  }

  it("creates outreach records and sends SMS for each session", async () => {
    setupForSuccess();

    const results = await sendOutreachBatch([1], "2026-06-01");

    expect(mockDbInsert).toHaveBeenCalled();
    expect(mockSendSMS).toHaveBeenCalledWith(
      "+15551234567",
      expect.stringContaining("Hey John"),
    );
    expect(results).toEqual([{ sessionId: 1, success: true }]);
  });

  it("sends personalized message with first name and slot", async () => {
    setupForSuccess();

    await sendOutreachBatch([1], "2026-06-01");

    const message = mockSendSMS.mock.calls[0][1] as string;
    expect(message).toContain("John");
    expect(message).toContain("4pm");
  });

  it("records error in DB when sendSMS fails", async () => {
    mockDbSelect.mockReturnValue(chainGet(fakeSession));
    mockDbInsert.mockReturnValue(
      chainReturningGet({ id: 100, clientId: 10, sessionId: 1 }),
    );
    mockDbUpdate.mockReturnValue(chainRun());
    mockSendSMS.mockRejectedValue(new Error("Twilio rate limit"));

    const results = await sendOutreachBatch([1], "2026-06-01");

    expect(mockDbUpdate).toHaveBeenCalled();
    expect(results).toEqual([
      { sessionId: 1, success: false, error: "Twilio rate limit" },
    ]);
  });

  it("handles multiple sessions with mixed success/failure", async () => {
    const session2 = { ...fakeSession, id: 2, clientName: "Jane Doe", clientPhone: "+15559876543" };

    let selectCallCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCallCount++;
      return chainGet(selectCallCount === 1 ? fakeSession : session2);
    });

    mockDbInsert.mockImplementation(() => {
      return chainReturningGet({ id: 100 + selectCallCount, clientId: 10, sessionId: selectCallCount });
    });

    mockDbUpdate.mockReturnValue(chainRun());

    // First succeeds, second fails
    mockSendSMS
      .mockResolvedValueOnce("SM123")
      .mockRejectedValueOnce(new Error("number not found"));

    const results = await sendOutreachBatch([1, 2], "2026-06-01");

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ sessionId: 1, success: true });
    expect(results[1]).toEqual({ sessionId: 2, success: false, error: "number not found" });
  });

  it("skips sessions that don't exist in DB", async () => {
    mockDbSelect.mockReturnValue(chainGet(undefined));

    const results = await sendOutreachBatch([999], "2026-06-01");

    expect(mockSendSMS).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it("calls revalidatePath after processing", async () => {
    setupForSuccess();

    await sendOutreachBatch([1], "2026-06-01");

    expect(mockRevalidatePath).toHaveBeenCalledWith("/outreach");
  });

  it("returns results for each processed session", async () => {
    setupForSuccess();

    const results = await sendOutreachBatch([1], "2026-06-01");

    expect(results).toBeInstanceOf(Array);
    expect(results[0]).toHaveProperty("sessionId");
    expect(results[0]).toHaveProperty("success");
  });
});

/* ================================================================== */
/*  retrySend                                                          */
/* ================================================================== */
describe("retrySend", () => {
  const fakeRecord = {
    id: 100,
    clientId: 10,
    sessionId: 1,
    messageText: "Hey John, are you free Wednesday at 4pm for a session?",
    clientPhone: "+15551234567",
  };

  function setupForRetry(record: unknown) {
    mockDbSelect.mockReturnValue(chainGet(record));
    mockDbUpdate.mockReturnValue(chainRun());
  }

  it("re-sends the message and clears the error on success", async () => {
    setupForRetry(fakeRecord);
    mockSendSMS.mockResolvedValue("SM456");

    const result = await retrySend(100);

    expect(mockSendSMS).toHaveBeenCalledWith(
      "+15551234567",
      "Hey John, are you free Wednesday at 4pm for a session?",
    );
    expect(mockDbUpdate).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("updates error on repeated failure", async () => {
    setupForRetry(fakeRecord);
    mockSendSMS.mockRejectedValue(new Error("still broken"));

    const result = await retrySend(100);

    expect(mockDbUpdate).toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "still broken" });
  });

  it("returns not found when record does not exist", async () => {
    setupForRetry(undefined);

    const result = await retrySend(999);

    expect(mockSendSMS).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "Record not found" });
  });

  it("calls revalidatePath on successful retry", async () => {
    setupForRetry(fakeRecord);
    mockSendSMS.mockResolvedValue("SM456");

    await retrySend(100);

    expect(mockRevalidatePath).toHaveBeenCalledWith("/outreach");
  });

  it("calls revalidatePath even on failed retry", async () => {
    setupForRetry(fakeRecord);
    mockSendSMS.mockRejectedValue(new Error("fail"));

    await retrySend(100);

    expect(mockRevalidatePath).toHaveBeenCalledWith("/outreach");
  });
});
