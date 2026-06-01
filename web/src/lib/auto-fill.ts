import { db } from "@/db";
import { clients, sessions, outreach } from "@/db/schema";
import { eq, and, gte, lte, ne } from "drizzle-orm";
import { sortByPriority, isSchedulable } from "./priority";
import { sendSMS, isDevAllowed } from "./twilio";
import { syslog } from "./logger";
import { getMonday } from "./scheduler";

export const SLOT_TIMES: Record<string, string> = {
  "3pm": "15:00", "4pm": "16:00", "5pm": "17:00", "6pm": "18:00", "7pm": "19:00",
};

export function buildAutoFillMessage(clientName: string, cancelledDate: string, cancelledSlot: string): string {
  const dayLabel = new Date(cancelledDate + "T12:00:00Z")
    .toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });
  const firstName = clientName.split(" ")[0];
  return `Hey ${firstName}, a ${dayLabel} at ${cancelledSlot} slot just opened up — want it?`;
}

export type AutoFillCandidate = {
  clientId: number;
  clientName: string;
  phone: string;
  draftMessage: string;
};

export async function getAutoFillCandidate(
  cancelledDate: string,
  cancelledSlot: string,
  cancelledClientId: number,
): Promise<AutoFillCandidate | null> {
  const monday = getMonday().toISOString().split("T")[0];
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

  if (eligible.length === 0) return null;

  const sorted = sortByPriority(eligible);
  const topClient = sorted[0];

  if (!isDevAllowed(topClient.phone)) return null;

  return {
    clientId: topClient.id,
    clientName: topClient.name,
    phone: topClient.phone,
    draftMessage: buildAutoFillMessage(topClient.name, cancelledDate, cancelledSlot),
  };
}

export async function sendAutoFillOffer(
  cancelledDate: string,
  cancelledSlot: string,
  candidateClientId: number,
  message: string,
): Promise<{ offered: boolean; clientName?: string }> {
  const client = await db.select().from(clients).where(eq(clients.id, candidateClientId)).get();
  if (!client) return { offered: false };

  const weekOf = getMonday().toISOString().split("T")[0];

  const newSession = await db.insert(sessions).values({
    clientId: client.id,
    scheduledDate: cancelledDate,
    scheduledTime: SLOT_TIMES[cancelledSlot] ?? "15:00",
    slot: cancelledSlot as "3pm" | "4pm" | "5pm" | "6pm" | "7pm",
    status: "proposed",
  }).returning().get();

  await db.insert(outreach).values({
    clientId: client.id,
    sessionId: newSession.id,
    weekOf,
    direction: "sent",
    messageText: message,
    status: "awaiting_reply",
    sentAt: new Date().toISOString(),
  }).run();

  const dayLabel = new Date(cancelledDate + "T12:00:00Z")
    .toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Los_Angeles" });

  try {
    await sendSMS(client.phone, message);
    syslog.info("auto_fill", `Offered open ${dayLabel} ${cancelledSlot} slot to ${client.name}`, `Auto-fill: offered ${cancelledDate} ${cancelledSlot} to client ${client.id} (${client.name})`, { clientId: client.id, sessionId: newSession.id });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    syslog.error("auto_fill", `Couldn't send auto-fill offer to ${client.name}`, `Auto-fill SMS failed for ${client.name}: ${errorMsg}`, { clientId: client.id });
  }

  return { offered: true, clientName: client.name };
}

export async function autoFillCancelledSlot(
  cancelledDate: string,
  cancelledSlot: string,
  cancelledClientId: number,
): Promise<{ offered: boolean; clientName?: string; skipped?: string }> {
  const candidate = await getAutoFillCandidate(cancelledDate, cancelledSlot, cancelledClientId);

  if (!candidate) {
    syslog.info("auto_fill", `No one to offer the open ${cancelledSlot} slot on ${cancelledDate}`, `Auto-fill: no eligible clients for ${cancelledDate} ${cancelledSlot}`);
    return { offered: false };
  }

  return sendAutoFillOffer(cancelledDate, cancelledSlot, candidate.clientId, candidate.draftMessage);
}
