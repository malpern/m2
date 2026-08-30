import { NextRequest } from "next/server";
import { getDailyDigest } from "@/lib/alerting";
import { sendSMS, isDevAllowed } from "@/lib/twilio";
import { sendEmail } from "@/lib/email";
import { isCronAuthorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-heartbeat";

const ALERT_PHONE = process.env.ALERT_PHONE_NUMBER ?? "+14082099509";
const ALERT_EMAIL = process.env.ALERT_EMAIL ?? "malpern@gmail.com";

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const digest = await getDailyDigest();
  const results: Record<string, unknown> = { digest };

  if (isDevAllowed(ALERT_PHONE)) {
    try {
      await sendSMS(ALERT_PHONE, digest);
      results.whatsapp = "sent";
    } catch (e) {
      results.whatsapp = `failed: ${e}`;
    }
  }

  try {
    const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    await sendEmail(ALERT_EMAIL, `📊 M2 Daily Digest — ${today}`, digest);
    results.email = "sent";
  } catch (e) {
    results.email = `failed: ${e}`;
  }

  await recordCronRun("daily-digest", "digest delivered");

  return Response.json(results);
}

/**
 * Vercel Cron invokes scheduled jobs with **GET**, not POST.
 *
 * This route was POST-only, so every scheduled invocation was answered with
 * 405 and the job never ran once — a scheduled cron that has never executed,
 * with nothing anywhere reporting a problem. Confirmed against production on
 * 2026-08-30: GET returned 405, POST returned 200.
 *
 * Both verbs are kept: GET is what the platform sends, POST is what manual
 * runs and the existing tests use. Both are CRON_SECRET-authenticated, so
 * exposing GET adds no reachable surface.
 */
export const GET = POST;
