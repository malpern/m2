import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/test/db";
import { clients } from "@/db/schema";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));
vi.mock("@/lib/twilio", () => ({ sendSMS: vi.fn() }));
vi.mock("@/lib/logger", () => ({ syslog: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { findClient } from "./shared";

function seedClient(db: typeof testDb, name: string, phone: string) {
  return db.insert(clients).values({ name, phone }).returning().get();
}

describe("findClient", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("matches by last 10 digits of a +1 phone number", async () => {
    const c = seedClient(testDb, "Alice", "+14085551234");
    const found = await findClient("+14085551234");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(c.id);
  });

  it("matches formatted phone against stored +1 format", async () => {
    const c = seedClient(testDb, "Bob", "+14085559999");
    const found = await findClient("(408) 555-9999");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(c.id);
  });

  it("matches stored formatted phone against plain digits", async () => {
    const c = seedClient(testDb, "Carol", "(408) 555-7777");
    const found = await findClient("+14085557777");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(c.id);
  });

  it("strips whatsapp: prefix", async () => {
    const c = seedClient(testDb, "Dave", "+14085553333");
    const found = await findClient("whatsapp:+14085553333");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(c.id);
  });

  it("returns null for unknown phone number", async () => {
    seedClient(testDb, "Eve", "+14085550000");
    const found = await findClient("+19995550001");
    expect(found).toBeNull();
  });

  it("returns null for a phone number with fewer than 10 digits", async () => {
    seedClient(testDb, "Frank", "+14085551111");
    const found = await findClient("555");
    expect(found).toBeNull();
  });
});
