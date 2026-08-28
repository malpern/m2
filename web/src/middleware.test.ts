import { describe, it, expect } from "vitest";
import { isPublicPath } from "./middleware";

describe("isPublicPath", () => {
  it("allows login, OAuth start/callback, login/logout, and Twilio webhook", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/auth")).toBe(true);
    expect(isPublicPath("/api/auth/callback")).toBe(true);
    expect(isPublicPath("/api/auth/login")).toBe(true);
    expect(isPublicPath("/api/auth/logout")).toBe(true);
    expect(isPublicPath("/api/twilio")).toBe(true);
  });

  it("allows authenticated cron routes (they check CRON_SECRET in-route)", () => {
    expect(isPublicPath("/api/cron/send-waves")).toBe(true);
    expect(isPublicPath("/api/cron/daily-digest")).toBe(true);
  });

  it("does NOT expose operational auth routes", () => {
    expect(isPublicPath("/api/auth/disconnect")).toBe(false);
  });

  it("does NOT public-allow app pages or data APIs", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/clients/1")).toBe(false);
    expect(isPublicPath("/api/import-clients")).toBe(false);
    expect(isPublicPath("/api/search")).toBe(false);
  });

  it("is not fooled by prefix lookalikes", () => {
    expect(isPublicPath("/login-as-admin")).toBe(false);
    expect(isPublicPath("/api/authx")).toBe(false);
    expect(isPublicPath("/api/auth/disconnect/evil")).toBe(false);
  });
});
