import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { isRateLimited } from "@/lib/rate-limit";

// Throttle login attempts per client IP: the app is gated by a single shared
// password, so cheap unauthenticated guessing must be rate-limited.
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";

  if (isRateLimited(`login:${ip}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a minute." },
      { status: 429 },
    );
  }

  const { password } = await request.json();
  const appPassword = process.env.APP_PASSWORD;

  if (!appPassword || password !== appPassword) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const hash = createHash("sha256").update(appPassword).digest("hex");

  const response = NextResponse.json({ ok: true });
  response.cookies.set("m2_auth", hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  return response;
}
