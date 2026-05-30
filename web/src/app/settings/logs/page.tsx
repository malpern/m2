import { db } from "@/db";
import { systemLogs, clients } from "@/db/schema";
import { desc } from "drizzle-orm";
import { LogViewer } from "./log-viewer";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const logs = await db
    .select({
      id: systemLogs.id,
      severity: systemLogs.severity,
      category: systemLogs.category,
      mattMessage: systemLogs.mattMessage,
      technicalMessage: systemLogs.technicalMessage,
      metadata: systemLogs.metadata,
      clientId: systemLogs.clientId,
      sessionId: systemLogs.sessionId,
      createdAt: systemLogs.createdAt,
    })
    .from(systemLogs)
    .orderBy(desc(systemLogs.id))
    .limit(200)
    .all();

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <LogViewer logs={logs} />
    </div>
  );
}
