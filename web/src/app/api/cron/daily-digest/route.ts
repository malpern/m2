import { NextRequest } from "next/server";
import { getDailyDigest } from "@/lib/alerting";
import { sendSMS, isDevAllowed } from "@/lib/twilio";
import { sendEmail } from "@/lib/email";
import { isCronAuthorized } from "@/lib/cron-auth";

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

  return Response.json(results);
}
