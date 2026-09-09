"use server";

import { headers } from "next/headers";
import { processSignup, type SignupResponse } from "@/lib/signup";

export async function submitTextSignup(_prev: SignupResponse | null, form: FormData): Promise<SignupResponse> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
  const userAgent = h.get("user-agent") ?? "";
  return processSignup({ form, ip, userAgent });
}
