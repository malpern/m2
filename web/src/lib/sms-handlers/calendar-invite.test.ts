import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/twilio", () => ({ sendSMS: vi.fn() }));
vi.mock("@/lib/logger", () => ({ syslog: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { isCalendarInviteFlow } from "./calendar-invite";

describe("isCalendarInviteFlow", () => {
  it("detects 'calendar invite' in last sent message", () => {
    expect(isCalendarInviteFlow("Want a calendar invite?")).toBe(true);
  });

  it("detects 'email address' in last sent message", () => {
    expect(isCalendarInviteFlow("What's your email address?")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isCalendarInviteFlow("CALENDAR INVITE")).toBe(true);
  });

  it("returns false for unrelated text", () => {
    expect(isCalendarInviteFlow("See you Tuesday at 3pm!")).toBe(false);
  });
});
