"use server";

import { db } from "@/db";
import { clients, defaultAvailability, weeklyOverrides } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendSMS, isDevAllowed } from "@/lib/twilio";
import { syslog } from "@/lib/logger";

type Day = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "sunday";

export async function toggleDefaultSlot(id: number, enabled: boolean) {
  await db.update(defaultAvailability)
    .set({ enabled })
    .where(eq(defaultAvailability.id, id))
    .run();
  revalidatePath("/schedule/availability");
}

export async function addDefaultSlot(day: string, slot: string) {
  await db.insert(defaultAvailability).values({ day: day as Day, slot, enabled: true }).run();
  revalidatePath("/schedule/availability");
}

export async function removeDefaultSlot(id: number) {
  await db.delete(defaultAvailability).where(eq(defaultAvailability.id, id)).run();
  revalidatePath("/schedule/availability");
}

export async function setWeeklyOverride(
  weekOf: string,
  day: string,
  slot: string,
  enabled: boolean,
  note?: string,
) {
  const existing = await db
    .select()
    .from(weeklyOverrides)
    .where(
      and(
        eq(weeklyOverrides.weekOf, weekOf),
        eq(weeklyOverrides.day, day as Day),
        eq(weeklyOverrides.slot, slot),
      )
    )
    .get();

  if (existing) {
    await db.update(weeklyOverrides)
      .set({ enabled, note: note ?? existing.note })
      .where(eq(weeklyOverrides.id, existing.id))
      .run();
  } else {
    await db.insert(weeklyOverrides)
      .values({ weekOf, day: day as Day, slot, enabled, note: note ?? null })
      .run();
  }
  revalidatePath("/schedule/availability");
  revalidatePath("/schedule");
}

export async function clearWeeklyOverrides(weekOf: string) {
  await db.delete(weeklyOverrides).where(eq(weeklyOverrides.weekOf, weekOf)).run();
  revalidatePath("/schedule/availability");
}

export async function sendVacationNotice(weekOf: string, weekLabel: string): Promise<{ sent: number; skipped: number }> {
  const activeClients = await db
    .select({ id: clients.id, name: clients.name, phone: clients.phone })
    .from(clients)
    .where(sql`${clients.category} IN ('active', 'in_season')`)
    .all();

  let sent = 0;
  let skipped = 0;

  for (const client of activeClients) {
    if (!isDevAllowed(client.phone)) {
      skipped++;
      continue;
    }

    const firstName = client.name.split(" ")[0];
    const message = `Hey ${firstName}, heads up — no sessions the week of ${weekLabel}. Matt will be out. Back to normal the following week!`;

    try {
      await sendSMS(client.phone, message);
      sent++;
    } catch (e) {
      syslog.error("outreach", `Failed to send vacation notice to ${client.name}`, `SMS error: ${e instanceof Error ? e.message : String(e)}`, { clientId: client.id });
      skipped++;
    }
  }

  syslog.info("outreach", `Vacation notice sent for week of ${weekLabel}`, `Sent to ${sent} clients, skipped ${skipped}`, {});
  return { sent, skipped };
}
