import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: () => ({
        run: () => {},
        returning: () => ({ get: () => ({ id: 99 }) }),
      }),
    })),
    update: vi.fn(() => ({
      set: () => ({
        where: () => ({ run: () => {} }),
      }),
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          get: () => null,
          all: () => [],
        }),
      }),
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  outreach: { clientId: "client_id", direction: "direction" },
  clients: { id: "id" },
  sessions: { id: "id" },
}));

vi.mock("@/lib/twilio", () => ({
  sendSMS: vi.fn().mockResolvedValue("SM123"),
}));

vi.mock("@/lib/logger", () => ({
  syslog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/scheduler", () => ({
  getMonday: () => new Date("2026-06-01T00:00:00Z"),
}));

vi.mock("@/lib/google-calendar", () => ({
  updateCalendarEventAttendee: vi.fn(),
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

import { isCalendarInviteFlow, handleCalendarInviteFlow } from "./calendar-invite";
import type { WebhookContext } from "./shared";
import { sendSMS } from "@/lib/twilio";

const mockSendSMS = vi.mocked(sendSMS);

function makeCtx(overrides?: Partial<WebhookContext>): WebhookContext {
  return {
    client: { id: 1, name: "Jane Smith", phone: "+15551234567", email: null, calendarInviteOptIn: null } as unknown as WebhookContext["client"],
    body: "jane@example.com",
    weekOf: "2026-06-01",
    firstName: "Jane",
    lastSent: { id: 10, sessionId: 5, outreachGroupId: null, messageText: "Want a calendar invite?" } as unknown as WebhookContext["lastSent"],
    recentOutreach: [],
    history: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendSMS.mockResolvedValue("SM123");
});

describe("isCalendarInviteFlow", () => {
  it("detects 'calendar invite'", () => {
    expect(isCalendarInviteFlow("Want a calendar invite?")).toBe(true);
  });

  it("detects 'email address'", () => {
    expect(isCalendarInviteFlow("What's your email address?")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isCalendarInviteFlow("CALENDAR INVITE")).toBe(true);
  });

  it("returns false for unrelated text", () => {
    expect(isCalendarInviteFlow("See you Tuesday at 3pm!")).toBe(false);
  });
});

describe("handleCalendarInviteFlow", () => {
  it("saves email and confirms when valid email is provided", async () => {
    const result = await handleCalendarInviteFlow(makeCtx({ body: "jane@example.com" }));
    expect(result).toBe("handled");
    expect(mockSendSMS).toHaveBeenCalledOnce();
    const sentMsg = mockSendSMS.mock.calls[0][1];
    expect(sentMsg).toContain("jane@example.com");
    expect(sentMsg).toContain("invite sent");
  });

  it("opts out when user says 'no'", async () => {
    const result = await handleCalendarInviteFlow(makeCtx({ body: "no" }));
    expect(result).toBe("handled");
    const sentMsg = mockSendSMS.mock.calls[0][1];
    expect(sentMsg).toContain("won't get calendar invites");
  });

  it("opts out when user says 'no thanks'", async () => {
    const result = await handleCalendarInviteFlow(makeCtx({ body: "no thanks" }));
    expect(result).toBe("handled");
  });

  it("opts out on 'opt out'", async () => {
    const result = await handleCalendarInviteFlow(makeCtx({ body: "I want to opt out" }));
    expect(result).toBe("handled");
  });

  it("asks for email when user says 'yes' but has no email on file", async () => {
    const result = await handleCalendarInviteFlow(makeCtx({ body: "yes" }));
    expect(result).toBe("handled");
    const sentMsg = mockSendSMS.mock.calls[0][1];
    expect(sentMsg).toContain("email address");
  });

  it("confirms with existing email when user says 'yes' and has email", async () => {
    const ctx = makeCtx({
      body: "yes",
      client: { id: 1, name: "Jane Smith", phone: "+15551234567", email: "jane@example.com" } as unknown as WebhookContext["client"],
    });
    const result = await handleCalendarInviteFlow(ctx);
    expect(result).toBe("handled");
    const sentMsg = mockSendSMS.mock.calls[0][1];
    expect(sentMsg).toContain("jane@example.com");
  });

  it("handles 'yeah' and 'sure'", async () => {
    expect(await handleCalendarInviteFlow(makeCtx({ body: "yeah" }))).toBe("handled");
  });

  it("returns not_handled for unrecognized replies", async () => {
    const result = await handleCalendarInviteFlow(makeCtx({ body: "maybe later" }));
    expect(result).toBe("not_handled");
    expect(mockSendSMS).not.toHaveBeenCalled();
  });
});
