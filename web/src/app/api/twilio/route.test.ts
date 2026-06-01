import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Mocks — must come before any imports from the module under test    */
/* ------------------------------------------------------------------ */

const mockDbInsert = vi.fn(() => ({
  values: () => ({ run: () => {}, returning: () => ({ get: () => ({ id: 99 }) }) }),
}));
const mockDbUpdate = vi.fn(() => ({
  set: () => ({ where: () => ({ run: () => {} }) }),
}));
const mockDbSelect = vi.fn(() => ({
  from: () => ({
    where: () => ({
      orderBy: () => ({
        limit: () => ({
          all: () => [],
        }),
      }),
      all: () => [],
      get: () => null,
    }),
  }),
}));

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  outreach: { id: "id", clientId: "client_id", direction: "direction" },
  clients: { id: "id" },
  sessions: { id: "id" },
}));

vi.mock("@/lib/twilio", () => ({
  sendSMS: vi.fn().mockResolvedValue("SM123"),
}));

vi.mock("@/lib/logger", () => ({
  syslog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/classify-reply", () => ({
  classifyReply: vi.fn().mockResolvedValue({ interpretation: "confirmed", confidence: 0.9 }),
  composeReply: vi.fn().mockResolvedValue("Got it!"),
  ClassifyBillingError: class extends Error {
    constructor() { super("billing"); }
  },
}));

vi.mock("@/lib/scheduler", () => ({
  getMonday: () => new Date("2026-06-01T00:00:00Z"),
}));

vi.mock("@/lib/sms-handlers", () => ({
  findClient: vi.fn(),
  logAndSend: vi.fn().mockResolvedValue(undefined),
  buildConversationHistory: vi.fn().mockReturnValue([]),
  getGroupedSessionIds: vi.fn().mockResolvedValue(null),
  isBalanceInquiry: vi.fn().mockReturnValue(false),
  handleBalanceInquiry: vi.fn().mockResolvedValue(undefined),
  isCalendarInviteFlow: vi.fn().mockReturnValue(false),
  handleCalendarInviteFlow: vi.fn().mockResolvedValue("not_handled"),
  handleConfirmedSessionCancellation: vi.fn().mockResolvedValue(undefined),
  handleMultiSessionReply: vi.fn().mockResolvedValue(undefined),
  handleSingleSessionReply: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/sms-handlers/shared", () => ({
  offerFreshAlternatives: vi.fn().mockResolvedValue(undefined),
}));

const mockValidateRequest = vi.fn().mockReturnValue(true);
vi.mock("twilio", () => ({
  default: { validateRequest: (...args: unknown[]) => mockValidateRequest(...args) },
}));

/* ------------------------------------------------------------------ */
/*  Imports (after mocks)                                              */
/* ------------------------------------------------------------------ */

import { POST } from "./route";
import { NextRequest } from "next/server";
import {
  findClient,
  logAndSend,
  isBalanceInquiry,
  handleBalanceInquiry,
  isCalendarInviteFlow,
  handleCalendarInviteFlow,
  handleConfirmedSessionCancellation,
  handleMultiSessionReply,
  handleSingleSessionReply,
  getGroupedSessionIds,
  buildConversationHistory,
} from "@/lib/sms-handlers";
import { offerFreshAlternatives } from "@/lib/sms-handlers/shared";
import { classifyReply, composeReply } from "@/lib/classify-reply";

const mockFindClient = vi.mocked(findClient);
const mockLogAndSend = vi.mocked(logAndSend);
const mockIsBalanceInquiry = vi.mocked(isBalanceInquiry);
const mockHandleBalanceInquiry = vi.mocked(handleBalanceInquiry);
const mockIsCalendarInviteFlow = vi.mocked(isCalendarInviteFlow);
const mockHandleCalendarInviteFlow = vi.mocked(handleCalendarInviteFlow);
const mockHandleConfirmedSessionCancellation = vi.mocked(handleConfirmedSessionCancellation);
const mockHandleMultiSessionReply = vi.mocked(handleMultiSessionReply);
const mockHandleSingleSessionReply = vi.mocked(handleSingleSessionReply);
const mockGetGroupedSessionIds = vi.mocked(getGroupedSessionIds);
const mockBuildConversationHistory = vi.mocked(buildConversationHistory);
const mockOfferFreshAlternatives = vi.mocked(offerFreshAlternatives);
const mockClassifyReply = vi.mocked(classifyReply);
const mockComposeReply = vi.mocked(composeReply);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const TEST_CLIENT = {
  id: 1,
  name: "Alex Lee",
  phone: "+15551234567",
  calendarInviteOptIn: true,
};

function makeRequest(body: Record<string, string>): NextRequest {
  const formData = new URLSearchParams(body);
  return new NextRequest("https://example.com/api/twilio", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "valid-sig",
    },
    body: formData.toString(),
  });
}

function makeOutreach(overrides?: Record<string, unknown>) {
  return {
    id: 10,
    clientId: 1,
    sessionId: 42,
    weekOf: "2026-06-01",
    direction: "sent",
    messageText: "Tuesday at 4pm?",
    status: "awaiting_reply",
    sentAt: "2026-06-01T10:00:00Z",
    repliedAt: null,
    outreachGroupId: null,
    ...overrides,
  };
}

/** Set up mockDbSelect so the outreach query returns the given rows */
function setupOutreachQuery(rows: ReturnType<typeof makeOutreach>[]) {
  mockDbSelect.mockReturnValue({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => ({
            all: () => rows,
          }),
        }),
        all: () => rows,
        get: () => rows[0] ?? null,
      }),
    }),
  } as ReturnType<typeof mockDbSelect>);
}

async function getResponseText(response: Response): Promise<string> {
  return response.text();
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  mockValidateRequest.mockReturnValue(true);
  mockFindClient.mockResolvedValue(null);
  mockIsBalanceInquiry.mockReturnValue(false);
  mockIsCalendarInviteFlow.mockReturnValue(false);
  mockGetGroupedSessionIds.mockResolvedValue(null);
  mockBuildConversationHistory.mockReturnValue([]);
  mockHandleCalendarInviteFlow.mockResolvedValue("not_handled");
  mockComposeReply.mockResolvedValue("Got it!");
  mockClassifyReply.mockResolvedValue({ interpretation: "confirmed", confidence: 0.9 });
  process.env.TWILIO_AUTH_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
});

describe("POST /api/twilio", () => {
  /* ---------------------------------------------------------------- */
  /*  Signature verification                                           */
  /* ---------------------------------------------------------------- */
  describe("signature verification", () => {
    it("returns 403 when Twilio signature is invalid", async () => {
      mockValidateRequest.mockReturnValue(false);

      const response = await POST(makeRequest({ From: "+15551234567", Body: "hello" }));

      expect(response.status).toBe(403);
      expect(await getResponseText(response)).toBe("Forbidden");
    });

    it("returns 403 when TWILIO_AUTH_TOKEN is missing", async () => {
      delete process.env.TWILIO_AUTH_TOKEN;

      const response = await POST(makeRequest({ From: "+15551234567", Body: "hello" }));

      expect(response.status).toBe(403);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Empty body / from                                                */
  /* ---------------------------------------------------------------- */
  describe("empty body or from", () => {
    it("returns empty TwiML when From is missing", async () => {
      const response = await POST(makeRequest({ Body: "hello" }));

      expect(response.status).toBe(200);
      expect(await getResponseText(response)).toBe("<Response/>");
    });

    it("returns empty TwiML when Body is missing", async () => {
      const response = await POST(makeRequest({ From: "+15551234567" }));

      expect(response.status).toBe(200);
      expect(await getResponseText(response)).toBe("<Response/>");
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Carrier-level opt-out keywords                                   */
  /* ---------------------------------------------------------------- */
  describe("carrier opt-out keywords", () => {
    for (const keyword of ["stop", "unsubscribe", "cancel", "quit"]) {
      it(`returns empty TwiML for "${keyword}"`, async () => {
        const response = await POST(makeRequest({ From: "+15551234567", Body: keyword }));

        expect(response.status).toBe(200);
        expect(await getResponseText(response)).toBe("<Response/>");
        expect(mockFindClient).not.toHaveBeenCalled();
      });
    }
  });

  /* ---------------------------------------------------------------- */
  /*  "stop invites" opt-out                                           */
  /* ---------------------------------------------------------------- */
  describe("stop invites opt-out", () => {
    it('opts client out of calendar invites for "stop invites"', async () => {
      mockFindClient.mockResolvedValue(TEST_CLIENT as Awaited<ReturnType<typeof findClient>>);

      const response = await POST(makeRequest({ From: "+15551234567", Body: "stop invites" }));

      expect(response.status).toBe(200);
      const text = await getResponseText(response);
      expect(text).toContain("no more calendar invites");
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('returns empty TwiML for "stop invites" from unknown number', async () => {
      mockFindClient.mockResolvedValue(null);

      const response = await POST(makeRequest({ From: "+15559999999", Body: "stop invites" }));

      expect(response.status).toBe(200);
      expect(await getResponseText(response)).toBe("<Response/>");
    });

    for (const phrase of ["stop calendar invites", "no more invites"]) {
      it(`also handles "${phrase}"`, async () => {
        mockFindClient.mockResolvedValue(TEST_CLIENT as Awaited<ReturnType<typeof findClient>>);

        const response = await POST(makeRequest({ From: "+15551234567", Body: phrase }));

        const text = await getResponseText(response);
        expect(text).toContain("no more calendar invites");
      });
    }
  });

  /* ---------------------------------------------------------------- */
  /*  HELP / INFO keywords                                             */
  /* ---------------------------------------------------------------- */
  describe("help/info keywords", () => {
    for (const keyword of ["help", "info"]) {
      it(`returns help message for "${keyword}"`, async () => {
        const response = await POST(makeRequest({ From: "+15551234567", Body: keyword }));

        expect(response.status).toBe(200);
        const text = await getResponseText(response);
        expect(text).toContain("M2 Performance");
        expect(text).toContain("Reply STOP");
      });
    }
  });

  /* ---------------------------------------------------------------- */
  /*  START / SUBSCRIBE keywords                                       */
  /* ---------------------------------------------------------------- */
  describe("start/subscribe keywords", () => {
    for (const keyword of ["start", "subscribe"]) {
      it(`returns sign-up confirmation for "${keyword}"`, async () => {
        const response = await POST(makeRequest({ From: "+15551234567", Body: keyword }));

        expect(response.status).toBe(200);
        const text = await getResponseText(response);
        expect(text).toContain("signed up for session scheduling");
      });
    }

    it('returns sign-up for "yes" from unknown number', async () => {
      mockFindClient.mockResolvedValue(null);

      const response = await POST(makeRequest({ From: "+15559999999", Body: "yes" }));

      const text = await getResponseText(response);
      expect(text).toContain("signed up for session scheduling");
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Unknown number                                                   */
  /* ---------------------------------------------------------------- */
  describe("unknown number", () => {
    it("tells unknown callers to contact Matt", async () => {
      mockFindClient.mockResolvedValue(null);

      const response = await POST(makeRequest({ From: "+15559999999", Body: "hello" }));

      expect(response.status).toBe(200);
      const text = await getResponseText(response);
      expect(text).toContain("contact Matt");
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Balance inquiry                                                  */
  /* ---------------------------------------------------------------- */
  describe("balance inquiry keyword", () => {
    it("dispatches to handleBalanceInquiry when isBalanceInquiry returns true", async () => {
      mockFindClient.mockResolvedValue(TEST_CLIENT as Awaited<ReturnType<typeof findClient>>);
      mockIsBalanceInquiry.mockReturnValue(true);
      setupOutreachQuery([]);

      const response = await POST(makeRequest({ From: "+15551234567", Body: "how many sessions left" }));

      expect(response.status).toBe(200);
      expect(await getResponseText(response)).toBe("<Response/>");
      expect(mockHandleBalanceInquiry).toHaveBeenCalledOnce();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Late reply — different weekOf                                    */
  /* ---------------------------------------------------------------- */
  describe("late reply (different weekOf)", () => {
    it("logs and composes a late_reply when lastSent is from a previous week", async () => {
      mockFindClient.mockResolvedValue(TEST_CLIENT as Awaited<ReturnType<typeof findClient>>);
      setupOutreachQuery([
        makeOutreach({ weekOf: "2026-05-25", sentAt: "2026-05-25T10:00:00Z" }),
      ]);

      const response = await POST(makeRequest({ From: "+15551234567", Body: "yeah sounds good" }));

      expect(response.status).toBe(200);
      expect(await getResponseText(response)).toBe("<Response/>");
      expect(mockDbInsert).toHaveBeenCalled();
      expect(mockComposeReply).toHaveBeenCalledWith(
        expect.objectContaining({
          scenario: { type: "late_reply" },
        }),
      );
      expect(mockLogAndSend).toHaveBeenCalled();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Confirmed status + cancellation                                  */
  /* ---------------------------------------------------------------- */
  describe("confirmed status + cancellation", () => {
    it("dispatches to handleConfirmedSessionCancellation when classifier says cancellation", async () => {
      mockFindClient.mockResolvedValue(TEST_CLIENT as Awaited<ReturnType<typeof findClient>>);
      mockClassifyReply.mockResolvedValue({ interpretation: "cancellation", confidence: 0.9 });
      setupOutreachQuery([
        makeOutreach({ status: "confirmed", sessionId: 42 }),
      ]);

      const response = await POST(makeRequest({ From: "+15551234567", Body: "actually cancel" }));

      expect(response.status).toBe(200);
      expect(mockHandleConfirmedSessionCancellation).toHaveBeenCalledOnce();
    });

    it("passes non-cancellation reply along to Matt for confirmed sessions", async () => {
      mockFindClient.mockResolvedValue(TEST_CLIENT as Awaited<ReturnType<typeof findClient>>);
      mockClassifyReply.mockResolvedValue({ interpretation: "confirmed", confidence: 0.9 });
      setupOutreachQuery([
        makeOutreach({ status: "confirmed", sessionId: 42 }),
      ]);

      const response = await POST(makeRequest({ From: "+15551234567", Body: "cool thanks" }));

      const text = await getResponseText(response);
      expect(text).toContain("pass this along to Matt");
    });

    it("handles ClassifyBillingError gracefully for confirmed sessions", async () => {
      mockFindClient.mockResolvedValue(TEST_CLIENT as Awaited<ReturnType<typeof findClient>>);
      const { ClassifyBillingError } = await import("@/lib/classify-reply");
      mockClassifyReply.mockRejectedValue(new ClassifyBillingError());
      setupOutreachQuery([
        makeOutreach({ status: "confirmed", sessionId: 42 }),
      ]);

      const response = await POST(makeRequest({ From: "+15551234567", Body: "cancel" }));

      expect(response.status).toBe(200);
      expect(await getResponseText(response)).toBe("<Response/>");
      expect(mockHandleConfirmedSessionCancellation).not.toHaveBeenCalled();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Expired status — re-engage with fresh alternatives               */
  /* ---------------------------------------------------------------- */
  describe("expired status", () => {
    it("calls offerFreshAlternatives for expired outreach", async () => {
      mockFindClient.mockResolvedValue(TEST_CLIENT as Awaited<ReturnType<typeof findClient>>);
      setupOutreachQuery([
        makeOutreach({ status: "expired", sessionId: 42 }),
      ]);

      const response = await POST(makeRequest({ From: "+15551234567", Body: "hey" }));

      expect(response.status).toBe(200);
      expect(await getResponseText(response)).toBe("<Response/>");
      expect(mockOfferFreshAlternatives).toHaveBeenCalledWith(
        expect.objectContaining({ client: expect.objectContaining({ id: 1 }) }),
        "re_engage",
        42,
      );
    });
  });

  /* ---------------------------------------------------------------- */
  /*  No active outreach -> pass along to Matt                         */
  /* ---------------------------------------------------------------- */
  describe("no active outreach", () => {
    it('returns "pass along to Matt" when no lastSent', async () => {
      mockFindClient.mockResolvedValue(TEST_CLIENT as Awaited<ReturnType<typeof findClient>>);
      setupOutreachQuery([]);

      const response = await POST(makeRequest({ From: "+15551234567", Body: "hey there" }));

      const text = await getResponseText(response);
      expect(text).toContain("pass this along to Matt");
      expect(mockDbInsert).toHaveBeenCalled();
    });

    it('returns "pass along to Matt" when lastSent is not awaiting_reply', async () => {
      mockFindClient.mockResolvedValue(TEST_CLIENT as Awaited<ReturnType<typeof findClient>>);
      setupOutreachQuery([
        makeOutreach({ status: "needs_matt", direction: "sent", sentAt: "2026-06-01T10:00:00Z" }),
      ]);

      const response = await POST(makeRequest({ From: "+15551234567", Body: "hey there" }));

      const text = await getResponseText(response);
      expect(text).toContain("pass this along to Matt");
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Calendar invite flow                                             */
  /* ---------------------------------------------------------------- */
  describe("calendar invite flow", () => {
    it("dispatches to handleCalendarInviteFlow when detected", async () => {
      mockFindClient.mockResolvedValue(TEST_CLIENT as Awaited<ReturnType<typeof findClient>>);
      mockIsCalendarInviteFlow.mockReturnValue(true);
      mockHandleCalendarInviteFlow.mockResolvedValue("handled");
      setupOutreachQuery([
        makeOutreach({ status: "awaiting_reply", messageText: "Want a calendar invite?" }),
      ]);

      const response = await POST(makeRequest({ From: "+15551234567", Body: "yes please" }));

      expect(response.status).toBe(200);
      expect(await getResponseText(response)).toBe("<Response/>");
      expect(mockHandleCalendarInviteFlow).toHaveBeenCalledOnce();
    });

    it("falls through to session dispatch when calendar invite flow returns not_handled", async () => {
      mockFindClient.mockResolvedValue(TEST_CLIENT as Awaited<ReturnType<typeof findClient>>);
      mockIsCalendarInviteFlow.mockReturnValue(true);
      mockHandleCalendarInviteFlow.mockResolvedValue("not_handled");
      setupOutreachQuery([
        makeOutreach({ status: "awaiting_reply", messageText: "Want a calendar invite?" }),
      ]);

      const response = await POST(makeRequest({ From: "+15551234567", Body: "something else" }));

      expect(response.status).toBe(200);
      expect(mockHandleSingleSessionReply).toHaveBeenCalledOnce();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Multi-session dispatch                                           */
  /* ---------------------------------------------------------------- */
  describe("multi-session dispatch", () => {
    it("dispatches to handleMultiSessionReply when multiple grouped session IDs", async () => {
      mockFindClient.mockResolvedValue(TEST_CLIENT as Awaited<ReturnType<typeof findClient>>);
      mockGetGroupedSessionIds.mockResolvedValue([42, 43]);
      setupOutreachQuery([
        makeOutreach({ status: "awaiting_reply", outreachGroupId: "group-1" }),
      ]);

      const response = await POST(makeRequest({ From: "+15551234567", Body: "the first one" }));

      expect(response.status).toBe(200);
      expect(mockHandleMultiSessionReply).toHaveBeenCalledWith(
        expect.objectContaining({ client: expect.objectContaining({ id: 1 }) }),
        [42, 43],
      );
      expect(mockHandleSingleSessionReply).not.toHaveBeenCalled();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Single-session dispatch                                          */
  /* ---------------------------------------------------------------- */
  describe("single-session dispatch", () => {
    it("dispatches to handleSingleSessionReply for standard awaiting_reply", async () => {
      mockFindClient.mockResolvedValue(TEST_CLIENT as Awaited<ReturnType<typeof findClient>>);
      mockGetGroupedSessionIds.mockResolvedValue(null);
      setupOutreachQuery([
        makeOutreach({ status: "awaiting_reply" }),
      ]);

      const response = await POST(makeRequest({ From: "+15551234567", Body: "yes that works" }));

      expect(response.status).toBe(200);
      expect(mockHandleSingleSessionReply).toHaveBeenCalledOnce();
      expect(mockHandleMultiSessionReply).not.toHaveBeenCalled();
    });

    it("dispatches to handleSingleSessionReply when groupIds has only one entry", async () => {
      mockFindClient.mockResolvedValue(TEST_CLIENT as Awaited<ReturnType<typeof findClient>>);
      mockGetGroupedSessionIds.mockResolvedValue([42]);
      setupOutreachQuery([
        makeOutreach({ status: "awaiting_reply", outreachGroupId: "group-1" }),
      ]);

      const response = await POST(makeRequest({ From: "+15551234567", Body: "sounds good" }));

      expect(response.status).toBe(200);
      expect(mockHandleSingleSessionReply).toHaveBeenCalledOnce();
      expect(mockHandleMultiSessionReply).not.toHaveBeenCalled();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Crash safety — POST catches unhandled errors                     */
  /* ---------------------------------------------------------------- */
  describe("crash safety", () => {
    it("returns empty TwiML and logs error when handleWebhook throws", async () => {
      const badRequest = new NextRequest("https://example.com/api/twilio", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "not-form-data",
      });
      vi.spyOn(badRequest, "formData").mockRejectedValue(new Error("boom"));

      const response = await POST(badRequest);

      expect(response.status).toBe(200);
      expect(await getResponseText(response)).toBe("<Response/>");
    });
  });
});
