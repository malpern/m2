import { NextRequest, NextResponse } from "next/server";

// Exact public routes — no app session required. Kept deliberately narrow so
// operational endpoints (e.g. /api/auth/disconnect) stay behind the auth gate.
const PUBLIC_EXACT = new Set([
  "/login",
  "/api/auth", // Google OAuth start
  "/api/auth/callback", // Google OAuth callback
  "/api/auth/login",
  "/api/auth/logout",
  "/api/twilio", // Twilio webhook (signature-verified in-route)
]);

// Cron routes authenticate themselves via CRON_SECRET (see lib/cron-auth.ts).
const PUBLIC_PREFIXES = ["/api/cron/"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/_next") || pathname.startsWith("/m2logo") || pathname.includes(".")) {
    return NextResponse.next();
  }

  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    return new NextResponse("Service Unavailable: APP_PASSWORD not configured", {
      status: 503,
    });
  }

  const authCookie = request.cookies.get("m2_auth");
  if (authCookie?.value) {
    const expected = await hashPassword(appPassword);
    if (authCookie.value === expected) {
      return NextResponse.next();
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
