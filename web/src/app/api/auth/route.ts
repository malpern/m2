import { getAuthUrl } from "@/lib/google-calendar";
import { NextResponse } from "next/server";

export async function GET() {
  const { url, state } = getAuthUrl();

  const response = NextResponse.redirect(url);
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
