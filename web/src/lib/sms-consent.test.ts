import { describe, it, expect } from "vitest";
import {
  canSend, interpretConsentReply, confirmationMessage, confirmedReply, declinedReply,
  type ConsentStatus,
} from "./sms-consent";

const ALL: ConsentStatus[] = ["unknown", "pending", "confirmed", "declined"];

describe("canSend — scheduling", () => {
  it("only allows a client who confirmed", () => {
    expect(canSend("scheduling", "confirmed")).toEqual({ allowed: true });
  });

  it("refuses every other state, with a reason", () => {
    for (const s of ["unknown", "pending", "declined"] as ConsentStatus[]) {
      const d = canSend("scheduling", s);
      expect(d.allowed, s).toBe(false);
      if (!d.allowed) expect(d.reason.length, s).toBeGreaterThan(0);
    }
  });

  it("distinguishes never-asked from asked-and-waiting", () => {
    // Different operational meanings: one needs a confirmation request sent,
    // the other needs patience.
    const unknown = canSend("scheduling", "unknown");
    const pending = canSend("scheduling", "pending");
    expect(unknown.allowed).toBe(false);
    expect(pending.allowed).toBe(false);
    if (!unknown.allowed && !pending.allowed) {
      expect(unknown.reason).not.toBe(pending.reason);
    }
  });
});

describe("canSend — consent_request", () => {
  it("can be sent to someone never asked, or asked again while pending", () => {
    expect(canSend("consent_request", "unknown").allowed).toBe(true);
    expect(canSend("consent_request", "pending").allowed).toBe(true);
  });

  it("is NOT sent to someone who declined", () => {
    // Re-asking somebody who opted out is the thing carriers penalise.
    expect(canSend("consent_request", "declined").allowed).toBe(false);
  });

  it("is not sent to someone already confirmed", () => {
    expect(canSend("consent_request", "confirmed").allowed).toBe(false);
  });

  it("is never blocked by the state it exists to change", () => {
    // Gating the question on consent would make consent unobtainable.
    expect(canSend("consent_request", "unknown").allowed).toBe(true);
  });
});

describe("canSend — operational", () => {
  it("is allowed in every state", () => {
    // Replies to an inbound message, and alerts to Micah's own phone. Refusing
    // to answer somebody who just texted us would be strange; blocking our own
    // alerts would be a bug.
    for (const s of ALL) expect(canSend("operational", s).allowed, s).toBe(true);
  });
});

describe("interpretConsentReply", () => {
  it("recognises the ordinary confirmations", () => {
    for (const w of ["YES", "yes", " Yes ", "y", "yeah", "yep", "START", "ok", "sure", "Confirm"]) {
      expect(interpretConsentReply(w), w).toBe("confirm");
    }
  });

  it("recognises the ordinary declines", () => {
    for (const w of ["STOP", "stop", "no", "N", "unsubscribe", "cancel", "quit", "optout"]) {
      expect(interpretConsentReply(w), w).toBe("decline");
    }
  });

  it("tolerates trailing punctuation", () => {
    expect(interpretConsentReply("Yes!")).toBe("confirm");
    expect(interpretConsentReply("no.")).toBe("decline");
  });

  it("does NOT treat a scheduling reply as consent", () => {
    // The dangerous case: "no thanks, can we do Thursday?" is a scheduling
    // message that happens to begin with "no". Reading it as an opt-out would
    // silently cut a client off.
    for (const s of [
      "no thanks, can we do Thursday?",
      "yes Tuesday works for me",
      "stop by at 3 if you can",
      "cancel my 4pm please",
    ]) {
      expect(interpretConsentReply(s), s).toBeNull();
    }
  });

  it("returns null for anything unrecognised", () => {
    expect(interpretConsentReply("")).toBeNull();
    expect(interpretConsentReply("👍")).toBeNull();
  });
});

describe("confirmationMessage", () => {
  const m = confirmationMessage();

  it("carries every element a carrier disclosure requires", () => {
    expect(m).toContain("M2 Performance and Therapy");   // business name
    expect(m).toMatch(/scheduling/i);                     // purpose
    expect(m).toMatch(/frequency varies/i);               // frequency
    expect(m).toMatch(/rates may apply/i);                // rates
    expect(m).toContain("STOP");                          // opt out
    expect(m).toContain("HELP");                          // help
    expect(m).toMatch(/privacy/i);                        // policy link
  });

  it("asks for an explicit reply, so the record is the client's own words", () => {
    expect(m).toMatch(/reply yes/i);
  });

  it("fits comfortably in a concatenated SMS", () => {
    expect(m.length).toBeLessThan(320);
  });

  it("lets the privacy URL move without a code change", () => {
    expect(confirmationMessage({ privacyUrl: "example.com/p" })).toContain("example.com/p");
  });
});

describe("the replies to a decision", () => {
  it("confirms and still restates how to opt out", () => {
    expect(confirmedReply()).toContain("STOP");
  });

  it("accepts a decline without arguing", () => {
    expect(declinedReply()).toMatch(/won't get scheduling texts/i);
  });
});
