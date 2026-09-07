import { describe, it, expect } from "vitest";
import { toE164, normalizeEmail } from "./phone";

describe("toE164", () => {
  it("accepts the formats a spreadsheet actually contains", () => {
    for (const raw of [
      "(408) 209-9509",
      "408-209-9509",
      "408.209.9509",
      "4082099509",
      "+1 408 209 9509",
      "14082099509",
      " 408 209 9509 ",
    ]) {
      expect(toE164(raw), raw).toEqual({ ok: true, e164: "+14082099509" });
    }
  });

  it("drops extensions and parenthetical notes rather than absorbing their digits", () => {
    expect(toE164("408-209-9509 x12")).toEqual({ ok: true, e164: "+14082099509" });
    expect(toE164("4082099509 (mom)")).toEqual({ ok: true, e164: "+14082099509" });
    expect(toE164("408-209-9509 ext 4")).toEqual({ ok: true, e164: "+14082099509" });
  });

  it("rejects the +15550000000 placeholder via the NANP rule, not a blocklist", () => {
    // Exchange `000` is invalid NANP. Nothing special-cases this string.
    expect(toE164("+15550000000").ok).toBe(false);
    expect(toE164("555-000-0000").ok).toBe(false);
  });

  it("rejects other spreadsheet junk", () => {
    expect(toE164("")).toEqual({ ok: false, reason: "empty" });
    expect(toE164(null)).toEqual({ ok: false, reason: "empty" });
    expect(toE164("n/a")).toEqual({ ok: false, reason: "no digits" });
    expect(toE164("0000000000").ok).toBe(false);
    expect(toE164("1111111111").ok).toBe(false);
    expect(toE164("123-4567").ok).toBe(false); // 7 digits
    expect(toE164("108-209-9509").ok).toBe(false); // area code starts with 1
  });

  it("reports WHY, so a preview can distinguish missing from malformed", () => {
    expect(toE164("12345")).toEqual({ ok: false, reason: "5 digits, expected 10" });
    expect(toE164("208-109-9509")).toEqual({ ok: false, reason: "not a valid US number" });
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Matt@Example.COM ")).toBe("matt@example.com");
  });
  it("rejects non-addresses", () => {
    expect(normalizeEmail("none")).toBeNull();
    expect(normalizeEmail("a b@c.com")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});
