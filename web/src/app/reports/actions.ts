"use server";

import { db } from "@/db";
import { clients, sessions, packages } from "@/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export async function exportSessionsCSV(startDate: string, endDate: string): Promise<string> {
  const rows = await db
    .select({
      clientName: clients.name,
      date: sessions.scheduledDate,
      time: sessions.scheduledTime,
      slot: sessions.slot,
      status: sessions.status,
      reconciled: sessions.reconciled,
    })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(and(gte(sessions.scheduledDate, startDate), lte(sessions.scheduledDate, endDate)))
    .orderBy(sessions.scheduledDate, sessions.scheduledTime)
    .all();

  const header = "Client,Date,Time,Slot,Status,Reconciled";
  const lines = rows.map((r) =>
    `"${r.clientName}",${r.date},${r.time},${r.slot},${r.status},${r.reconciled ? "Yes" : "No"}`
  );

  return [header, ...lines].join("\n");
}

export async function exportClientsCSV(): Promise<string> {
  const rows = await db
    .select({
      name: clients.name,
      phone: clients.phone,
      category: clients.category,
      gradeLevel: clients.gradeLevel,
      collegeBound: clients.collegeBound,
      behaviorScore: clients.behaviorScore,
      preferredTime: clients.preferredTime,
      standingSlot: clients.standingSlot,
      maxSessionsPerWeek: clients.maxSessionsPerWeek,
      remaining: sql<number>`${packages.totalSessions} - ${packages.sessionsUsed}`,
    })
    .from(clients)
    .leftJoin(packages, and(eq(packages.clientId, clients.id), eq(packages.status, "active")))
    .orderBy(clients.name)
    .all();

  const header = "Name,Phone,Status,Grade,College Bound,Effort,Preferred Time,Standing Slot,Max/Week,Sessions Remaining";
  const lines = rows.map((r) =>
    `"${r.name}","${r.phone}",${r.category},${r.gradeLevel ?? ""},${r.collegeBound ? "Yes" : "No"},${r.behaviorScore},"${r.preferredTime ?? ""}","${r.standingSlot ?? ""}",${r.maxSessionsPerWeek},${r.remaining ?? ""}`
  );

  return [header, ...lines].join("\n");
}
