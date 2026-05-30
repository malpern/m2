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
    return `\n\nWant me to send a calendar invite to ${client.email}?`;
  }

  return "\n\nWould you like a calendar invite sent to your email?";
}
