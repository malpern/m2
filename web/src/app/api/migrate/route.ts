import { db } from "@/db";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const results: string[] = [];

  const migrations = [
    {
      name: "add session_reminders to clients",
      sql: `ALTER TABLE clients ADD COLUMN session_reminders INTEGER`,
    },
    {
      name: "add session_reminders_global to outreach_settings",
      sql: `ALTER TABLE outreach_settings ADD COLUMN session_reminders_global INTEGER NOT NULL DEFAULT 0`,
    },
  ];

  for (const m of migrations) {
    try {
      await db.run(sql.raw(m.sql));
      results.push(`OK: ${m.name}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("duplicate column") || msg.includes("already exists")) {
        results.push(`SKIP (already exists): ${m.name}`);
      } else {
        results.push(`ERROR: ${m.name}: ${msg}`);
      }
    }
  }

  return Response.json({ results });
}
