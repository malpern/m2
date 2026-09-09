"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  sendVerification, markOptedOut, linkSignupToClient, createClientFromSignup,
} from "@/lib/consent";

/**
 * Everything Matt can do to a client's texting consent. Note what is absent:
 * there is no action that sets `confirmed`. Only the client's phone does that.
 */

export async function resendVerification(clientId: number): Promise<{ ok: boolean; message: string }> {
  const client = await db.select({ phone: clients.phone }).from(clients).where(eq(clients.id, clientId)).get();
  if (!client?.phone) return { ok: false, message: "This client has no phone number on file." };
  const r = await sendVerification(client.phone);
  revalidatePath(`/clients/${clientId}`);
  if (r.status === "sent") return { ok: true, message: "Verification text sent." };
  return { ok: false, message: `Not sent: ${r.reason}.` };
}

export async function markClientOptedOut(clientId: number, note: string): Promise<void> {
  await markOptedOut(clientId, note);
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
}

export async function linkSignup(phone: string, clientId: number): Promise<void> {
  // The client row takes the number if it had none; if it had a different one,
  // that is a phone change and consent for the old number is void.
  const client = await db.select({ phone: clients.phone }).from(clients).where(eq(clients.id, clientId)).get();
  if (!client) throw new Error(`No client ${clientId}`);
  if (client.phone !== phone) {
    const { resetForPhoneChange } = await import("@/lib/consent");
    await db.update(clients).set({ phone }).where(eq(clients.id, clientId)).run();
    await resetForPhoneChange(clientId, client.phone, phone);
  } else {
    await linkSignupToClient(phone, clientId);
  }
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
}

export async function createClientFromSignupAction(phone: string): Promise<void> {
  const { clientId } = await createClientFromSignup(phone);
  revalidatePath("/clients");
  redirect(`/clients/${clientId}`);
}
