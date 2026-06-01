"use server";

import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAutoFillCandidates, sendAutoFillOffer, buildAutoFillMessage } from "@/lib/auto-fill";
import { getPackageBalance } from "@/lib/package-accounting";
import { revalidatePath } from "next/cache";

export type AutoFillCandidateWithBalance = {
  clientId: number;
  clientName: string;
  draftMessage: string;
  packageBalance: { remaining: number; total: number } | null;
};

export async function fetchAutoFillCandidates(sessionId: number): Promise<AutoFillCandidateWithBalance[]> {
  const session = await db.select({
    scheduledDate: sessions.scheduledDate,
    slot: sessions.slot,
    clientId: sessions.clientId,
  }).from(sessions).where(eq(sessions.id, sessionId)).get();

  if (!session) return [];

  const candidates = await getAutoFillCandidates(session.scheduledDate, session.slot, session.clientId);

  const withBalances = await Promise.all(
    candidates.map(async (c) => {
      const balance = await getPackageBalance(c.clientId);
      return {
        clientId: c.clientId,
        clientName: c.clientName,
        draftMessage: c.draftMessage,
        packageBalance: balance ? { remaining: balance.remaining, total: balance.total } : null,
      };
    })
  );

  return withBalances;
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
