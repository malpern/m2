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
  classifyReply: vi.fn(),
  composeReply: vi.fn().mockResolvedValue("Sounds good!"),
  ClassifyBillingError: class extends Error { constructor() { super("billing"); } },
}));

vi.mock("@/lib/suggest-alternatives", () => ({
  getOpenSlots: vi.fn().mockResolvedValue([]),
  rankSlotsForClient: vi.fn().mockResolvedValue([]),
  diversifyAcrossDays: (slots: { day: string }[], n: number) => slots.slice(0, n),
  tryBookSlot: vi.fn().mockResolvedValue(false),
  tagOfferedSlots: (text: string) => text + "\n[offered:mock]",
  whySlotUnavailable: vi.fn().mockResolvedValue("not_available"),
}));

vi.mock("@/lib/gcal-sync", () => ({
  syncSessionToCalendar: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/invite-prompt", () => ({
  getInvitePrompt: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/package-accounting", () => ({
  getPackageBalance: vi.fn(),
  creditCancellation: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/auto-fill", () => ({
  autoFillCancelledSlot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/scheduler", () => ({
  getMonday: () => new Date("2026-06-01T00:00:00Z"),
}));

import { handleSingleSessionReply } from "./single-session";
import type { WebhookContext } from "./shared";
import { sendSMS } from "@/lib/twilio";
import { syslog } from "@/lib/logger";
import { classifyReply, composeReply, ClassifyBillingError } from "@/lib/classify-reply";
import { getOpenSlots, rankSlotsForClient, tryBookSlot, whySlotUnavailable } from "@/lib/suggest-alternatives";
import { syncSessionToCalendar } from "@/lib/gcal-sync";
import { getInvitePrompt } from "@/lib/invite-prompt";
import { getPackageBalance, creditCancellation } from "@/lib/package-accounting";
import { autoFillCancelledSlot } from "@/lib/auto-fill";

const mockSendSMS = vi.mocked(sendSMS);
const mockSyslog = vi.mocked(syslog);
const mockClassifyReply = vi.mocked(classifyReply);
const mockComposeReply = vi.mocked(composeReply);
const mockGetOpenSlots = vi.mocked(getOpenSlots);
const mockRankSlotsForClient = vi.mocked(rankSlotsForClient);
const mockTryBookSlot = vi.mocked(tryBookSlot);
const mockWhySlotUnavailable = vi.mocked(whySlotUnavailable);
const mockSyncSessionToCalendar = vi.mocked(syncSessionToCalendar);
const mockGetInvitePrompt = vi.mocked(getInvitePrompt);
const mockGetPackageBalance = vi.mocked(getPackageBalance);
const mockCreditCancellation = vi.mocked(creditCancellation);
const mockAutoFillCancelledSlot = vi.mocked(autoFillCancelledSlot);

function makeCtx(overrides?: Partial<WebhookContext>): WebhookContext {
  return {
    client: { id: 1, name: "Alex Lee", phone: "+15551234567" } as WebhookContext["client"],
    body: "yes that works",
    weekOf: "2026-06-01",
    firstName: "Alex",
    lastSent: { id: 10, sessionId: 42, outreachGroupId: null } as unknown as WebhookContext["lastSent"],
    recentOutreach: [],
    history: [{ direction: "sent" as const, text: "Tuesday at 4pm?" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendSMS.mockResolvedValue("SM123");
  mockComposeReply.mockResolvedValue("Sounds good!");
  mockSyncSessionToCalendar.mockResolvedValue(undefined);
  mockGetInvitePrompt.mockResolvedValue(null);
  mockCreditCancellation.mockResolvedValue(true);
  mockAutoFillCancelledSlot.mockResolvedValue(undefined);
  mockWhySlotUnavailable.mockResolvedValue("not_available");
  mockGetOpenSlots.mockResolvedValue([]);
  mockRankSlotsForClient.mockResolvedValue([]);
  mockTryBookSlot.mockResolvedValue(false);
});

describe("handleSingleSessionReply", () => {
  describe("classifier error handling", () => {
    it("escalates to Matt on classifier billing error", async () => {
      mockClassifyReply.mockRejectedValue(new ClassifyBillingError());

      await handleSingleSessionReply(makeCtx());

      expect(mockSendSMS).toHaveBeenCalledOnce();
      const sentMsg = mockSendSMS.mock.calls[0][1];
      expect(sentMsg).toContain("check with Matt");
      expect(mockSyslog.error).toHaveBeenCalledWith(
        "classifier",
        expect.any(String),
        expect.stringContaining("ai_billing_exhausted"),
        expect.any(Object),
      );
    });

    it("escalates to Matt on generic classifier error", async () => {
      mockClassifyReply.mockRejectedValue(new Error("API down"));

      await handleSingleSessionReply(makeCtx());

      const sentMsg = mockSendSMS.mock.calls[0][1];
      expect(sentMsg).toContain("check with Matt");
    });
  });

  describe("confirmed", () => {
    it("confirms session and sends reply", async () => {
      mockClassifyReply.mockResolvedValue({ interpretation: "confirmed", confidence: 0.95 });

      await handleSingleSessionReply(makeCtx());

      expect(mockSyncSessionToCalendar).toHaveBeenCalledWith(42);
      expect(mockComposeReply).toHaveBeenCalledWith(
        expect.objectContaining({
          scenario: expect.objectContaining({ type: "confirmed" }),
        }),
      );
      expect(mockSendSMS).toHaveBeenCalledOnce();
    });

    it("appends invite prompt when available", async () => {
      mockClassifyReply.mockResolvedValue({ interpretation: "confirmed", confidence: 0.95 });
      mockGetInvitePrompt.mockResolvedValue("\n\nWant a calendar invite?");

      await handleSingleSessionReply(makeCtx());

      const sentMsg = mockSendSMS.mock.calls[0][1];
      expect(sentMsg).toContain("calendar invite");
    });
  });

  describe("deferred", () => {
    it("sends follow-up message with 1-hour default", async () => {
      mockClassifyReply.mockResolvedValue({ interpretation: "deferred", confidence: 0.9 });

      await handleSingleSessionReply(makeCtx({ body: "I'll check later" }));

      const sentMsg = mockSendSMS.mock.calls[0][1];
      expect(sentMsg).toContain("Alex");
      expect(sentMsg).toContain("an hour");
    });

    it("uses custom delay when classifier provides one", async () => {
      mockClassifyReply.mockResolvedValue({
        interpretation: "deferred", confidence: 0.9, extractedDelayMinutes: 30,
      });

      await handleSingleSessionReply(makeCtx({ body: "give me 30 minutes" }));

      const sentMsg = mockSendSMS.mock.calls[0][1];
      expect(sentMsg).toContain("30 minutes");
    });

    it("uses hours label for delays >= 120 min", async () => {
      mockClassifyReply.mockResolvedValue({
        interpretation: "deferred", confidence: 0.9, extractedDelayMinutes: 180,
      });

      await handleSingleSessionReply(makeCtx());

      const sentMsg = mockSendSMS.mock.calls[0][1];
      expect(sentMsg).toContain("3 hours");
    });
  });

  describe("account_inquiry via classifier", () => {
    it("delegates to handleBalanceInquiry", async () => {
      mockClassifyReply.mockResolvedValue({ interpretation: "account_inquiry", confidence: 0.9 });
      mockGetPackageBalance.mockResolvedValue({ remaining: 5, total: 10, used: 5 });

      await handleSingleSessionReply(makeCtx({ body: "how many sessions" }));

      expect(mockSendSMS).toHaveBeenCalledOnce();
      const sentMsg = mockSendSMS.mock.calls[0][1];
      expect(sentMsg).toContain("5 sessions left");
    });
  });

  describe("declined_skip_week", () => {
    it("cancels session and uses skip_week scenario", async () => {
      mockClassifyReply.mockResolvedValue({ interpretation: "declined_skip_week", confidence: 0.9 });
      mockComposeReply.mockResolvedValue("No worries, enjoy the week off!");

      await handleSingleSessionReply(makeCtx({ body: "skip this week" }));

      expect(mockCreditCancellation).toHaveBeenCalledWith(42);
      expect(mockAutoFillCancelledSlot).toHaveBeenCalled();
    });
  });

  describe("cancellation", () => {
    it("cancels session and triggers auto-fill", async () => {
      mockClassifyReply.mockResolvedValue({ interpretation: "cancellation", confidence: 0.9 });

      await handleSingleSessionReply(makeCtx({ body: "cancel please" }));

      expect(mockCreditCancellation).toHaveBeenCalledWith(42);
      expect(mockSyncSessionToCalendar).toHaveBeenCalledWith(42);
      expect(mockAutoFillCancelledSlot).toHaveBeenCalled();
    });
  });

  describe("ambiguous", () => {
    it("asks for clarification on first ambiguous reply", async () => {
      mockClassifyReply.mockResolvedValue({ interpretation: "ambiguous", confidence: 0.3 });
      mockComposeReply.mockResolvedValue("Could you clarify?");

      await handleSingleSessionReply(makeCtx({ body: "maybe" }));

      expect(mockComposeReply).toHaveBeenCalledWith(
        expect.objectContaining({
          scenario: expect.objectContaining({ type: "clarification" }),
        }),
      );
    });

    it("escalates to Matt after 3+ ambiguous replies", async () => {
      mockClassifyReply.mockResolvedValue({ interpretation: "ambiguous", confidence: 0.3 });

      const ambiguousOutreach = Array.from({ length: 3 }, (_, i) => ({
        id: i + 1, direction: "received", interpretation: "ambiguous",
        messageText: "huh", sentAt: null, repliedAt: "2026-06-01T10:00:00Z",
      }));

      await handleSingleSessionReply(makeCtx({
        body: "huh",
        recentOutreach: ambiguousOutreach as unknown as WebhookContext["recentOutreach"],
      }));

      const sentMsg = mockSendSMS.mock.calls[0][1];
      expect(sentMsg).toContain("check with Matt");
      expect(mockSyslog.warn).toHaveBeenCalled();
    });
  });

  describe("selecting_offered_slot", () => {
    it("books the matched slot and confirms", async () => {
      mockClassifyReply.mockResolvedValue({
        interpretation: "selecting_offered_slot", confidence: 0.9,
        extractedDay: "Tuesday", extractedTime: "4pm",
      });
      const slots = [{ day: "tuesday", date: "2026-06-02", slot: "4pm", time: "16:00" }];
      mockGetOpenSlots.mockResolvedValue(slots);
      mockRankSlotsForClient.mockResolvedValue(slots);
      mockTryBookSlot.mockResolvedValue(true);

      await handleSingleSessionReply(makeCtx({ body: "Tuesday 4pm" }));

      expect(mockTryBookSlot).toHaveBeenCalledWith(42, "2026-06-02", "16:00", "4pm", "confirmed");
      expect(mockComposeReply).toHaveBeenCalledWith(
        expect.objectContaining({
          scenario: expect.objectContaining({ type: "confirmed", day: "Tuesday", slot: "4pm" }),
        }),
      );
    });

    it("offers alternatives when selected slot is taken", async () => {
      mockClassifyReply.mockResolvedValue({
        interpretation: "selecting_offered_slot", confidence: 0.9,
        extractedDay: "Tuesday", extractedTime: "4pm",
      });
      const slots = [
        { day: "tuesday", date: "2026-06-02", slot: "4pm", time: "16:00" },
        { day: "wednesday", date: "2026-06-03", slot: "5pm", time: "17:00" },
      ];
      mockGetOpenSlots.mockResolvedValue(slots);
      mockRankSlotsForClient.mockResolvedValue(slots);
      mockTryBookSlot.mockResolvedValue(false);

      await handleSingleSessionReply(makeCtx({ body: "Tuesday 4pm" }));

      expect(mockComposeReply).toHaveBeenCalledWith(
        expect.objectContaining({
          scenario: expect.objectContaining({ type: "slot_taken" }),
        }),
      );
    });
  });

  describe("declined_wants_options", () => {
    it("offers counter_offer when specific day requested and available", async () => {
      mockClassifyReply.mockResolvedValue({
        interpretation: "declined_wants_options", confidence: 0.9,
        extractedDay: "Wednesday",
      });
      const slots = [{ day: "wednesday", date: "2026-06-03", slot: "5pm", time: "17:00" }];
      mockGetOpenSlots.mockResolvedValue(slots);
      mockTryBookSlot.mockResolvedValue(true);

      await handleSingleSessionReply(makeCtx({ body: "how about wednesday?" }));

      expect(mockComposeReply).toHaveBeenCalledWith(
        expect.objectContaining({
          scenario: expect.objectContaining({ type: "counter_offer" }),
        }),
      );
    });

    it("explains why requested slot is unavailable", async () => {
      mockClassifyReply.mockResolvedValue({
        interpretation: "declined_wants_options", confidence: 0.9,
        extractedDay: "Saturday",
      });
      const slots = [{ day: "monday", date: "2026-06-01", slot: "3pm", time: "15:00" }];
      mockGetOpenSlots.mockResolvedValue(slots);
      mockRankSlotsForClient.mockResolvedValue(slots);
      mockTryBookSlot.mockResolvedValue(false);
      mockWhySlotUnavailable.mockResolvedValue("not_a_slot");

      await handleSingleSessionReply(makeCtx({ body: "can I do saturday?" }));

      expect(mockComposeReply).toHaveBeenCalledWith(
        expect.objectContaining({
          scenario: expect.objectContaining({ type: "not_available" }),
        }),
      );
    });

    it("offers generic alternatives when no specific day/time", async () => {
      mockClassifyReply.mockResolvedValue({
        interpretation: "declined_wants_options", confidence: 0.9,
      });
      const slots = [
        { day: "monday", date: "2026-06-01", slot: "3pm", time: "15:00" },
        { day: "wednesday", date: "2026-06-03", slot: "5pm", time: "17:00" },
      ];
      mockGetOpenSlots.mockResolvedValue(slots);
      mockRankSlotsForClient.mockResolvedValue(slots);

      await handleSingleSessionReply(makeCtx({ body: "what else is available?" }));

      expect(mockComposeReply).toHaveBeenCalledWith(
        expect.objectContaining({
          scenario: expect.objectContaining({ type: "alternatives" }),
        }),
      );
    });
  });
});
