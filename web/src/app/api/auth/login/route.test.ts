import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { rateLimitMap } from "@/lib/rate-limit";

function loginRequest(password: string, ip = "1.2.3.4"): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ password }),
  });
}

beforeEach(() => {
  rateLimitMap.clear();
  vi.stubEnv("APP_PASSWORD", "correct-horse");
});

describe("POST /api/auth/login", () => {
  it("sets the auth cookie on a correct password", async () => {
    const res = await POST(loginRequest("correct-horse", "10.0.0.1"));
    expect(res.status).toBe(200);
    expect(res.cookies.get("m2_auth")?.value).toBeTruthy();
  });

  it("returns 401 on a wrong password", async () => {
    const res = await POST(loginRequest("nope", "10.0.0.2"));
    expect(res.status).toBe(401);
    expect(res.cookies.get("m2_auth")?.value).toBeFalsy();
  });

  it("rate-limits repeated attempts from the same IP", async () => {
    const ip = "10.0.0.3";
    for (let i = 0; i < 10; i++) {
      const res = await POST(loginRequest("nope", ip));
      expect(res.status).toBe(401);
    }
    const blocked = await POST(loginRequest("correct-horse", ip));
    expect(blocked.status).toBe(429);
  });

  it("tracks limits independently per IP", async () => {
    for (let i = 0; i < 10; i++) {
      await POST(loginRequest("nope", "10.0.0.4"));
    }
    const other = await POST(loginRequest("correct-horse", "10.0.0.5"));
    expect(other.status).toBe(200);
  });
});
