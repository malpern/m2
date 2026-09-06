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
  "/api/health", // watchdog health probe (CRON_SECRET-authenticated in-route)
  // Credential-free traffic light for an external uptime monitor. Public by
  // design — see the route for what it deliberately does and does not reveal.
  "/api/health/summary",
  "/manifest.json", // PWA manifest, fetched before any session exists
  // The legal pages are linked from the Google OAuth consent screen, so they
  // must render for people who are not signed in and are not clients. Google
  // stores these URLs as literal strings and never re-discovers them — if
  // either path changes, update the consent screen by hand.
  "/privacy",
  "/terms",
]);

// Cron routes authenticate themselves via CRON_SECRET (see lib/cron-auth.ts).
// /api/health does the same, so the external watchdog can reach it without an
// app session — it is the endpoint that has to answer when the app is unwell.
const PUBLIC_PREFIXES = ["/api/cron/"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Static assets servable without a session.
 *
 * This is an allowlist of EXTENSIONS, and deliberately so. It used to be
 * `pathname.includes(".")`, which meant *any* path containing a dot skipped
 * the gate entirely — that is why the help guide at /guide.html was readable
 * by anyone with the URL, and it would have silently exposed the next .html,
 * .csv or .pdf anybody added too. Assets are images, fonts, styles and
 * scripts; documents and data are not assets and stay behind the password.
 *
 * manifest.json is listed as an exact public path rather than allowing the
 * whole .json extension, so a future data export cannot inherit an exemption.
 */
const PUBLIC_ASSET_EXTENSIONS = new Set([
  "svg", "png", "jpg", "jpeg", "gif", "webp", "avif", "ico",
  "css", "js", "mjs", "map",
  "woff", "woff2", "ttf", "otf", "eot",
  "txt", "xml",
]);

export function isPublicAsset(pathname: string): boolean {
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  const dot = lastSegment.lastIndexOf(".");
  if (dot <= 0) return false; // no extension, or a dotfile like /.env
  return PUBLIC_ASSET_EXTENSIONS.has(lastSegment.slice(dot + 1).toLowerCase());
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/_next") || isPublicAsset(pathname)) {
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
