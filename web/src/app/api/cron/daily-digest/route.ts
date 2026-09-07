import { NextRequest } from "next/server";
import { getDailyDigest } from "@/lib/alerting";
import { sendSMS, isDevAllowed } from "@/lib/twilio";
import { sendPush } from "@/lib/push";
import { isCronAuthorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-heartbeat";

const ALERT_PHONE = process.env.ALERT_PHONE_NUMBER ?? "+14082099509";

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

  // Priority 0: a digest is a daily read, not an interruption.
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const push = await sendPush(`M2 Daily Digest — ${today}`, digest, 0);
  // Report the transport's own verdict rather than "sent" for anything that did
  // not throw. sendPush returns `skipped` for an unconfigured or rejecting
  // Pushover, and recording that as success is how a silent outage starts.
  results.push = push.status === "sent" ? "sent" : `skipped: ${push.reason}`;

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
