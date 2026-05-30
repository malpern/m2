import { db } from "@/db";
import { clients, sessions, outreach } from "@/db/schema";
import { eq, and, gte, lte, ne } from "drizzle-orm";
import { sortByPriority, isSchedulable } from "./priority";
import { sendSMS, isDevAllowed } from "./twilio";
import { getMonday } from "./scheduler";

export async function autoFillCancelledSlot(
  cancelledDate: string,
  cancelledSlot: string,
  cancelledClientId: number,
): Promise<{ offered: boolean; clientName?: string; skipped?: string }> {
  const weekOf = getMonday().toISOString().split("T")[0];
  const monday = weekOf;
  const sunday = new Date(new Date(monday + "T12:00:00Z").getTime() + 6 * 86400000)
    .toISOString().split("T")[0];

  const weekSessions = await db
    .select({ clientId: sessions.clientId })
    .from(sessions)
    .where(and(
      gte(sessions.scheduledDate, monday),
      lte(sessions.scheduledDate, sunday),
      ne(sessions.status, "cancelled"),
    ))
    .all();

  const bookedClientIds = new Set(weekSessions.map((s) => s.clientId));

  const allClients = await db.select().from(clients).all();
  const eligible = allClients.filter((c) =>
    isSchedulable(c) &&
    c.id !== cancelledClientId &&
    !bookedClientIds.has(c.id)
  );

  if (eligible.length === 0) return { offered: false };

  const sorted = sortByPriority(eligible);
  const topClient = sorted[0];

  if (!isDevAllowed(topClient.phone)) {
    return { offered: false, skipped: `${topClient.name} (dev guard)` };
  }

  const dayLabel = new Date(cancelledDate + "T12:00:00Z")
    .toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });

  const firstName = topClient.name.split(" ")[0];
  const message = `Hey ${firstName}, a ${dayLabel} at ${cancelledSlot} slot just opened up — want it?`;

  const SLOT_TIMES: Record<string, string> = {
    "3pm": "15:00", "4pm": "16:00", "5pm": "17:00", "6pm": "18:00", "7pm": "19:00",
  };

  const newSession = await db.insert(sessions).values({
    clientId: topClient.id,
    scheduledDate: cancelledDate,
    scheduledTime: SLOT_TIMES[cancelledSlot] ?? "15:00",
    slot: cancelledSlot as "3pm" | "4pm" | "5pm" | "6pm" | "7pm",
    status: "proposed",
  }).returning().get();

  await db.insert(outreach).values({
    clientId: topClient.id,
    sessionId: newSession.id,
    weekOf,
    direction: "sent",
    messageText: message,
    status: "awaiting_reply",
    sentAt: new Date().toISOString(),
  }).run();

  try {
    await sendSMS(topClient.phone, message);
  } catch (e) {
    console.error(`Auto-fill send failed for ${topClient.name}:`, e);
  }

  return { offered: true, clientName: topClient.name };
}
