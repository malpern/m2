"use server";

import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAutoFillCandidate, sendAutoFillOffer, type AutoFillCandidate } from "@/lib/auto-fill";
import { revalidatePath } from "next/cache";

export async function fetchAutoFillCandidate(sessionId: number): Promise<AutoFillCandidate | null> {
  const session = await db.select({
    scheduledDate: sessions.scheduledDate,
    slot: sessions.slot,
    clientId: sessions.clientId,
  }).from(sessions).where(eq(sessions.id, sessionId)).get();

  if (!session) return null;

  return getAutoFillCandidate(session.scheduledDate, session.slot, session.clientId);
}

export async function confirmAutoFillOffer(
  sessionId: number,
  candidateClientId: number,
  message: string,
): Promise<{ offered: boolean; clientName?: string }> {
  const session = await db.select({
    scheduledDate: sessions.scheduledDate,
    slot: sessions.slot,
  }).from(sessions).where(eq(sessions.id, sessionId)).get();

  if (!session) return { offered: false };

  const result = await sendAutoFillOffer(
    session.scheduledDate,
    session.slot,
    candidateClientId,
    message,
  );

  revalidatePath("/outreach");
  revalidatePath("/schedule");

  return result;
}
