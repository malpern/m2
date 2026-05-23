import { handleCallback } from "@/lib/google-calendar";
import { NextRequest } from "next/server";
import { redirect } from "next/navigation";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    redirect("/settings?error=no_code");
  }

  try {
    await handleCallback(code);
    redirect("/settings?calendar=connected");
  } catch (e) {
    console.error("Google OAuth callback error:", e);
    redirect("/settings?error=auth_failed");
  }
}
