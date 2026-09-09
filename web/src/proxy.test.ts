import { describe, it, expect } from "vitest";
import { isPublicPath, isPublicAsset, proxy } from "./proxy";
import { NextRequest } from "next/server";
import { vi } from "vitest";

describe("isPublicPath", () => {
  it("allows login, OAuth start/callback, login/logout, and Twilio webhook", () => {
    expect(isPublicPath("/login")).toBe(true);
    // The A2P campaign registration points reviewers at the signup form.
    expect(isPublicPath("/text-signup")).toBe(true);
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

describe("isPublicAsset", () => {
  it("serves images, fonts, styles and scripts without a session", () => {
    for (const p of [
      "/m2logo.png", "/file.svg", "/globe.svg", "/next.svg", "/vercel.svg",
      "/favicon.ico", "/fonts/inter.woff2", "/styles/app.css", "/chunk.js", "/chunk.js.map",
    ]) {
      expect(isPublicAsset(p), p).toBe(true);
    }
  });

  it("does NOT exempt the help guide — this is the bug it was written for", () => {
    // /guide.html was readable by anyone with the URL because the gate used to
    // skip any path containing a dot.
    expect(isPublicAsset("/guide.html")).toBe(false);
  });

  it("does NOT exempt documents or data exports", () => {
    for (const p of ["/report.pdf", "/clients.csv", "/export.xlsx", "/backup.sql", "/data.json"]) {
      expect(isPublicAsset(p), p).toBe(false);
    }
  });

  it("does not exempt ordinary app or API paths", () => {
    for (const p of ["/", "/clients/1", "/api/search", "/settings/logs"]) {
      expect(isPublicAsset(p), p).toBe(false);
    }
  });

  it("is not fooled by a dot earlier in the path", () => {
    // The old rule looked at the whole path, so this slipped through.
    expect(isPublicAsset("/v1.2/clients")).toBe(false);
    expect(isPublicAsset("/api/v2.0/export")).toBe(false);
  });

  it("does not expose dotfiles", () => {
    expect(isPublicAsset("/.env")).toBe(false);
    expect(isPublicAsset("/.git/config")).toBe(false);
  });

  it("matches extensions case-insensitively", () => {
    expect(isPublicAsset("/LOGO.PNG")).toBe(true);
    expect(isPublicAsset("/GUIDE.HTML")).toBe(false);
  });

  it("keeps the PWA manifest reachable, but only that exact path", () => {
    expect(isPublicPath("/manifest.json")).toBe(true);
    expect(isPublicAsset("/manifest.json")).toBe(false);
    expect(isPublicPath("/clients/manifest.json")).toBe(false);
  });

  it("lets the watchdog reach the health probe", () => {
    expect(isPublicPath("/api/health")).toBe(true);
  });

  it("lets an external monitor reach the credential-free summary", () => {
    // A third-party monitor cannot hold CRON_SECRET, so the traffic light is
    // public while the detailed probe stays authenticated.
    expect(isPublicPath("/api/health/summary")).toBe(true);
  });

  it("does not open anything else under /api/health", () => {
    expect(isPublicPath("/api/health/detail")).toBe(false);
    expect(isPublicPath("/api/health/summary/raw")).toBe(false);
  });
});

describe("the public legal pages", () => {
  it("serves /privacy and /terms without a session", () => {
    // Linked from the Google OAuth consent screen, so the reader is typically
    // signed out and may not be a client at all.
    expect(isPublicPath("/privacy")).toBe(true);
    expect(isPublicPath("/terms")).toBe(true);
  });

  it("does not open anything underneath them", () => {
    expect(isPublicPath("/privacy/edit")).toBe(false);
    expect(isPublicPath("/terms/admin")).toBe(false);
  });

  it("is not fooled by lookalike paths", () => {
    expect(isPublicPath("/privacy-policy")).toBe(false);
    expect(isPublicPath("/settings/privacy")).toBe(false);
  });
});

describe("Search Console verification file", () => {
  it("is public — Google fetches it anonymously", () => {
    expect(isPublicPath("/google753b0869b8fe2f63.html")).toBe(true);
  });

  it("does NOT make .html public in general", () => {
    // The guide.html lesson: an extension allowlist, not a dot check.
    expect(isPublicAsset("/google753b0869b8fe2f63.html")).toBe(false);
    expect(isPublicPath("/guide.html")).toBe(false);
    expect(isPublicAsset("/guide.html")).toBe(false);
  });
});

describe("the root path for anonymous visitors", () => {
  it("serves the public landing page at / by rewrite, keeping the URL", async () => {
    vi.stubEnv("APP_PASSWORD", "secret");
    const res = await proxy(new NextRequest("https://m2scheduler.com/"));
    // A rewrite, not a redirect: Google's review fetches "/" and must get a
    // 200 page that explains the app, not a 307 to /login.
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-rewrite")).toContain("/welcome");
    vi.unstubAllEnvs();
  });

  it("still sends every OTHER protected path to /login", async () => {
    vi.stubEnv("APP_PASSWORD", "secret");
    const res = await proxy(new NextRequest("https://m2scheduler.com/schedule"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?redirect=%2Fschedule");
    vi.unstubAllEnvs();
  });

  it("lists /welcome as public so the rewrite target is not itself gated", () => {
    expect(isPublicPath("/welcome")).toBe(true);
  });
});
