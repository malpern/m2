"use server";

import { db } from "@/db";
import { prioritySettings, clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { PriorityWeights } from "@/lib/priority";

export async function getPrioritySettings(): Promise<PriorityWeights> {
  let row = db.select().from(prioritySettings).get();
  if (!row) {
    db.insert(prioritySettings).values({}).run();
    row = db.select().from(prioritySettings).get()!;
  }
  return {
    collegeBoundWeight: row.collegeBoundWeight,
    gradeLevelWeight: row.gradeLevelWeight,
    effortWeight: row.effortWeight,
  };
}

export async function savePrioritySettings(
  collegeBoundWeight: number,
  gradeLevelWeight: number,
  effortWeight: number,
) {
  const existing = db.select().from(prioritySettings).get();
  if (existing) {
    db.update(prioritySettings)
      .set({ collegeBoundWeight, gradeLevelWeight, effortWeight })
      .where(eq(prioritySettings.id, existing.id))
      .run();
  } else {
    db.insert(prioritySettings)
      .values({ collegeBoundWeight, gradeLevelWeight, effortWeight })
      .run();
  }
  revalidatePath("/schedule/priority");
  revalidatePath("/clients");
  revalidatePath("/schedule");
}

export async function saveSortOrder(clientId: number, sortOrder: number) {
  db.update(clients).set({ sortOrder }).where(eq(clients.id, clientId)).run();
  revalidatePath("/schedule/priority");
  revalidatePath("/clients");
}

export async function clearClientSortOrder(clientId: number) {
  db.update(clients).set({ sortOrder: null }).where(eq(clients.id, clientId)).run();
  revalidatePath("/schedule/priority");
  revalidatePath("/clients");
}

export async function clearAllSortOrders() {
  db.update(clients).set({ sortOrder: null }).run();
  revalidatePath("/schedule/priority");
  revalidatePath("/clients");
}
