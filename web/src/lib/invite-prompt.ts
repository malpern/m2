import { db } from "@/db";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getInvitePrompt(clientId: number): Promise<string | null> {
  const client = await db.select({
    email: clients.email,
    calendarInviteOptIn: clients.calendarInviteOptIn,
  }).from(clients).where(eq(clients.id, clientId)).get();

  if (!client) return null;

  if (client.calendarInviteOptIn === false) return null;

  if (client.calendarInviteOptIn === true && client.email) return null;

  if (client.email) {
    return `\n\nWant me to send calendar invites to ${client.email} going forward?`;
  }

  return "\n\nWant me to send you calendar invites for future sessions? If so, what's your email?";
}
