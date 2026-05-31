import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/api/twilio", "/api/auth", "/api/feedback", "/api/cron", "/login"];

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/_next") || pathname.startsWith("/m2logo") || pathname.includes(".")) {
    return NextResponse.next();
  }

  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    return NextResponse.next();
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
