import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: () => ({
        run: () => {},
        returning: () => ({ get: () => ({ id: 99 }) }),
      }),
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  outreach: { clientId: "client_id", direction: "direction" },
  clients: { id: "id" },
}));

vi.mock("@/lib/twilio", () => ({
  sendSMS: vi.fn().mockResolvedValue("SM123"),
}));

vi.mock("@/lib/logger", () => ({
  syslog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/package-accounting", () => ({
  getPackageBalance: vi.fn(),
}));

vi.mock("@/lib/scheduler", () => ({
  getMonday: () => new Date("2026-06-01T00:00:00Z"),
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

import { isBalanceInquiry, handleBalanceInquiry } from "./balance";
import type { WebhookContext } from "./shared";
import { sendSMS } from "@/lib/twilio";
import { syslog } from "@/lib/logger";
import { getPackageBalance } from "@/lib/package-accounting";

const mockSendSMS = vi.mocked(sendSMS);
const mockSyslog = vi.mocked(syslog);
const mockGetPackageBalance = vi.mocked(getPackageBalance);

function makeCtx(overrides?: Partial<WebhookContext>): WebhookContext {
  return {
    client: { id: 1, name: "John Doe", phone: "+15551234567" } as WebhookContext["client"],
    body: "how many sessions do i have left",
    weekOf: "2026-06-01",
    firstName: "John",
    lastSent: { id: 10, sessionId: 5, outreachGroupId: null } as WebhookContext["lastSent"],
    recentOutreach: [],
    history: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendSMS.mockResolvedValue("SM123");
});

describe("isBalanceInquiry", () => {
  it("matches 'how many sessions do I have left'", () => {
    expect(isBalanceInquiry("how many sessions do i have left?")).toBe(true);
  });

  it("matches 'sessions remaining'", () => {
    expect(isBalanceInquiry("how many sessions remaining")).toBe(true);
  });

  it("matches 'package balance'", () => {
    expect(isBalanceInquiry("what's my package balance?")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(isBalanceInquiry("yes sounds good")).toBe(false);
  });

  it("does not match partial keywords", () => {
    expect(isBalanceInquiry("session")).toBe(false);
  });
});

describe("handleBalanceInquiry", () => {
  it("replies with remaining sessions when package exists", async () => {
    mockGetPackageBalance.mockResolvedValue({ remaining: 7, total: 10, used: 3 });
    await handleBalanceInquiry(makeCtx());

    expect(mockSendSMS).toHaveBeenCalledOnce();
    const sentMsg = mockSendSMS.mock.calls[0][1];
    expect(sentMsg).toContain("7 sessions left");
    expect(sentMsg).toContain("3/10 used");
  });

  it("uses singular 'session' when 1 remaining", async () => {
    mockGetPackageBalance.mockResolvedValue({ remaining: 1, total: 10, used: 9 });
    await handleBalanceInquiry(makeCtx());

    const sentMsg = mockSendSMS.mock.calls[0][1];
    expect(sentMsg).toContain("1 session left");
    expect(sentMsg).not.toContain("sessions left");
  });

  it("replies with exhausted message when 0 remaining", async () => {
    mockGetPackageBalance.mockResolvedValue({ remaining: 0, total: 10, used: 10 });
    await handleBalanceInquiry(makeCtx());

    const sentMsg = mockSendSMS.mock.calls[0][1];
    expect(sentMsg).toContain("all used up");
    expect(sentMsg).toContain("10/10");
  });

  it("replies with no-package message when balance is null", async () => {
    mockGetPackageBalance.mockResolvedValue(null);
    await handleBalanceInquiry(makeCtx());

    const sentMsg = mockSendSMS.mock.calls[0][1];
    expect(sentMsg).toContain("don't see an active package");
  });

  it("logs syslog info with balance details", async () => {
    mockGetPackageBalance.mockResolvedValue({ remaining: 5, total: 10, used: 5 });
    await handleBalanceInquiry(makeCtx());

    expect(mockSyslog.info).toHaveBeenCalledWith(
      "outreach",
      expect.stringContaining("asked about package balance"),
      expect.stringContaining("5/10"),
      expect.objectContaining({ clientId: 1 }),
    );
  });

  it("uses the client's first name in the reply", async () => {
    mockGetPackageBalance.mockResolvedValue({ remaining: 3, total: 8, used: 5 });
    await handleBalanceInquiry(makeCtx({ firstName: "Sarah" }));

    const sentMsg = mockSendSMS.mock.calls[0][1];
    expect(sentMsg).toContain("Sarah");
  });
});
