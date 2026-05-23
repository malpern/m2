import { db } from "@/db";
import { outreach, clients } from "@/db/schema";
import { desc } from "drizzle-orm";
import { MessagesView } from "./messages-view";

export const dynamic = "force-dynamic";

export default function MessagesPage() {
  const allMessages = db
    .select({
      id: outreach.id,
      clientId: outreach.clientId,
      direction: outreach.direction,
      messageText: outreach.messageText,
      interpretation: outreach.interpretation,
      status: outreach.status,
      sentAt: outreach.sentAt,
      repliedAt: outreach.repliedAt,
    })
    .from(outreach)
    .orderBy(desc(outreach.sentAt))
    .all();

  const allClients = db.select().from(clients).all();
  const clientMap = Object.fromEntries(allClients.map((c) => [c.id, c.name]));

  const messagesWithClient = allMessages.map((msg) => ({
    ...msg,
    clientName: clientMap[msg.clientId] ?? "Unknown",
  }));

  return <MessagesView messages={messagesWithClient} />;
}
