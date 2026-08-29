import { describe, it, expect } from "vitest";
import {
  buildRoster,
  canAddAttendee,
  availableToAdd,
  formatRoster,
  type GroupSession,
} from "./group-attendance";

const session = (attendees: { clientId: number; clientName: string }[] = []): GroupSession => ({
  sessionId: 1,
  ownerClientId: 10,
  ownerClientName: "Reggie Jackson",
  attendees,
});

describe("buildRoster", () => {
  it("includes the owning client — they are attending by definition", () => {
    const r = buildRoster(session());
    expect(r.members.map((m) => m.clientId)).toEqual([10]);
    expect(r.headCount).toBe(1);
  });

  it("combines the owner with the recorded attendees", () => {
    const r = buildRoster(session([{ clientId: 11, clientName: "Johnny Bench" }]));
    expect(r.members.map((m) => m.clientId)).toEqual([10, 11]);
    expect(r.headCount).toBe(2);
  });

  it("does not count the owner twice if they are also an explicit attendee", () => {
    // Adding the owner is a natural thing to do by hand; a semi-group of two
    // must not report a head count of three because of it.
    const r = buildRoster(
      session([
        { clientId: 10, clientName: "Reggie Jackson" },
        { clientId: 11, clientName: "Johnny Bench" },
      ]),
    );
    expect(r.headCount).toBe(2);
    expect(r.members.map((m) => m.clientId)).toEqual([10, 11]);
  });

  it("de-duplicates repeated attendee rows", () => {
    const r = buildRoster(
      session([
        { clientId: 11, clientName: "Johnny Bench" },
        { clientId: 11, clientName: "Johnny Bench" },
      ]),
    );
    expect(r.headCount).toBe(2);
  });

  it("keeps the owner first so the roster reads consistently", () => {
    const r = buildRoster(session([{ clientId: 2, clientName: "Aaron Aaronson" }]));
    expect(r.members[0].clientId).toBe(10);
  });
});

describe("canAddAttendee", () => {
  it("refuses the owner, with a reason", () => {
    const r = canAddAttendee(session(), 10);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("owns the session");
  });

  it("refuses someone already on the roster", () => {
    const r = canAddAttendee(session([{ clientId: 11, clientName: "Johnny Bench" }]), 11);
    expect(r.ok).toBe(false);
  });

  it("allows a new client", () => {
    expect(canAddAttendee(session(), 12).ok).toBe(true);
  });
});

describe("availableToAdd", () => {
  const all = [
    { clientId: 12, clientName: "Zach Zulu" },
    { clientId: 10, clientName: "Reggie Jackson" },
    { clientId: 11, clientName: "Johnny Bench" },
    { clientId: 13, clientName: "Alice Adams" },
  ];

  it("excludes the owner and existing attendees", () => {
    const out = availableToAdd(session([{ clientId: 11, clientName: "Johnny Bench" }]), all);
    expect(out.map((c) => c.clientId)).toEqual([13, 12]);
  });

  it("sorts by name so the picker is stable", () => {
    const out = availableToAdd(session(), all);
    expect(out.map((c) => c.clientName)).toEqual(["Alice Adams", "Johnny Bench", "Zach Zulu"]);
  });
});

describe("formatRoster", () => {
  it("reads naturally at each size", () => {
    expect(formatRoster([])).toBe("nobody");
    expect(formatRoster([{ clientId: 1, clientName: "Reggie Jackson" }])).toBe("Reggie");
    expect(
      formatRoster([
        { clientId: 1, clientName: "Reggie Jackson" },
        { clientId: 2, clientName: "Johnny Bench" },
      ]),
    ).toBe("Reggie and Johnny");
    expect(
      formatRoster([
        { clientId: 1, clientName: "Reggie Jackson" },
        { clientId: 2, clientName: "Johnny Bench" },
        { clientId: 3, clientName: "Pete Rose" },
      ]),
    ).toBe("Reggie, Johnny and Pete");
  });
});
