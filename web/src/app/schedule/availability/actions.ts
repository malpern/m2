"use server";

import { db } from "@/db";
import { defaultAvailability, weeklyOverrides } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
