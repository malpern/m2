import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Guards on the two outbound paths that do NOT go through sendSMS (#3 follow-up).
 *
 * A Google Calendar invite is outbound mail — Google delivers it to the attendee
 * directly — so it bypassed both `isDevAllowed` and `OUTREACH_LIVE`. All
 * OUTREACH_LIVE did was append "— IGNORE JUST TESTING" to the event title, which
 * would have landed in a real client's inbox.
 */

const mockInsert = vi.fn();
const mockPatch = vi.fn();
const mockGet = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    calendar: () => ({
      events: {
        insert: (...a: unknown[]) => mockInsert(...a),
        patch: (...a: unknown[]) => mockPatch(...a),
        get: (...a: unknown[]) => mockGet(...a),
      },
    }),
    oauth2: () => ({ userinfo: { get: async () => ({ data: {} }) } }),
    auth: { OAuth2: class {} },
  },
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ googleTokens: {} }));
vi.mock("@/lib/google-auth", () => ({
  getOAuth2Client: () => ({}),
  getAuthenticatedClient: async () => ({}),
  getAuthenticatedClientWithEmail: async () => ({ oauth2: {}, email: "matt@example.com" }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  mockInsert.mockReset().mockResolvedValue({ data: { id: "evt_1" } });
  mockPatch.mockReset().mockResolvedValue({});
  mockGet.mockReset().mockResolvedValue({ data: { attendees: [] } });
});

describe("createCalendarEvent — invite gating", () => {
  it("does NOT attach an attendee while OUTREACH_LIVE is off", async () => {
    const { createCalendarEvent } = await import("./google-calendar");
    await createCalendarEvent("Luke Alexander", "2026-09-01", "15:00", {
      attendeeEmail: "client@example.com",
    });

    const body = mockInsert.mock.calls[0][0];
    expect(body.requestBody.attendees).toBeUndefined();
    expect(body.sendUpdates).toBe("none");
  });

  it("still creates the event — only the invite is suppressed", async () => {
    const { createCalendarEvent } = await import("./google-calendar");
    const id = await createCalendarEvent("Luke Alexander", "2026-09-01", "15:00", {
      attendeeEmail: "client@example.com",
    });
    expect(id).toBe("evt_1");
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("DOES invite once OUTREACH_LIVE is explicitly enabled", async () => {
    vi.stubEnv("OUTREACH_LIVE", "true");
    const { createCalendarEvent } = await import("./google-calendar");
    await createCalendarEvent("Luke Alexander", "2026-09-01", "15:00", {
      attendeeEmail: "client@example.com",
    });

    const body = mockInsert.mock.calls[0][0];
    expect(body.requestBody.attendees).toEqual([{ email: "client@example.com" }]);
    expect(body.sendUpdates).toBe("all");
  });

  it("sends nothing when there is no attendee either way", async () => {
    const { createCalendarEvent } = await import("./google-calendar");
    await createCalendarEvent("Luke Alexander", "2026-09-01", "15:00");
    expect(mockInsert.mock.calls[0][0].sendUpdates).toBe("none");
  });
});

describe("updateCalendarEventAttendee — the second invite path", () => {
  it("refuses to patch an attendee while OUTREACH_LIVE is off", async () => {
    const { updateCalendarEventAttendee } = await import("./google-calendar");
    const ok = await updateCalendarEventAttendee("evt_1", "client@example.com");
    expect(ok).toBe(false);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("patches once outreach is live", async () => {
    vi.stubEnv("OUTREACH_LIVE", "true");
    const { updateCalendarEventAttendee } = await import("./google-calendar");
    const ok = await updateCalendarEventAttendee("evt_1", "client@example.com");
    expect(ok).toBe(true);
    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockPatch.mock.calls[0][0].sendUpdates).toBe("all");
  });
});
