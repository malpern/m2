"use server";

import { db } from "@/db";
import { sessionAttendees } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * Record that a client attended a semi-group session (#13).
 *
 * Idempotent: the unique index on (session_id, client_id) means adding the same
 * person twice is a no-op rather than an error the operator has to understand.
 */
export async function addAttendee(sessionId: number, clientId: number) {
  const existing = await db
    .select({ id: sessionAttendees.id })
    .from(sessionAttendees)
    .where(and(eq(sessionAttendees.sessionId, sessionId), eq(sessionAttendees.clientId, clientId)))
    .get();

  if (!existing) {
    await db.insert(sessionAttendees).values({ sessionId, clientId }).run();
  }
  revalidatePath("/schedule/groups");
}

export async function removeAttendee(sessionId: number, clientId: number) {
  await db
    .delete(sessionAttendees)
    .where(and(eq(sessionAttendees.sessionId, sessionId), eq(sessionAttendees.clientId, clientId)))
    .run();
  revalidatePath("/schedule/groups");
}
