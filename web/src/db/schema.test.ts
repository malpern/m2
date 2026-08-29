import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import {
  clients,
  packages,
  packageTransactions,
  sessions,
  outreach,
  googleTokens,
  outreachSettings,
  guideFeedback,
} from "./schema";

function freshDb() {
  return createTestDb();
}

describe("clients table", () => {
  let db: ReturnType<typeof freshDb>;

  beforeEach(() => {
    db = freshDb();
  });

  it("inserts and retrieves a client", () => {
    db.insert(clients)
      .values({ name: "Test User", phone: "+15551234567" })
      .run();

    const result = db.select().from(clients).all();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Test User");
    expect(result[0].category).toBe("active");
    expect(result[0].behaviorScore).toBe(5);
    expect(result[0].maxSessionsPerWeek).toBe(1);
  });

  it("enforces valid category values via application layer types", () => {
    const client = db
      .insert(clients)
      .values({
        name: "Test",
        phone: "+1555",
        category: "in_season",
      })
      .returning()
      .get();

    expect(client.category).toBe("in_season");
  });

  it("supports all grade levels including adult", () => {
    const grades = ["freshman", "sophomore", "junior", "senior", "post_grad", "adult"] as const;

    // clients.phone is UNIQUE, so each row needs its own number.
    grades.forEach((grade, i) => {
      db.insert(clients)
        .values({ name: `Grade ${grade}`, phone: `+1555000${i}`, gradeLevel: grade })
        .run();
    });

    const result = db.select().from(clients).all();
    expect(result).toHaveLength(grades.length);
  });

  it("updates a client", () => {
    const client = db
      .insert(clients)
      .values({ name: "Before", phone: "+1555" })
      .returning()
      .get();

    db.update(clients)
      .set({ name: "After", behaviorScore: 9 })
      .where(eq(clients.id, client.id))
      .run();

    const updated = db.select().from(clients).where(eq(clients.id, client.id)).get();
    expect(updated!.name).toBe("After");
    expect(updated!.behaviorScore).toBe(9);
  });

  it("deletes a client", () => {
    const client = db
      .insert(clients)
      .values({ name: "ToDelete", phone: "+1555" })
      .returning()
      .get();

    db.delete(clients).where(eq(clients.id, client.id)).run();
    const result = db.select().from(clients).all();
    expect(result).toHaveLength(0);
  });
});

describe("packages table", () => {
  let db: ReturnType<typeof freshDb>;

  beforeEach(() => {
    db = freshDb();
  });

  it("creates a package linked to a client", () => {
    const client = db
      .insert(clients)
      .values({ name: "Reggie", phone: "+1555" })
      .returning()
      .get();

    db.insert(packages)
      .values({ clientId: client.id, totalSessions: 10, sessionsUsed: 3 })
      .run();

    const pkg = db.select().from(packages).where(eq(packages.clientId, client.id)).get();
    expect(pkg!.totalSessions).toBe(10);
    expect(pkg!.sessionsUsed).toBe(3);
    expect(pkg!.totalSessions - pkg!.sessionsUsed).toBe(7);
  });

  it("tracks session usage", () => {
    const client = db
      .insert(clients)
      .values({ name: "Johnny", phone: "+1555" })
      .returning()
      .get();

    const pkg = db
      .insert(packages)
      .values({ clientId: client.id, totalSessions: 10, sessionsUsed: 0 })
      .returning()
      .get();

    db.update(packages)
      .set({ sessionsUsed: 5 })
      .where(eq(packages.id, pkg.id))
      .run();

    const updated = db.select().from(packages).where(eq(packages.id, pkg.id)).get();
    expect(updated!.sessionsUsed).toBe(5);
  });
});

describe("sessions table", () => {
  let db: ReturnType<typeof freshDb>;

  beforeEach(() => {
    db = freshDb();
  });

  it("creates a session for a client", () => {
    const client = db
      .insert(clients)
      .values({ name: "Pete", phone: "+1555" })
      .returning()
      .get();

    db.insert(sessions)
      .values({
        clientId: client.id,
        scheduledDate: "2026-05-25",
        scheduledTime: "3:00 PM",
        slot: "3pm",
        status: "proposed",
      })
      .run();

    const result = db.select().from(sessions).where(eq(sessions.clientId, client.id)).all();
    expect(result).toHaveLength(1);
    expect(result[0].slot).toBe("3pm");
    expect(result[0].status).toBe("proposed");
    expect(result[0].reconciled).toBe(false);
  });

  it("tracks reconciliation status", () => {
    const client = db
      .insert(clients)
      .values({ name: "Nolan", phone: "+1555" })
      .returning()
      .get();

    const session = db
      .insert(sessions)
      .values({
        clientId: client.id,
        scheduledDate: "2026-05-25",
        scheduledTime: "5:00 PM",
        slot: "5pm",
        status: "completed",
      })
      .returning()
      .get();

    expect(session.reconciled).toBe(false);

    db.update(sessions)
      .set({ reconciled: true })
      .where(eq(sessions.id, session.id))
      .run();

    const updated = db.select().from(sessions).where(eq(sessions.id, session.id)).get();
    expect(updated!.reconciled).toBe(true);
  });
});

describe("outreach table", () => {
  let db: ReturnType<typeof freshDb>;

  beforeEach(() => {
    db = freshDb();
  });

  it("creates outreach records", () => {
    const client = db
      .insert(clients)
      .values({ name: "Rod", phone: "+1555" })
      .returning()
      .get();

    db.insert(outreach)
      .values({
        clientId: client.id,
        weekOf: "2026-05-25",
        direction: "sent",
        messageText: "Hey Rod, are you free Thursday at 3pm?",
        status: "awaiting_reply",
      })
      .run();

    const result = db.select().from(outreach).where(eq(outreach.clientId, client.id)).all();
    expect(result).toHaveLength(1);
    expect(result[0].direction).toBe("sent");
    expect(result[0].status).toBe("awaiting_reply");
  });

  it("updates interpretation on reply", () => {
    const client = db
      .insert(clients)
      .values({ name: "Tom", phone: "+1555" })
      .returning()
      .get();

    const msg = db
      .insert(outreach)
      .values({
        clientId: client.id,
        weekOf: "2026-05-25",
        direction: "sent",
        messageText: "Thursday at 5pm?",
        status: "awaiting_reply",
      })
      .returning()
      .get();

    db.update(outreach)
      .set({
        interpretation: "confirmed",
        status: "confirmed",
        repliedAt: new Date().toISOString(),
      })
      .where(eq(outreach.id, msg.id))
      .run();

    const updated = db.select().from(outreach).where(eq(outreach.id, msg.id)).get();
    expect(updated!.interpretation).toBe("confirmed");
    expect(updated!.status).toBe("confirmed");
  });
});

// The test database used to be built from a checked-in SQL snapshot that had
// drifted from schema.ts: it was missing google_tokens, outreach_settings and
// guide_feedback entirely, missing package_transactions.note, and missing the
// UNIQUE on clients.phone. Pages querying those tables 500'd in production
// while the suite stayed green. src/test/db.ts now derives the DDL from
// schema.ts, and these cases assert the specific things that had gone missing.
describe("test database matches src/db/schema.ts", () => {
  let db: ReturnType<typeof freshDb>;

  beforeEach(() => {
    db = freshDb();
  });

  it("enforces UNIQUE on clients.phone", () => {
    db.insert(clients).values({ name: "First", phone: "+15550001" }).run();

    expect(() =>
      db.insert(clients).values({ name: "Second", phone: "+15550001" }).run()
    ).toThrow(/UNIQUE/i);
  });

  it("has a package_transactions.note column", () => {
    const client = db
      .insert(clients)
      .values({ name: "Noted", phone: "+15550002" })
      .returning()
      .get();
    const pkg = db
      .insert(packages)
      .values({ clientId: client.id, totalSessions: 10 })
      .returning()
      .get();

    const txn = db
      .insert(packageTransactions)
      .values({
        packageId: pkg.id,
        delta: -1,
        reason: "manual_adjustment",
        previousBalance: 10,
        newBalance: 9,
        note: "comped a session",
      })
      .returning()
      .get();

    expect(txn.note).toBe("comped a session");
  });

  it.each([
    ["google_tokens", googleTokens],
    ["outreach_settings", outreachSettings],
    ["guide_feedback", guideFeedback],
  ])("has the %s table", (_name, table) => {
    expect(() => db.select().from(table).all()).not.toThrow();
  });
});
