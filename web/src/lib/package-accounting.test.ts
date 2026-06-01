import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockSyslog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: () => ({
      values: () => ({
        run: () => {},
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          run: () => {},
        }),
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: () => ({
          values: () => ({
            run: () => {},
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              run: () => {},
            }),
          }),
        }),
      };
      return fn(tx);
    },
  },
}));

vi.mock("@/db/schema", () => ({
  packages: { id: "id", clientId: "client_id", status: "status", sessionsUsed: "sessions_used", totalSessions: "total_sessions" },
  packageTransactions: { id: "id", sessionId: "session_id", reason: "reason", packageId: "package_id" },
  sessions: { id: "id", clientId: "client_id", packageId: "package_id" },
  clients: { id: "id", name: "name" },
}));

vi.mock("@/lib/logger", () => ({
  syslog: mockSyslog,
}));

const { deductSession, creditCancellation, getPackageBalance, manualAdjustment } = await import("./package-accounting");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deductSession", () => {
  it("deducts 1 from package on session completion", async () => {
    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        return { from: () => ({ innerJoin: () => ({ where: () => ({ get: () => ({ id: 1, clientId: 10, packageId: 100, clientName: "John" }) }) }) }) };
      }
      if (selectCall === 2) {
        return { from: () => ({ where: () => ({ get: () => ({ id: 100, clientId: 10, totalSessions: 10, sessionsUsed: 3, status: "active" }) }) }) };
      }
      return { from: () => ({ where: () => ({ get: () => null }) }) };
    });

    const result = await deductSession(1);
    expect(result).toBe(true);
    expect(mockSyslog.info).toHaveBeenCalled();
  });

  it("returns false when session not found", async () => {
    mockDbSelect.mockReturnValue({ from: () => ({ innerJoin: () => ({ where: () => ({ get: () => null }) }) }) });
    const result = await deductSession(999);
    expect(result).toBe(false);
  });

  it("warns when no active package exists", async () => {
    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        return { from: () => ({ innerJoin: () => ({ where: () => ({ get: () => ({ id: 1, clientId: 10, packageId: null, clientName: "John" }) }) }) }) };
      }
      return { from: () => ({ where: () => ({ get: () => null }) }) };
    });

    const result = await deductSession(1);
    expect(result).toBe(false);
    expect(mockSyslog.warn).toHaveBeenCalled();
  });

  it("is idempotent — second call with same sessionId returns false", async () => {
    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        // First call: session lookup
        return { from: () => ({ innerJoin: () => ({ where: () => ({ get: () => ({ id: 1, clientId: 10, packageId: 100, clientName: "John" }) }) }) }) };
      }
      if (selectCall === 2) {
        // First call: package lookup
        return { from: () => ({ where: () => ({ get: () => ({ id: 100, clientId: 10, totalSessions: 10, sessionsUsed: 3, status: "active" }) }) }) };
      }
      if (selectCall === 3) {
        // First call: existing transaction check — none yet
        return { from: () => ({ where: () => ({ get: () => null }) }) };
      }
      if (selectCall === 4) {
        // Second call: session lookup
        return { from: () => ({ innerJoin: () => ({ where: () => ({ get: () => ({ id: 1, clientId: 10, packageId: 100, clientName: "John" }) }) }) }) };
      }
      if (selectCall === 5) {
        // Second call: package lookup
        return { from: () => ({ where: () => ({ get: () => ({ id: 100, clientId: 10, totalSessions: 10, sessionsUsed: 4, status: "active" }) }) }) };
      }
      if (selectCall === 6) {
        // Second call: existing transaction check — already exists
        return { from: () => ({ where: () => ({ get: () => ({ id: 999 }) }) }) };
      }
      return { from: () => ({ where: () => ({ get: () => null }) }) };
    });

    const first = await deductSession(1);
    expect(first).toBe(true);

    const second = await deductSession(1);
    expect(second).toBe(false);
  });
});

describe("creditCancellation", () => {
  it("returns false when no prior deduction exists", async () => {
    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        return { from: () => ({ innerJoin: () => ({ where: () => ({ get: () => ({ id: 1, clientId: 10, clientName: "John" }) }) }) }) };
      }
      return { from: () => ({ where: () => ({ get: () => null }) }) };
    });

    const result = await creditCancellation(1);
    expect(result).toBe(false);
  });

  it("returns false when session was never deducted", async () => {
    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        // Session exists
        return { from: () => ({ innerJoin: () => ({ where: () => ({ get: () => ({ id: 5, clientId: 10, clientName: "John" }) }) }) }) };
      }
      if (selectCall === 2) {
        // No completed deduction transaction exists
        return { from: () => ({ where: () => ({ get: () => null }) }) };
      }
      return { from: () => ({ where: () => ({ get: () => null }) }) };
    });

    const result = await creditCancellation(5);
    expect(result).toBe(false);
  });

  it("returns false on second credit attempt (already credited)", async () => {
    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        // First call: session lookup
        return { from: () => ({ innerJoin: () => ({ where: () => ({ get: () => ({ id: 1, clientId: 10, clientName: "John" }) }) }) }) };
      }
      if (selectCall === 2) {
        // First call: deduction exists
        return { from: () => ({ where: () => ({ get: () => ({ id: 50, packageId: 100 }) }) }) };
      }
      if (selectCall === 3) {
        // First call: no prior credit
        return { from: () => ({ where: () => ({ get: () => null }) }) };
      }
      if (selectCall === 4) {
        // First call: package lookup
        return { from: () => ({ where: () => ({ get: () => ({ id: 100, clientId: 10, totalSessions: 10, sessionsUsed: 4, status: "active" }) }) }) };
      }
      if (selectCall === 5) {
        // Second call: session lookup
        return { from: () => ({ innerJoin: () => ({ where: () => ({ get: () => ({ id: 1, clientId: 10, clientName: "John" }) }) }) }) };
      }
      if (selectCall === 6) {
        // Second call: deduction exists
        return { from: () => ({ where: () => ({ get: () => ({ id: 50, packageId: 100 }) }) }) };
      }
      if (selectCall === 7) {
        // Second call: already credited
        return { from: () => ({ where: () => ({ get: () => ({ id: 77 }) }) }) };
      }
      return { from: () => ({ where: () => ({ get: () => null }) }) };
    });

    const first = await creditCancellation(1);
    expect(first).toBe(true);

    const second = await creditCancellation(1);
    expect(second).toBe(false);
  });
});

describe("manualAdjustment", () => {
  it("adjusts package balance and records transaction", async () => {
    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        // Active package lookup
        return { from: () => ({ where: () => ({ get: () => ({ id: 100, clientId: 10, totalSessions: 10, sessionsUsed: 5, status: "active" }) }) }) };
      }
      return { from: () => ({ where: () => ({ get: () => null }) }) };
    });

    const result = await manualAdjustment(10, 2, "Makeup sessions added");
    expect(result).toBe(true);
    expect(mockSyslog.info).toHaveBeenCalled();
  });

  it("returns false when no active package", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({ where: () => ({ get: () => null }) }),
    });

    const result = await manualAdjustment(10, 2, "Should fail");
    expect(result).toBe(false);
    expect(mockSyslog.warn).toHaveBeenCalled();
  });
});

describe("getPackageBalance", () => {
  it("returns balance for active package", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          get: () => ({ id: 100, totalSessions: 10, sessionsUsed: 3, status: "active" }),
        }),
      }),
    });

    const result = await getPackageBalance(10);
    expect(result).toEqual({ remaining: 7, total: 10, used: 3 });
  });

  it("returns null when no active package", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({ where: () => ({ get: () => null }) }),
    });

    const result = await getPackageBalance(10);
    expect(result).toBeNull();
  });
});
