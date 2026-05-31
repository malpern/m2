import { NextRequest } from "next/server";
import { getDailyDigest } from "@/lib/alerting";
import { sendSMS, isDevAllowed } from "@/lib/twilio";

const ALERT_PHONE = "+14082099509";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const digest = await getDailyDigest();

  if (isDevAllowed(ALERT_PHONE)) {
    try {
      await sendSMS(ALERT_PHONE, digest);
      return Response.json({ sent: true, digest });
    } catch (e) {
      return Response.json({ sent: false, error: String(e), digest });
    }
  }

  return Response.json({ sent: false, reason: "dev guard", digest });
}
