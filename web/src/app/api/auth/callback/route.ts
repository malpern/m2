import { handleCallback } from "@/lib/google-calendar";
import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get("oauth_state")?.value;

  if (!code) {
    redirect("/settings?error=no_code");
  }

  if (!state || !storedState || state !== storedState) {
    redirect("/settings?error=invalid_state");
  }

  try {
    await handleCallback(code);
    redirect("/settings?calendar=connected");
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error("Google OAuth callback error:", e);
    redirect("/settings?error=auth_failed");
  }
}
