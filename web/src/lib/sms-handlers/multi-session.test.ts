import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          get: () => ({ id: 42, scheduledDate: "2026-06-02", slot: "4pm", status: "proposed" }),
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
  outreach: { id: "id", clientId: "client_id", direction: "direction", outreachGroupId: "outreach_group_id" },
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
  classifyMultiSessionReply: vi.fn(),
  composeReply: vi.fn().mockResolvedValue("You're all set!"),
  ClassifyBillingError: class extends Error { constructor() { super("billing"); } },
}));

vi.mock("@/lib/suggest-alternatives", () => ({
  getOpenSlots: vi.fn().mockResolvedValue([]),
  rankSlotsForClient: vi.fn().mockResolvedValue([]),
  diversifyAcrossDays: (slots: { day: string }[], n: number) => slots.slice(0, n),
  isSlotStillOpen: vi.fn().mockResolvedValue(true),
  tryBookSlot: vi.fn().mockResolvedValue(false),
  tagOfferedSlots: (text: string) => text + "\n[offered:mock]",
}));

vi.mock("@/lib/gcal-sync", () => ({
  syncSessionToCalendar: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/invite-prompt", () => ({
  getInvitePrompt: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/package-accounting", () => ({
  creditCancellation: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/auto-fill", () => ({
  autoFillCancelledSlot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/scheduler", () => ({
  getMonday: () => new Date("2026-06-01T00:00:00Z"),
}));

import { handleMultiSessionReply } from "./multi-session";
import type { WebhookContext } from "./shared";
import { sendSMS } from "@/lib/twilio";
import { syslog } from "@/lib/logger";
import { classifyMultiSessionReply, composeReply, ClassifyBillingError } from "@/lib/classify-reply";
import { getOpenSlots, rankSlotsForClient, tryBookSlot } from "@/lib/suggest-alternatives";
import { syncSessionToCalendar } from "@/lib/gcal-sync";
import { getInvitePrompt } from "@/lib/invite-prompt";
import { creditCancellation } from "@/lib/package-accounting";
import { autoFillCancelledSlot } from "@/lib/auto-fill";
import { db } from "@/db";

const mockSendSMS = vi.mocked(sendSMS);
const mockSyslog = vi.mocked(syslog);
const mockClassifyMulti = vi.mocked(classifyMultiSessionReply);
const mockComposeReply = vi.mocked(composeReply);
const mockGetOpenSlots = vi.mocked(getOpenSlots);
const mockRankSlots = vi.mocked(rankSlotsForClient);
const mockTryBookSlot = vi.mocked(tryBookSlot);
const mockSyncCal = vi.mocked(syncSessionToCalendar);
const mockGetInvitePrompt = vi.mocked(getInvitePrompt);
const mockCreditCancel = vi.mocked(creditCancellation);
const mockAutoFill = vi.mocked(autoFillCancelledSlot);
const mockDbSelect = vi.mocked(db.select);

const tuesdaySession = { id: 42, scheduledDate: "2026-06-02", slot: "4pm", scheduledTime: "16:00", status: "proposed" };
const thursdaySession = { id: 43, scheduledDate: "2026-06-04", slot: "5pm", scheduledTime: "17:00", status: "proposed" };

function makeCtx(overrides?: Partial<WebhookContext>): WebhookContext {
  return {
    client: { id: 1, name: "Sam Chen", phone: "+15551234567" } as WebhookContext["client"],
    body: "yes both work",
    weekOf: "2026-06-01",
    firstName: "Sam",
    lastSent: { id: 10, sessionId: 42, outreachGroupId: "group-1", messageText: "Tuesday at 4pm and Thursday at 5pm?" } as unknown as WebhookContext["lastSent"],
    recentOutreach: [],
    history: [{ direction: "sent" as const, text: "Tuesday at 4pm and Thursday at 5pm?" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendSMS.mockResolvedValue("SM123");
  mockComposeReply.mockResolvedValue("You're all set!");
  mockSyncCal.mockResolvedValue(undefined);
  mockGetInvitePrompt.mockResolvedValue(null);
  mockCreditCancel.mockResolvedValue(true);
  mockAutoFill.mockResolvedValue({ offered: false });
  mockGetOpenSlots.mockResolvedValue([]);
  mockRankSlots.mockResolvedValue([]);
  mockTryBookSlot.mockResolvedValue(false);

  let selectCall = 0;
  mockDbSelect.mockImplementation(() => {
    selectCall++;
    return {
      from: () => ({
        where: () => ({
          get: () => {
            if (selectCall % 2 === 1) return { ...tuesdaySession };
            return { ...thursdaySession };
          },
          all: () => [],
        }),
      }),
    } as unknown as ReturnType<typeof db.select>;
  });
});

describe("handleMultiSessionReply", () => {
  describe("confirm all sessions", () => {
    it("confirms both sessions when classifier says confirm all", async () => {
      mockClassifyMulti.mockResolvedValue({
        actions: [
          { day: "tuesday", slot: "4pm", action: "confirm" },
          { day: "thursday", slot: "5pm", action: "confirm" },
        ],
        confidence: 0.95,
      });

      await handleMultiSessionReply(makeCtx(), [42, 43]);

      expect(mockSyncCal).toHaveBeenCalledWith(42);
      expect(mockSyncCal).toHaveBeenCalledWith(43);
      expect(mockComposeReply).toHaveBeenCalledWith(
        expect.objectContaining({
          scenario: expect.objectContaining({ type: "multi_session_final" }),
        }),
      );
      expect(mockSendSMS).toHaveBeenCalledOnce();
    });

    it("appends invite prompt on final confirmation", async () => {
      mockClassifyMulti.mockResolvedValue({
        actions: [
          { day: "tuesday", slot: "4pm", action: "confirm" },
          { day: "thursday", slot: "5pm", action: "confirm" },
        ],
        confidence: 0.95,
      });
      mockGetInvitePrompt.mockResolvedValue("\n\nWant a calendar invite?");

      await handleMultiSessionReply(makeCtx(), [42, 43]);

      const sentMsg = mockSendSMS.mock.calls[0][1];
      expect(sentMsg).toContain("calendar invite");
    });
  });

  describe("mixed confirm and cancel", () => {
    it("confirms one and cancels the other", async () => {
      mockClassifyMulti.mockResolvedValue({
        actions: [
          { day: "tuesday", slot: "4pm", action: "confirm" },
          { day: "thursday", slot: "5pm", action: "cancel" },
        ],
        confidence: 0.95,
      });

      await handleMultiSessionReply(makeCtx({ body: "tuesday good, cancel thursday" }), [42, 43]);

      expect(mockSyncCal).toHaveBeenCalledWith(42);
      expect(mockSyncCal).toHaveBeenCalledWith(43);
      expect(mockCreditCancel).toHaveBeenCalledWith(43);
      expect(mockAutoFill).toHaveBeenCalled();
    });
  });

  describe("reschedule", () => {
    it("offers alternatives when reschedule requested", async () => {
      mockClassifyMulti.mockResolvedValue({
        actions: [
          { day: "tuesday", slot: "4pm", action: "confirm" },
          { day: "thursday", slot: "5pm", action: "reschedule", requestedDay: "friday" },
        ],
        confidence: 0.95,
      });
      const slots = [{ day: "friday", date: "2026-06-05", slot: "3pm" as const, time: "15:00" }];
      mockGetOpenSlots.mockResolvedValue(slots);
      mockRankSlots.mockResolvedValue(slots.map((s) => ({ ...s, score: 0 })));
      mockTryBookSlot.mockResolvedValue(true);

      await handleMultiSessionReply(makeCtx({ body: "tuesday yes, move thursday to friday" }), [42, 43]);

      expect(mockTryBookSlot).toHaveBeenCalled();
      expect(mockComposeReply).toHaveBeenCalledWith(
        expect.objectContaining({
          scenario: expect.objectContaining({ type: "multi_session_update" }),
        }),
      );
    });

    it("offers general alternatives when no specific slot requested", async () => {
      mockClassifyMulti.mockResolvedValue({
        actions: [
          { day: "thursday", slot: "5pm", action: "reschedule" },
        ],
        confidence: 0.95,
      });
      const slots = [
        { day: "monday", date: "2026-06-01", slot: "3pm" as const, time: "15:00" },
        { day: "friday", date: "2026-06-05", slot: "4pm" as const, time: "16:00" },
      ];
      mockGetOpenSlots.mockResolvedValue(slots);
      mockRankSlots.mockResolvedValue(slots.map((s) => ({ ...s, score: 0 })));

      await handleMultiSessionReply(makeCtx({ body: "can we move thursday?" }), [42, 43]);

      expect(mockSendSMS).toHaveBeenCalledOnce();
    });
  });

  describe("classifier error", () => {
    it("escalates to Matt on classify error", async () => {
      mockClassifyMulti.mockRejectedValue(new Error("API error"));

      await handleMultiSessionReply(makeCtx(), [42, 43]);

      const sentMsg = mockSendSMS.mock.calls[0][1];
      expect(sentMsg).toContain("check with Matt");
      expect(mockSyslog.error).toHaveBeenCalledWith(
        "classifier",
        expect.any(String),
        expect.stringContaining("ai_classify_error"),
        expect.any(Object),
      );
    });

    it("escalates on billing error", async () => {
      mockClassifyMulti.mockRejectedValue(new ClassifyBillingError());

      await handleMultiSessionReply(makeCtx(), [42, 43]);

      const sentMsg = mockSendSMS.mock.calls[0][1];
      expect(sentMsg).toContain("check with Matt");
    });
  });

  describe("unmatched action day", () => {
    it("warns when action day doesn't match any session", async () => {
      mockClassifyMulti.mockResolvedValue({
        actions: [
          { day: "saturday", slot: "3pm", action: "confirm" },
        ],
        confidence: 0.95,
      });

      await handleMultiSessionReply(makeCtx(), [42, 43]);

      expect(mockSyslog.warn).toHaveBeenCalledWith(
        "classifier",
        expect.stringContaining("couldn't match"),
        expect.any(String),
        expect.any(Object),
      );
    });
  });
});
