import { db } from "@/db";
import { clients } from "@/db/schema";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { getPrioritySettings } from "./actions";
import { PriorityEditor } from "./priority-editor";

export const dynamic = "force-dynamic";

export default async function PriorityPage() {
  const weights = await getPrioritySettings();

  const activeClients = db
    .select({
      id: clients.id,
      name: clients.name,
      collegeBound: clients.collegeBound,
      gradeLevel: clients.gradeLevel,
      behaviorScore: clients.behaviorScore,
      sortOrder: clients.sortOrder,
    })
    .from(clients)
    .where(sql`${clients.category} IN ('active', 'in_season')`)
    .all();

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
      <Link
        href="/schedule"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 inline-block"
      >
        &larr; Back to Schedule
      </Link>
      <PriorityEditor initialWeights={weights} clients={activeClients} />
    </div>
  );
}
