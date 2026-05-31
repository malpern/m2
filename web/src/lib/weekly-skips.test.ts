import { describe, it, expect } from "vitest";
import { createTestDb } from "@/test/db";
import { weeklySkips, clients } from "@/db/schema";
import { eq, and } from "drizzle-orm";

function seedClient(db: ReturnType<typeof createTestDb>, name = "Test Client", phone = "+1555") {
  return db.insert(clients).values({ name, phone }).returning().get();
}

describe("weeklySkips table", () => {
  it("inserts a skip record for a client and week", () => {
    const db = createTestDb();
    const client = seedClient(db);

    db.insert(weeklySkips).values({
      clientId: client.id,
      weekOf: "2026-06-01",
      reason: "traveling",
    }).run();

    const skips = db.select().from(weeklySkips).where(
      and(eq(weeklySkips.clientId, client.id), eq(weeklySkips.weekOf, "2026-06-01"))
    ).all();

    expect(skips).toHaveLength(1);
    expect(skips[0].reason).toBe("traveling");
  });

  it("allows skip without a reason", () => {
    const db = createTestDb();
    const client = seedClient(db);

    db.insert(weeklySkips).values({
      clientId: client.id,
      weekOf: "2026-06-01",
    }).run();

    const skips = db.select().from(weeklySkips).all();
    expect(skips).toHaveLength(1);
    expect(skips[0].reason).toBeNull();
  });

  it("can delete a skip (unskip)", () => {
    const db = createTestDb();
    const client = seedClient(db);

    db.insert(weeklySkips).values({
      clientId: client.id,
      weekOf: "2026-06-01",
    }).run();

    db.delete(weeklySkips).where(
      and(eq(weeklySkips.clientId, client.id), eq(weeklySkips.weekOf, "2026-06-01"))
    ).run();

    const skips = db.select().from(weeklySkips).all();
    expect(skips).toHaveLength(0);
  });

  it("skips are scoped per week — different weeks are independent", () => {
    const db = createTestDb();
    const client = seedClient(db);

    db.insert(weeklySkips).values({ clientId: client.id, weekOf: "2026-06-01" }).run();
    db.insert(weeklySkips).values({ clientId: client.id, weekOf: "2026-06-08" }).run();

    const week1 = db.select().from(weeklySkips).where(eq(weeklySkips.weekOf, "2026-06-01")).all();
    const week2 = db.select().from(weeklySkips).where(eq(weeklySkips.weekOf, "2026-06-08")).all();

    expect(week1).toHaveLength(1);
    expect(week2).toHaveLength(1);

    // Deleting week 1 skip doesn't affect week 2
    db.delete(weeklySkips).where(
      and(eq(weeklySkips.clientId, client.id), eq(weeklySkips.weekOf, "2026-06-01"))
    ).run();

    const afterDelete = db.select().from(weeklySkips).all();
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0].weekOf).toBe("2026-06-08");
  });

  it("filtering outreach queue by skipped clients", () => {
    const db = createTestDb();
    const client1 = seedClient(db, "Alice", "+15551111");
    const client2 = seedClient(db, "Bob", "+15552222");
    const client3 = seedClient(db, "Charlie", "+15553333");

    // Skip client2 for this week
    db.insert(weeklySkips).values({ clientId: client2.id, weekOf: "2026-06-01" }).run();

    // Get skipped IDs for the week
    const skips = db.select({ clientId: weeklySkips.clientId })
      .from(weeklySkips)
      .where(eq(weeklySkips.weekOf, "2026-06-01"))
      .all();
    const skippedIds = new Set(skips.map((s) => s.clientId));

    // Simulate filtering
    const allClientIds = [client1.id, client2.id, client3.id];
    const activeIds = allClientIds.filter((id) => !skippedIds.has(id));

    expect(activeIds).toHaveLength(2);
    expect(activeIds).toContain(client1.id);
    expect(activeIds).not.toContain(client2.id);
    expect(activeIds).toContain(client3.id);
  });
});
