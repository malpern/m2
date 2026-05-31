import { describe, it, expect, vi, beforeEach } from "vitest";

/* ---------- Mocks ---------- */

const mockSendSMS = vi.fn();
const mockRevalidatePath = vi.fn();

// Mock chain builder helpers
function chainAll(values: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        all: () => values,
      }),
    }),
  };
}

function chainGet(value: unknown) {
  const terminalWhere = {
    get: () => value,
    run: () => {},
    orderBy: () => ({
      limit: () => ({
        get: () => null,
      }),
    }),
  };
  return {
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          get: () => value,
        }),
      }),
      where: () => terminalWhere,
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
  weeklySkips: { clientId: "client_id", weekOf: "week_of" },
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
    // First db.select() is for weeklySkips, then for session lookup
    mockDbSelect
      .mockReturnValueOnce(chainAll([]))  // weeklySkips query → no skips
      .mockReturnValue(chainGet(fakeSession));
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
    mockDbSelect
      .mockReturnValueOnce(chainAll([]))
      .mockReturnValue(chainGet(fakeSession));
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
    const session2 = { ...fakeSession, id: 2, clientId: 20, clientName: "Jane Doe", clientPhone: "+15559876543" };

    let selectCallCount = 0;
    mockDbSelect.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return chainAll([]); // weeklySkips
      return chainGet(selectCallCount === 2 ? fakeSession : session2);
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
    mockDbSelect
      .mockReturnValueOnce(chainAll([]))
      .mockReturnValue(chainGet(undefined));

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
/*  sendOutreachBatch — multi-session                                  */
/* ================================================================== */
describe("sendOutreachBatch — multi-session", () => {
  const session1 = {
    id: 1, clientId: 10, clientName: "John Smith", clientPhone: "+15551234567",
    scheduledDate: "2026-06-02", scheduledTime: "15:00", slot: "3pm",
  };
  const session2 = {
    id: 2, clientId: 10, clientName: "John Smith", clientPhone: "+15551234567",
    scheduledDate: "2026-06-04", scheduledTime: "16:00", slot: "4pm",
  };

  it("groups multiple sessions for same client into one SMS", async () => {
    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return chainAll([]); // weeklySkips
      const idx = selectCall - 1;
      return chainGet(idx <= 2 ? (idx === 1 ? session1 : session2) : null);
    });
    mockDbInsert.mockReturnValue(
      chainReturningGet({ id: 100, clientId: 10, sessionId: 1 }),
    );
    mockDbUpdate.mockReturnValue(chainRun());
    mockSendSMS.mockResolvedValue("SM123");

    await sendOutreachBatch([1, 2], "2026-06-01");

    expect(mockSendSMS).toHaveBeenCalledTimes(1);
  });

  it("combined message lists all session days and slots", async () => {
    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return chainAll([]); // weeklySkips
      const idx = selectCall - 1;
      return chainGet(idx <= 2 ? (idx === 1 ? session1 : session2) : null);
    });
    mockDbInsert.mockReturnValue(
      chainReturningGet({ id: 100, clientId: 10, sessionId: 1 }),
    );
    mockDbUpdate.mockReturnValue(chainRun());
    mockSendSMS.mockResolvedValue("SM123");

    await sendOutreachBatch([1, 2], "2026-06-01");

    const message = mockSendSMS.mock.calls[0][1] as string;
    expect(message).toContain("Tuesday");
    expect(message).toContain("3pm");
    expect(message).toContain("Thursday");
    expect(message).toContain("4pm");
  });

  it("creates one outreach record per session with shared groupId", async () => {
    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return chainAll([]); // weeklySkips
      const idx = selectCall - 1;
      return chainGet(idx <= 2 ? (idx === 1 ? session1 : session2) : null);
    });

    const insertCalls: unknown[] = [];
    mockDbInsert.mockImplementation((...args: unknown[]) => {
      insertCalls.push(args);
      return chainReturningGet({ id: 100 + insertCalls.length, clientId: 10, sessionId: 1 });
    });
    mockDbUpdate.mockReturnValue(chainRun());
    mockSendSMS.mockResolvedValue("SM123");

    await sendOutreachBatch([1, 2], "2026-06-01");

    expect(mockDbInsert).toHaveBeenCalledTimes(2);
  });

  it("all sessions in group fail together on SMS error", async () => {
    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return chainAll([]); // weeklySkips
      const idx = selectCall - 1;
      return chainGet(idx <= 2 ? (idx === 1 ? session1 : session2) : null);
    });
    mockDbInsert.mockReturnValue(
      chainReturningGet({ id: 100, clientId: 10, sessionId: 1 }),
    );
    mockDbUpdate.mockReturnValue(chainRun());
    mockSendSMS.mockRejectedValue(new Error("Twilio error"));

    const results = await sendOutreachBatch([1, 2], "2026-06-01");

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
    expect(results[1].success).toBe(false);
  });

  it("sends separate SMS for different clients", async () => {
    const otherClientSession = {
      id: 3, clientId: 20, clientName: "Jane Doe", clientPhone: "+15559876543",
      scheduledDate: "2026-06-03", scheduledTime: "15:00", slot: "3pm",
    };

    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return chainAll([]); // weeklySkips
      const idx = selectCall - 1;
      return chainGet(idx <= 2 ? (idx === 1 ? session1 : otherClientSession) : null);
    });
    mockDbInsert.mockReturnValue(
      chainReturningGet({ id: 100, clientId: 10, sessionId: 1 }),
    );
    mockDbUpdate.mockReturnValue(chainRun());
    mockSendSMS.mockResolvedValue("SM123");

    await sendOutreachBatch([1, 3], "2026-06-01");

    expect(mockSendSMS).toHaveBeenCalledTimes(2);
  });

  it("single-session client still works without groupId", async () => {
    mockDbSelect
      .mockReturnValueOnce(chainAll([]))
      .mockReturnValue(chainGet(session1));
    mockDbInsert.mockReturnValue(
      chainReturningGet({ id: 100, clientId: 10, sessionId: 1 }),
    );
    mockDbUpdate.mockReturnValue(chainRun());
    mockSendSMS.mockResolvedValue("SM123");

    const results = await sendOutreachBatch([1], "2026-06-01");

    expect(mockSendSMS).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
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
