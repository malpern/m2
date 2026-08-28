import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// Lazily construct the libsql client so that merely importing this module
// (e.g. during `next build` route collection) does not require the database
// env to be present. The client is created on first actual use, and a missing
// URL produces a clear, actionable error instead of a cryptic URL_INVALID.
let instance: LibSQLDatabase<typeof schema> | null = null;

function getDb(): LibSQLDatabase<typeof schema> {
  if (instance) return instance;

  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is not set. Add it to your environment (e.g. web/.env.local) before using the database.",
    );
  }

  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  instance = drizzle(client, { schema });
  return instance;
}

// Proxy keeps the `import { db }` call sites unchanged while deferring client
// construction until a property (select/insert/transaction/...) is accessed.
export const db = new Proxy({} as LibSQLDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
