import { describe, it, expect, vi, beforeEach } from "vitest";
import { clients, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";

// Real in-memory SQLite behind the real Drizzle schema, so the insert/delete
// paths are exercised for real; only the Google edges are stubbed.
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: createTestDb() };
});
const mockSync = vi.fn();
const mockDeleteEvent = vi.fn();
vi.mock("@/lib/gcal-sync", () => ({ syncSessionToCalendar: (...a: unknown[]) => mockSync(...a) }));
vi.mock("@/lib/google-calendar", () => ({ deleteCalendarEvent: (...a: unknown[]) => mockDeleteEvent(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { db } = await import("@/db");
const { addManualSession, deleteSession } = await import("./actions");

beforeEach(async () => {
  vi.clearAllMocks();
  mockSync.mockResolvedValue(undefined);
  mockDeleteEvent.mockResolvedValue(true);
  await db.delete(sessions).run();
  await db.delete(clients).run();
});

describe("addManualSession", () => {
  it("inserts a confirmed session and syncs THAT session to Google Calendar", async () => {
    const c = await db.insert(clients).values({ name: "Demo Client", phone: "+14085550100" }).returning().get();

    await addManualSession(c.id, "2026-09-13", "10:00");

    const rows = await db.select().from(sessions).where(eq(sessions.clientId, c.id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("confirmed");
    // The id passed to the sync must be the row just created — not undefined,
    // not a stale count — or the calendar silently gets nothing.
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledWith(rows[0].id);
  });

  it("still records the session when the calendar sync throws", async () => {
    const c = await db.insert(clients).values({ name: "Demo Client", phone: "+14085550101" }).returning().get();
    mockSync.mockRejectedValue(new Error("calendar down"));

    await expect(addManualSession(c.id, "2026-09-13", "10:00")).resolves.toBeUndefined();
    expect(await db.select().from(sessions).all()).toHaveLength(1);
  });
});

describe("deleteSession", () => {
  it("removes the Google Calendar event before deleting a synced session", async () => {
    const c = await db.insert(clients).values({ name: "Demo Client", phone: "+14085550102" }).returning().get();
    const s = await db.insert(sessions).values({
      clientId: c.id, scheduledDate: "2026-09-13", scheduledTime: "10:00", slot: "3pm",
      status: "confirmed", gcalEventId: "evt_123",
    }).returning().get();

    await deleteSession(s.id);

    expect(mockDeleteEvent).toHaveBeenCalledWith("evt_123");
    expect(await db.select().from(sessions).all()).toHaveLength(0);
  });

  it("does not call Google at all for a session that was never synced", async () => {
    const c = await db.insert(clients).values({ name: "Demo Client", phone: "+14085550103" }).returning().get();
    const s = await db.insert(sessions).values({
      clientId: c.id, scheduledDate: "2026-09-13", scheduledTime: "10:00", slot: "3pm", status: "confirmed",
    }).returning().get();

    await deleteSession(s.id);

    expect(mockDeleteEvent).not.toHaveBeenCalled();
    expect(await db.select().from(sessions).all()).toHaveLength(0);
  });

  it("still deletes the row when removing the calendar event fails", async () => {
    const c = await db.insert(clients).values({ name: "Demo Client", phone: "+14085550104" }).returning().get();
    const s = await db.insert(sessions).values({
      clientId: c.id, scheduledDate: "2026-09-13", scheduledTime: "10:00", slot: "3pm",
      status: "confirmed", gcalEventId: "evt_gone",
    }).returning().get();
    mockDeleteEvent.mockRejectedValue(new Error("404"));

    await deleteSession(s.id);
    expect(await db.select().from(sessions).all()).toHaveLength(0);
  });
});
