import { db } from "./src/db";
import { sessions } from "./src/db/schema";
import { eq } from "drizzle-orm";
import { deleteCalendarEvent, isConnected } from "./src/lib/google-calendar";

const { connected } = await isConnected();
if (!connected) {
  console.log("Google Calendar not connected");
  process.exit(1);
}

const evts = await db.select({ id: sessions.id, gcalEventId: sessions.gcalEventId })
  .from(sessions)
  .where(eq(sessions.clientId, 344))
  .all();

let removed = 0;
for (const e of evts) {
  if (e.gcalEventId) {
    console.log(`Deleting GCal event ${e.gcalEventId} (session ${e.id})...`);
    try {
      const ok = await deleteCalendarEvent(e.gcalEventId);
      if (ok) {
        await db.update(sessions).set({ gcalEventId: null }).where(eq(sessions.id, e.id)).run();
        removed++;
        console.log("  Deleted.");
      } else {
        console.log("  Failed (no auth).");
      }
    } catch (err) {
      console.log(`  Error: ${err instanceof Error ? err.message : err}`);
    }
  }
}

console.log(`\nRemoved ${removed} calendar events.`);
