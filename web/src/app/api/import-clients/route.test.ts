import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbDelete = vi.fn();
const mockDbTransaction = vi.fn();
const mockReadSheet = vi.fn();
const mockListEvents = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    delete: (...args: unknown[]) => mockDbDelete(...args),
    transaction: (...args: unknown[]) => mockDbTransaction(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  clients: {},
  packages: {},
  sessions: {},
  outreach: {},
}));

vi.mock("@/lib/google-sheets", () => ({
  readSheet: (...args: unknown[]) => mockReadSheet(...args),
}));

vi.mock("@/lib/google-calendar", () => ({
  listEvents: (...args: unknown[]) => mockListEvents(...args),
}));

const { GET, POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();

  mockDbSelect.mockReturnValue({
    from: () => ({
      all: () => [],
    }),
  });

  mockReadSheet.mockResolvedValue([]);
  mockListEvents.mockResolvedValue([]);
});

describe("GET /api/import-clients", () => {
  it("returns preview with counts when sheets have data", async () => {
    // Mock sheet data with header + 1 data row
    mockReadSheet.mockImplementation((_id: string, tab: string) => {
      if (tab.includes("Sessions")) {
        return [
          ["Date", "Name", "Col2", "Package", "Price", "Payment"],
          ["1/15/2026", "John Doe", "", "2 of 10", "$150", "Paid"],
        ];
      }
      if (tab.includes("Client Information")) {
        return [
          ["First", "Last", "Parent", "Col3", "Phone", "Email", "Col6", "Col7", "Col8", "Sport"],
          ["John", "Doe", "Jane Doe", "", "555-1234", "john@test.com", "", "", "", "Basketball"],
        ];
      }
      return [];
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sheetsCount).toBe(1);
    expect(body.preview).toBeDefined();
    expect(Array.isArray(body.preview)).toBe(true);
  });

  it("returns empty preview when sheets are empty", async () => {
    mockReadSheet.mockResolvedValue([]);
    mockListEvents.mockResolvedValue([]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.preview).toEqual([]);
    expect(body.sheetsCount).toBe(0);
  });

  it("returns 500 when Google API fails", async () => {
    mockReadSheet.mockRejectedValue(new Error("Google API error"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Failed to fetch client data from Google");
  });

  it("filters out blocked names from preview", async () => {
    mockReadSheet.mockImplementation((_id: string, tab: string) => {
      if (tab.includes("Sessions")) {
        return [
          ["Date", "Name", "Col2", "Package", "Price", "Payment"],
          ["1/15/2026", "Melody Gymnastics", "", "", "$100", ""],
          ["1/16/2026", "Real Client", "", "1 of 10", "$150", ""],
        ];
      }
      return [["First", "Last"]];
    });

    const res = await GET();
    const body = await res.json();

    const names = body.preview.map((p: { name: string }) => p.name);
    expect(names).not.toContain("Melody Gymnastics");
  });
});

describe("POST /api/import-clients", () => {
  it("returns 400 when no clients selected", async () => {
    const req = new Request("http://localhost/api/import-clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectedClients: [] }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("No clients selected");
  });

  it("returns 400 when selectedClients is missing", async () => {
    const req = new Request("http://localhost/api/import-clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("No clients selected");
  });

  it("imports selected clients via transaction", async () => {
    const selectedClients = [
      {
        name: "Test Client",
        inSheets: true,
        inCalendar: true,
        sessions2026: 5,
        calendarSessions: 3,
        lastDate: "2026-05-01",
        rate: 15000,
        sessionType: "individual",
        lastPackage: "3 of 10",
        packageSize: 10,
        hasDue: false,
        parentGuardian: null,
        email: "test@example.com",
        preferredDays: ["monday"],
        preferredTime: "3pm",
        history: [],
      },
    ];

    const insertedClients = [{ id: 1, name: "Test Client" }];

    mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        delete: () => ({ run: vi.fn() }),
        insert: () => ({
          values: () => ({
            returning: () => ({
              all: () => insertedClients,
            }),
            run: vi.fn(),
          }),
        }),
      };
      return fn(tx);
    });

    // Mock listEvents for calendar history (called inside POST)
    mockListEvents.mockResolvedValue([]);

    const req = new Request("http://localhost/api/import-clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectedClients }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.imported).toBe(1);
    expect(body.clients[0].name).toBe("Test Client");
  });

  it("returns 500 when transaction fails", async () => {
    mockDbTransaction.mockRejectedValue(new Error("DB error"));
    mockListEvents.mockResolvedValue([]);

    const req = new Request("http://localhost/api/import-clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        selectedClients: [
          {
            name: "Fail Client",
            inSheets: true,
            inCalendar: false,
            sessions2026: 1,
            calendarSessions: 0,
            lastDate: "2026-01-01",
            rate: 10000,
            sessionType: "individual",
            lastPackage: "",
            packageSize: 1,
            hasDue: false,
            parentGuardian: null,
            email: null,
            preferredDays: [],
            preferredTime: "",
            history: [],
          },
        ],
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Failed to import clients");
  });
});
