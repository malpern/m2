import { db } from "@/db";
import { clients } from "@/db/schema";
import { sql } from "drizzle-orm";

/**
 * A credential-free health summary, for external uptime monitors.
 *
 * /api/health is the detailed probe and requires CRON_SECRET, which is correct
 * for a watchdog we control but useless to a third-party monitor: handing a
 * shared secret to an external service to poll every five minutes is a worse
 * trade than publishing a traffic light.
 *
 * So this endpoint is deliberately thin. It reveals whether the app is
 * serving and which subsystem is unhappy BY NAME, and nothing else — no
 * counts, no addresses, no configuration, no error text. An anonymous visitor
 * learns "m2 is up" or "m2's database is unhappy", which is what any observer
 * could infer from the site being slow or erroring anyway.
 *
 * It checks the database rather than merely returning 200, because "Next.js is
 * serving" is not the same claim as "the app works" — a static OK endpoint
 * would have reported healthy through every outage worth paging about.
 */

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 5_000;

export async function GET() {
  const failing: string[] = [];

  try {
    await Promise.race([
      db.select({ n: sql<number>`count(*)` }).from(clients).get(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS),
      ),
    ]);
  } catch {
    failing.push("database");
  }

  const status = failing.length === 0 ? "ok" : "down";

  return Response.json(
    { status, failing },
    {
      // 503 when down, so a plain status-code monitor notices without needing
      // to parse anything. Keyword monitors can match on "ok" instead.
      status: status === "ok" ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
