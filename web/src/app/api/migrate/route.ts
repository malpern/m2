import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function GET() {
  const results: string[] = [];
  try {
    await db.run(sql.raw(`ALTER TABLE outreach ADD COLUMN follow_up_at TEXT`));
    results.push("OK: added follow_up_at to outreach");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push(msg.includes("duplicate") || msg.includes("already") ? "SKIP: follow_up_at already exists" : `ERROR: ${msg}`);
  }
  return Response.json({ results });
}
