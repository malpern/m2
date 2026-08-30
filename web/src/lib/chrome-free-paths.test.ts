import { describe, it, expect } from "vitest";
import { isChromeFree, CHROME_FREE_PATHS } from "./chrome-free-paths";

describe("isChromeFree", () => {
  it("hides the app chrome on the public legal pages", () => {
    expect(isChromeFree("/privacy")).toBe(true);
    expect(isChromeFree("/terms")).toBe(true);
  });

  it("keeps the chrome on every app page", () => {
    for (const p of ["/", "/schedule", "/clients", "/clients/1", "/outreach", "/settings"]) {
      expect(isChromeFree(p), p).toBe(false);
    }
  });

  it("is exact — a lookalike path still gets the chrome", () => {
    expect(isChromeFree("/privacy-settings")).toBe(false);
    expect(isChromeFree("/settings/privacy")).toBe(false);
  });

  it("stays in step with the routes the proxy exposes", () => {
    // Both lists describe the same set of public pages. If one grows without
    // the other, either the page 302s to login or it renders with a nav full
    // of links the visitor cannot follow.
    expect([...CHROME_FREE_PATHS].sort()).toEqual(["/privacy", "/terms"]);
  });
});
