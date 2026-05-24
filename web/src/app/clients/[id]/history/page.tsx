import { db } from "@/db";
import { clients, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionCalendar } from "../session-calendar";

export const dynamic = "force-dynamic";

export default async function SessionHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (isNaN(clientId)) notFound();

  const client = await db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!client) notFound();

  const allSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.clientId, clientId))
    .all();

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <Link
        href={`/clients/${clientId}`}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 inline-block"
      >
        &larr; Back to {client.name}
      </Link>

      <h1 className="text-2xl font-bold tracking-tight mb-1">{client.name}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {allSessions.length} sessions total
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Full Session History</CardTitle>
        </CardHeader>
        <CardContent>
          <SessionCalendar sessions={allSessions} />
        </CardContent>
      </Card>
    </div>
  );
}
