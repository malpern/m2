import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          get: () => ({ id: 42, scheduledDate: "2026-06-03", slot: "4pm", status: "proposed" }),
          all: () => [],
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: () => ({
        where: () => ({ run: () => {} }),
      }),
    })),
    insert: vi.fn(() => ({
      values: () => ({
        run: () => {},
        returning: () => ({ get: () => ({ id: 99 }) }),
      }),
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  outreach: { clientId: "client_id", direction: "direction", outreachGroupId: "outreach_group_id" },
  sessions: { id: "id" },
  clients: { id: "id" },
}));

vi.mock("@/lib/twilio", () => ({
  sendSMS: vi.fn().mockResolvedValue("SM123"),
}));

vi.mock("@/lib/logger", () => ({
  syslog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/classify-reply", () => ({
  composeReply: vi.fn().mockResolvedValue("Got it, cancelled."),
}));

vi.mock("@/lib/package-accounting", () => ({
  creditCancellation: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/gcal-sync", () => ({
  syncSessionToCalendar: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auto-fill", () => ({
  autoFillCancelledSlot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/scheduler", () => ({
  getMonday: () => new Date("2026-06-01T00:00:00Z"),
}));

vi.mock("@/lib/suggest-alternatives", () => ({
  getOpenSlots: vi.fn(),
  rankSlotsForClient: vi.fn(),
  diversifyAcrossDays: vi.fn(),
  tagOfferedSlots: vi.fn(),
}));

import { handleCancellation, handleConfirmedSessionCancellation } from "./cancellation";
import type { WebhookContext } from "./shared";
import { sendSMS } from "@/lib/twilio";
import { composeReply } from "@/lib/classify-reply";
import { creditCancellation } from "@/lib/package-accounting";
import { syncSessionToCalendar } from "@/lib/gcal-sync";
import { autoFillCancelledSlot } from "@/lib/auto-fill";
import { db } from "@/db";

const mockSendSMS = vi.mocked(sendSMS);
const mockComposeReply = vi.mocked(composeReply);
const mockCreditCancellation = vi.mocked(creditCancellation);
const mockSyncSessionToCalendar = vi.mocked(syncSessionToCalendar);
const mockAutoFillCancelledSlot = vi.mocked(autoFillCancelledSlot);
const mockDbSelect = vi.mocked(db.select);

function makeCtx(overrides?: Partial<WebhookContext>): WebhookContext {
  return {
    client: { id: 1, name: "Alex Lee", phone: "+15551234567" } as WebhookContext["client"],
    body: "cancel my session",
    weekOf: "2026-06-01",
    firstName: "Alex",
    lastSent: { id: 10, sessionId: 42, outreachGroupId: null } as unknown as WebhookContext["lastSent"],
    recentOutreach: [],
    history: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendSMS.mockResolvedValue("SM123");
  mockComposeReply.mockResolvedValue("Got it, cancelled.");
  mockCreditCancellation.mockResolvedValue(true);
  mockSyncSessionToCalendar.mockResolvedValue(undefined);
  mockAutoFillCancelledSlot.mockResolvedValue({ offered: false });
  mockDbSelect.mockReturnValue({
    from: () => ({
      where: () => ({
        get: () => ({ id: 42, scheduledDate: "2026-06-03", slot: "4pm", status: "proposed" }),
        all: () => [],
      }),
    }),
  } as unknown as ReturnType<typeof db.select>);
});

describe("handleCancellation", () => {
  it("cancels the session and sends a reply", async () => {
    await handleCancellation(makeCtx(), "cancellation");

    expect(mockCreditCancellation).toHaveBeenCalledWith(42);
    expect(mockSyncSessionToCalendar).toHaveBeenCalledWith(42);
    expect(mockComposeReply).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: "Alex",
        scenario: expect.objectContaining({ type: "cancellation" }),
      }),
    );
    expect(mockSendSMS).toHaveBeenCalledOnce();
  });

  it("uses skip_week scenario when type is skip_week", async () => {
    await handleCancellation(makeCtx(), "skip_week");

    expect(mockComposeReply).toHaveBeenCalledWith(
      expect.objectContaining({
        scenario: expect.objectContaining({ type: "skip_week" }),
      }),
    );
  });

  it("triggers auto-fill for the cancelled slot", async () => {
    await handleCancellation(makeCtx(), "cancellation");

    expect(mockAutoFillCancelledSlot).toHaveBeenCalledWith("2026-06-03", "4pm", 1);
  });

  it("includes the day label in cancellation reply", async () => {
    await handleCancellation(makeCtx(), "cancellation");

    expect(mockComposeReply).toHaveBeenCalledWith(
      expect.objectContaining({
        scenario: expect.objectContaining({
          type: "cancellation",
          day: "Wednesday",
        }),
      }),
    );
  });

  it("handles no session gracefully with fallback day label", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          get: () => null,
          all: () => [],
        }),
      }),
    } as unknown as ReturnType<typeof db.select>);

    await handleCancellation(makeCtx(), "cancellation");

    expect(mockComposeReply).toHaveBeenCalledWith(
      expect.objectContaining({
        scenario: expect.objectContaining({ day: "your session" }),
      }),
    );
  });
});

describe("handleConfirmedSessionCancellation", () => {
  it("cancels confirmed session and sends reply", async () => {
    await handleConfirmedSessionCancellation(makeCtx());

    expect(mockCreditCancellation).toHaveBeenCalledWith(42);
    expect(mockSyncSessionToCalendar).toHaveBeenCalledWith(42);
    expect(mockSendSMS).toHaveBeenCalledOnce();
  });

  it("triggers auto-fill after cancellation", async () => {
    await handleConfirmedSessionCancellation(makeCtx());

    expect(mockAutoFillCancelledSlot).toHaveBeenCalledWith("2026-06-03", "4pm", 1);
  });
});
