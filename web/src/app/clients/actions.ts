"use server";

import { db } from "@/db";
import { clients, packages, sessions, outreach, type NewClient } from "@/db/schema";
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
    sessionRate: formData.get("sessionRate") ? Math.round(parseFloat(formData.get("sessionRate") as string) * 100) : null,
    sessionType: ((formData.get("sessionType") as string) || null) as "individual" | "dual" | "group" | null,
    parentGuardian: (formData.get("parentGuardian") as string) || null,
    email: (formData.get("email") as string) || null,
    calendarInviteOptIn: formData.get("calendarInviteOptIn") === "opted_in" ? true : formData.get("calendarInviteOptIn") === "opted_out" ? false : null,
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
      sessionRate: formData.get("sessionRate") ? Math.round(parseFloat(formData.get("sessionRate") as string) * 100) : null,
      sessionType: ((formData.get("sessionType") as string) || null) as "individual" | "dual" | "group" | null,
      parentGuardian: (formData.get("parentGuardian") as string) || null,
      email: (formData.get("email") as string) || null,
      calendarInviteOptIn: formData.get("calendarInviteOptIn") === "opted_in" ? true : formData.get("calendarInviteOptIn") === "opted_out" ? false : null,
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

const ALLOWED_FIELDS = new Set([
  "name", "phone", "category", "gradeLevel", "collegeBound",
  "behaviorScore", "preferredDays", "preferredTime", "maxSessionsPerWeek",
  "standingSlot", "notes", "sessionRate", "sessionType", "parentGuardian", "email",
  "calendarInviteOptIn",
]);

export async function updateClientField(id: number, field: string, value: string | number | boolean) {
  if (!ALLOWED_FIELDS.has(field)) {
    throw new Error(`Field "${field}" is not editable`);
  }

  const updates: Record<string, unknown> = {};
  if (field === "calendarInviteOptIn") {
    if (value === "not_asked") {
      updates[field] = null;
    } else {
      updates[field] = value === "opted_in";
    }
  } else if (field === "collegeBound") {
    updates[field] = value;
  } else if (field === "sessionRate") {
    updates[field] = typeof value === "number" ? value : parseInt(value as string) || null;
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

export async function adjustPackage(clientId: number, delta: number, reason: string) {
  const { manualAdjustment } = await import("@/lib/package-accounting");
  const success = await manualAdjustment(clientId, delta, reason);
  if (!success) {
    throw new Error("No active package found for this client");
  }
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteClient(id: number) {
  await db.delete(outreach).where(eq(outreach.clientId, id)).run();
  await db.delete(sessions).where(eq(sessions.clientId, id)).run();
  await db.delete(packages).where(eq(packages.clientId, id)).run();
  await db.delete(clients).where(eq(clients.id, id)).run();
  revalidatePath("/clients");
  redirect("/clients");
}
