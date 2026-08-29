import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import * as schema from "@/db/schema";

// Test databases are built from src/db/schema.ts itself, not from a checked-in
// SQL snapshot. A snapshot drifts silently — this one had lost three tables, a
// column, and the UNIQUE on clients.phone, so the suite was green against a
// schema production did not have.
const empty = await generateSQLiteDrizzleJson({});
const current = await generateSQLiteDrizzleJson(
  schema as unknown as Record<string, unknown>
);
const SCHEMA_SQL = (await generateSQLiteMigration(empty, current)).join("\n");

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite, { schema });
}
