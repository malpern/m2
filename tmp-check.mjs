import { createClient } from "@libsql/client";
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const sess = await client.execute("SELECT id, status, gcal_event_id FROM sessions WHERE client_id = 344 AND scheduled_date >= '2026-06-01'");
for (const r of sess.rows) console.log(`session ${r.id}: status=${r.status} gcal=${r.gcal_event_id}`);

const logs = await client.execute("SELECT severity, category, matt_message, technical_message FROM system_logs ORDER BY id DESC LIMIT 3");
console.log("\nRecent logs:");
for (const r of logs.rows) console.log(`  [${r.severity}] [${r.category}] ${r.technical_message}`);
client.close();
