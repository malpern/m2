import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression tests for #227.
 *
 * The hazard: `sendSMS` used to return the bare string "DEV_SKIPPED" when the
 * dev guard blocked a number. That RESOLVES, so `logAndSend` — which writes the
 * outreach row as `awaiting_reply` before it sends, and only demotes the row in
 * its `catch` — left the row claiming to await a reply the client was never
 * asked for. `follow-ups` then expires such rows and sets the session to
 * `cancelled`.
 *
 * These tests assert on the row's final state rather than on sendSMS's return
 * value, because the row is what `follow-ups` acts on. A future refactor that
 * reintroduces a "successful-looking" skip has to break one of these.
 */

const updates: Array<{ id: number; set: Record<string, unknown> }> = [];
let lastWhereId = 0;

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: () => ({
        returning: () => ({ get: () => ({ id: 42 }) }),
        run: () => {},
      }),
    })),
    update: vi.fn(() => ({
      set: (set: Record<string, unknown>) => ({
        where: () => ({
          run: () => {
            updates.push({ id: lastWhereId, set });
          },
        }),
      }),
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  outreach: { id: "id", clientId: "client_id", direction: "direction", sessionId: "session_id" },
  clients: { id: "id" },
  sessions: { id: "id" },
}));

vi.mock("drizzle-orm", async (orig) => {
  const actual = await orig<typeof import("drizzle-orm")>();
  return { ...actual, eq: (_col: unknown, val: number) => { lastWhereId = val; return "eq"; } };
});

const mockSendSMS = vi.fn();
vi.mock("@/lib/twilio", () => ({ sendSMS: (...a: unknown[]) => mockSendSMS(...a) }));

vi.mock("@/lib/logger", () => ({
  syslog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logAndSend } from "./shared";

beforeEach(() => {
  vi.clearAllMocks();
  updates.length = 0;
  lastWhereId = 0;
});

describe("logAndSend — a message that was not sent must not look sent (#227)", () => {
  it("demotes the row to pending when the dev guard skips the send", async () => {
    mockSendSMS.mockResolvedValue({ status: "skipped", reason: "dev guard: blocked" });

    await logAndSend(1, 7, "2026-06-01", "+15550000000", "Are you free Tuesday?");

    const demotion = updates.find((u) => u.set.status === "pending");
    expect(demotion, "a skipped send must write the row back to pending").toBeDefined();
    expect(demotion!.id).toBe(42);
    expect(demotion!.set.sendError).toContain("dev guard");
  });

  it("never leaves the row in awaiting_reply after a skip — this is what cancels sessions", async () => {
    mockSendSMS.mockResolvedValue({ status: "skipped", reason: "dev guard: blocked" });

    await logAndSend(1, 7, "2026-06-01", "+15550000000", "Are you free Tuesday?");

    // follow-ups selects on status === "awaiting_reply" and cancels the session
    // when nothing answers. The row is inserted as awaiting_reply, so the only
    // thing standing between a skipped send and a cancelled booking is this
    // demotion actually happening.
    const stillAwaiting = updates.some((u) => u.set.status === "awaiting_reply");
    expect(stillAwaiting).toBe(false);
    expect(updates.some((u) => u.set.status === "pending")).toBe(true);
  });

  it("leaves the row alone when the message really was sent", async () => {
    mockSendSMS.mockResolvedValue({ status: "sent", sid: "SM123" });

    await logAndSend(1, 7, "2026-06-01", "+14082099509", "Are you free Tuesday?");

    expect(updates).toHaveLength(0);
  });

  it("still demotes the row when the send throws", async () => {
    mockSendSMS.mockRejectedValue(new Error("Twilio 500"));

    await logAndSend(1, 7, "2026-06-01", "+14082099509", "Are you free Tuesday?");

    const demotion = updates.find((u) => u.set.status === "pending");
    expect(demotion).toBeDefined();
    expect(demotion!.set.sendError).toBe("Twilio 500");
  });
});
