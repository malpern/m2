import { describe, it, expect } from "vitest";
import { isDevAllowed } from "./twilio";

describe("isDevAllowed", () => {
  it("allows Micah's phone number", () => {
    expect(isDevAllowed("+14082099509")).toBe(true);
  });

  it("blocks other phone numbers in dev", () => {
    expect(isDevAllowed("+15551234567")).toBe(false);
  });

  it("blocks unknown numbers", () => {
    expect(isDevAllowed("+10000000000")).toBe(false);
  });
});
