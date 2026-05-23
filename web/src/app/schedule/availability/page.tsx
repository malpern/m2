import { db } from "@/db";
import { defaultAvailability, weeklyOverrides } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { getMonday } from "@/lib/scheduler";
import { Separator } from "@/components/ui/separator";
import { DefaultAvailabilityGrid, WeeklyOverrideGrid } from "./availability-grid";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  const defaults = await db.select().from(defaultAvailability).all();

  const nextMonday = getMonday();
  nextMonday.setDate(nextMonday.getDate() + 7);
  const weekOf = nextMonday.toISOString().split("T")[0];
  const weekLabel = nextMonday.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const overrides = await db
    .select()
    .from(weeklyOverrides)
    .where(eq(weeklyOverrides.weekOf, weekOf))
    .all();

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <Link
        href="/schedule"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 inline-block"
      >
        &larr; Back to Schedule
      </Link>

      <h1 className="text-2xl font-bold tracking-tight mb-8">Availability</h1>

      <DefaultAvailabilityGrid slots={defaults} />

      <Separator className="my-10" />

      <WeeklyOverrideGrid
        defaults={defaults}
        overrides={overrides}
        weekOf={weekOf}
        weekLabel={weekLabel}
      />
    </div>
  );
}
