"use server";

import { db } from "@/db";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function updateClientOrder(orderedIds: number[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    db.update(clients)
      .set({ sortOrder: i })
      .where(eq(clients.id, orderedIds[i]))
      .run();
  }
  revalidatePath("/clients");
}
