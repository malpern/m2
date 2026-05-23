"use server";

import { db } from "@/db";
import { clients, outreach, type NewClient } from "@/db/schema";
import { sendSMS } from "@/lib/twilio";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function updateClientOrder(orderedIds: number[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    await db.update(clients)
      .set({ sortOrder: i })
      .where(eq(clients.id, orderedIds[i]))
      .run();
  }
  revalidatePath("/clients");
}

type Category = "active" | "inactive" | "in_season" | "on_break" | "vacation";
type Grade = "freshman" | "sophomore" | "junior" | "senior" | "post_grad" | "adult" | null;

export async function createClient(formData: FormData) {
  const data: NewClient = {
    name: formData.get("name") as string,
    phone: formData.get("phone") as string,
    category: ((formData.get("category") as string) || "active") as Category,
    gradeLevel: ((formData.get("gradeLevel") as string) || null) as Grade,
    collegeBound: formData.get("collegeBound") === "on",
    behaviorScore: parseInt(formData.get("behaviorScore") as string) || 5,
    preferredDays: formData.get("preferredDays") as string || null,
    preferredTime: (formData.get("preferredTime") as string) || null,
    maxSessionsPerWeek: parseInt(formData.get("maxSessionsPerWeek") as string) || 1,
    standingSlot: (formData.get("standingSlot") as string) || null,
    notes: (formData.get("notes") as string) || null,
  };

  await db.insert(clients).values(data).run();
  revalidatePath("/clients");
  redirect("/clients");
}

export async function updateClient(id: number, formData: FormData) {
  await db.update(clients)
    .set({
      name: formData.get("name") as string,
      phone: formData.get("phone") as string,
      category: ((formData.get("category") as string) || "active") as Category,
      gradeLevel: ((formData.get("gradeLevel") as string) || null) as Grade,
      collegeBound: formData.get("collegeBound") === "on",
      behaviorScore: parseInt(formData.get("behaviorScore") as string) || 5,
      preferredDays: formData.get("preferredDays") as string || null,
      preferredTime: (formData.get("preferredTime") as string) || null,
      maxSessionsPerWeek: parseInt(formData.get("maxSessionsPerWeek") as string) || 1,
      standingSlot: (formData.get("standingSlot") as string) || null,
      notes: (formData.get("notes") as string) || null,
    })
    .where(eq(clients.id, id))
    .run();
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}`);
}

export async function updateClientStatus(id: number, status: string) {
  await db.update(clients)
    .set({ category: status as Category })
    .where(eq(clients.id, id))
    .run();
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
}

export async function updateClientField(id: number, field: string, value: string | number | boolean) {
  const updates: Record<string, unknown> = {};
  if (field === "collegeBound") {
    updates[field] = value;
  } else if (field === "behaviorScore" || field === "maxSessionsPerWeek") {
    updates[field] = typeof value === "number" ? value : parseInt(value as string);
  } else if (field === "category") {
    updates[field] = value as Category;
  } else if (field === "gradeLevel") {
    updates[field] = (value || null) as Grade;
  } else {
    updates[field] = value;
  }
  await db.update(clients).set(updates).where(eq(clients.id, id)).run();
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
}

export async function clearAllSortOrders() {
  await db.update(clients).set({ sortOrder: null }).run();
  revalidatePath("/clients");
}

export async function sendDirectMessage(clientId: number, message: string) {
  const today = new Date().toISOString().split("T")[0];

  await db.insert(outreach).values({
    clientId,
    weekOf: today,
    direction: "sent",
    messageText: message,
    status: "awaiting_reply",
    sentAt: new Date().toISOString(),
  }).run();

  const client = await db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (client) {
    try {
      await sendSMS(client.phone, message);
    } catch (e) {
      console.error(`Failed to send SMS to ${client.phone}:`, e);
    }
  }

  revalidatePath(`/clients/${clientId}`);
}

export async function deleteClient(id: number) {
  await db.delete(clients).where(eq(clients.id, id)).run();
  revalidatePath("/clients");
  redirect("/clients");
}
