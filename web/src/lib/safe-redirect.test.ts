import { describe, it, expect } from "vitest";
import { normalizeRedirect } from "./safe-redirect";

describe("normalizeRedirect", () => {
  it("keeps normal internal paths (with query/hash)", () => {
    expect(normalizeRedirect("/")).toBe("/");
    expect(normalizeRedirect("/clients/42")).toBe("/clients/42");
    expect(normalizeRedirect("/outreach?wave=1#top")).toBe("/outreach?wave=1#top");
  });

  it("falls back for empty/missing values", () => {
    expect(normalizeRedirect(null)).toBe("/");
    expect(normalizeRedirect(undefined)).toBe("/");
    expect(normalizeRedirect("")).toBe("/");
  });

  it("rejects external and protocol-relative targets", () => {
    expect(normalizeRedirect("https://evil.com")).toBe("/");
    expect(normalizeRedirect("http://evil.com/path")).toBe("/");
    expect(normalizeRedirect("//evil.com")).toBe("/");
    expect(normalizeRedirect("/\\evil.com")).toBe("/");
  });

  it("rejects javascript: and control-character payloads", () => {
    expect(normalizeRedirect("javascript:alert(1)")).toBe("/");
    expect(normalizeRedirect("/foo\nhttp://evil.com")).toBe("/");
  });

  it("honors a custom fallback", () => {
    expect(normalizeRedirect("https://evil.com", "/login")).toBe("/login");
  });
});
