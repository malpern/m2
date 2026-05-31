import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function GET() {
  const results: string[] = [];
  const migrations = [
    `CREATE TABLE IF NOT EXISTS weekly_skips (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL REFERENCES clients(id), week_of TEXT NOT NULL, reason TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  ];
  for (const m of migrations) {
    try {
      await db.run(sql.raw(m));
      results.push("OK: " + m.slice(0, 60));
    } catch (e) {
      results.push("ERROR: " + (e instanceof Error ? e.message : String(e)));
    }
  }
  return Response.json({ results });
}
