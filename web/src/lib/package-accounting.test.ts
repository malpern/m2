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

const { deductSession, creditCancellation, getPackageBalance } = await import("./package-accounting");

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
