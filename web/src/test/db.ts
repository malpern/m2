import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@/db/schema";
import fs from "fs";
import path from "path";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  const schemaSQL = fs.readFileSync(
    path.join(__dirname, "../../drizzle-test-schema.sql"),
    "utf-8"
  );
  sqlite.exec(schemaSQL);

  return drizzle(sqlite, { schema });
}
