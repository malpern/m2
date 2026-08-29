import { describe, it, expect } from "vitest";
import { describeSession, sessionTypeSuffix, sessionTypeTag } from "./session-description";

describe("describeSession", () => {
  it("leaves individual sessions worded exactly as before", () => {
    // The majority of clients must see no change from this issue.
    expect(describeSession("individual")).toBe("a session");
    expect(describeSession(null)).toBe("a session");
    expect(describeSession("late_cancel")).toBe("a session");
  });

  it("names the type for a group session", () => {
    expect(describeSession("group")).toBe("your group session");
  });

  it("includes a count of other attendees when known", () => {
    expect(describeSession("group", 2)).toBe("your group session with 2 others");
  });

  it("uses the singular for exactly one other", () => {
    expect(describeSession("group", 1)).toBe("your group session with 1 other");
  });

  it("degrades to a truthful phrase when the count is unknown", () => {
    expect(describeSession("group", 0)).toBe("your group session");
    expect(describeSession("group", -3)).toBe("your group session");
  });

  it("describes a dual session without implying a group", () => {
    expect(describeSession("dual")).toBe("your partner session");
  });

  it("never leaks a name — the signature takes a count, so there is none to leak", () => {
    // This is the privacy answer from #56 made structural. If someone later
    // widens the parameter to accept names, this test is where it shows up.
    const phrase = describeSession("group", 3);
    expect(phrase).toBe("your group session with 3 others");
    expect(phrase).not.toMatch(/[A-Z][a-z]+ [A-Z][a-z]+/); // no "Firstname Lastname"
  });
});

describe("sessionTypeSuffix", () => {
  it("is empty for individual sessions so their messages are untouched", () => {
    expect(sessionTypeSuffix("individual")).toBe("");
    expect(sessionTypeSuffix(null)).toBe("");
  });

  it("reads as a clause after a time", () => {
    expect(`see you today at 3pm${sessionTypeSuffix("group", 2)}!`).toBe(
      "see you today at 3pm for your group session with 2 others!",
    );
  });

  it("covers dual too", () => {
    expect(sessionTypeSuffix("dual")).toBe(" for your partner session");
  });
});

describe("sessionTypeTag", () => {
  it("tags only the types that differ from the norm", () => {
    expect(sessionTypeTag("group")).toBe(" (group)");
    expect(sessionTypeTag("dual")).toBe(" (partner)");
    expect(sessionTypeTag("individual")).toBe("");
    expect(sessionTypeTag(null)).toBe("");
  });
});
