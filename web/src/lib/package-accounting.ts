import { db } from "@/db";
import { packages, packageTransactions, sessions, clients } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { syslog } from "./logger";

export async function deductSession(sessionId: number): Promise<boolean> {
  const session = await db.select({
    id: sessions.id,
    clientId: sessions.clientId,
    packageId: sessions.packageId,
    clientName: clients.name,
  })
  .from(sessions)
  .innerJoin(clients, eq(clients.id, sessions.clientId))
  .where(eq(sessions.id, sessionId))
  .get();

  if (!session) return false;

  const pkg = session.packageId
    ? await db.select().from(packages).where(eq(packages.id, session.packageId)).get()
    : await db.select().from(packages).where(and(eq(packages.clientId, session.clientId), eq(packages.status, "active"))).get();

  if (!pkg) {
    syslog.warn("system", `${session.clientName} completed a session but has no active package`, `No package found for client ${session.clientId}, session ${sessionId}`, { clientId: session.clientId, sessionId });
    return false;
  }

  const existing = await db.select({ id: packageTransactions.id })
    .from(packageTransactions)
    .where(and(eq(packageTransactions.sessionId, sessionId), eq(packageTransactions.reason, "completed")))
    .get();

  if (existing) return false;

  const previousBalance = pkg.totalSessions - pkg.sessionsUsed;
  const newUsed = pkg.sessionsUsed + 1;
  const newBalance = pkg.totalSessions - newUsed;

  await db.insert(packageTransactions).values({
    packageId: pkg.id,
    sessionId,
    delta: -1,
    reason: "completed",
    previousBalance,
    newBalance,
  }).run();

  await db.update(packages).set({
    sessionsUsed: newUsed,
    status: newBalance <= 0 ? "exhausted" : "active",
  }).where(eq(packages.id, pkg.id)).run();

  syslog.info("system", `${session.clientName}: session completed (${newBalance} remaining)`, `Package ${pkg.id}: ${previousBalance} → ${newBalance} (session ${sessionId})`, { clientId: session.clientId, sessionId });

  if (newBalance <= 2 && newBalance > 0) {
    syslog.warn("system", `${session.clientName} is running low — ${newBalance} session${newBalance === 1 ? "" : "s"} left`, `Package ${pkg.id} low balance: ${newBalance}`, { clientId: session.clientId });
  }

  if (newBalance <= 0) {
    syslog.warn("system", `${session.clientName}'s package is used up — needs renewal`, `Package ${pkg.id} exhausted`, { clientId: session.clientId });
  }

  return true;
}

export async function creditCancellation(sessionId: number): Promise<boolean> {
  const session = await db.select({
    id: sessions.id,
    clientId: sessions.clientId,
    clientName: clients.name,
  })
  .from(sessions)
  .innerJoin(clients, eq(clients.id, sessions.clientId))
  .where(eq(sessions.id, sessionId))
  .get();

  if (!session) return false;

  const deduction = await db.select({
    id: packageTransactions.id,
    packageId: packageTransactions.packageId,
  })
  .from(packageTransactions)
  .where(and(eq(packageTransactions.sessionId, sessionId), eq(packageTransactions.reason, "completed")))
  .get();

  if (!deduction) return false;

  const alreadyCredited = await db.select({ id: packageTransactions.id })
    .from(packageTransactions)
    .where(and(eq(packageTransactions.sessionId, sessionId), eq(packageTransactions.reason, "cancelled")))
    .get();

  if (alreadyCredited) return false;

  const pkg = await db.select().from(packages).where(eq(packages.id, deduction.packageId)).get();
  if (!pkg) return false;

  const previousBalance = pkg.totalSessions - pkg.sessionsUsed;
  const newUsed = Math.max(0, pkg.sessionsUsed - 1);
  const newBalance = pkg.totalSessions - newUsed;

  await db.insert(packageTransactions).values({
    packageId: pkg.id,
    sessionId,
    delta: 1,
    reason: "cancelled",
    previousBalance,
    newBalance,
  }).run();

  await db.update(packages).set({
    sessionsUsed: newUsed,
    status: newBalance > 0 ? "active" : "exhausted",
  }).where(eq(packages.id, pkg.id)).run();

  syslog.info("system", `${session.clientName}: cancelled session credited back (${newBalance} remaining)`, `Package ${pkg.id}: ${previousBalance} → ${newBalance} (session ${sessionId} cancelled)`, { clientId: session.clientId, sessionId });

  return true;
}

export async function manualAdjustment(
  clientId: number,
  delta: number,
  reason: string
): Promise<boolean> {
  const pkg = await db
    .select()
    .from(packages)
    .where(and(eq(packages.clientId, clientId), eq(packages.status, "active")))
    .get();

  if (!pkg) {
    syslog.warn("system", `Manual adjustment failed — no active package for client ${clientId}`, `No active package found for client ${clientId}`, { clientId });
    return false;
  }

  const previousBalance = pkg.totalSessions - pkg.sessionsUsed;
  const newUsed = Math.max(0, pkg.sessionsUsed - delta);
  const newBalance = pkg.totalSessions - newUsed;

  await db.insert(packageTransactions).values({
    packageId: pkg.id,
    delta,
    reason: "manual_adjustment",
    previousBalance,
    newBalance,
    note: reason,
  }).run();

  await db.update(packages).set({
    sessionsUsed: newUsed,
    status: newBalance <= 0 ? "exhausted" : "active",
  }).where(eq(packages.id, pkg.id)).run();

  syslog.info("system", `Manual adjustment for client ${clientId}: ${delta > 0 ? "+" : ""}${delta} (${reason})`, `Package ${pkg.id}: ${previousBalance} → ${newBalance}`, { clientId });

  return true;
}

export async function getPackageBalance(clientId: number): Promise<{ remaining: number; total: number; used: number } | null> {
  const pkg = await db.select().from(packages).where(and(eq(packages.clientId, clientId), eq(packages.status, "active"))).get();
  if (!pkg) return null;
  return {
    remaining: pkg.totalSessions - pkg.sessionsUsed,
    total: pkg.totalSessions,
    used: pkg.sessionsUsed,
  };
}

export async function getTransactionHistory(clientId: number, limit = 10) {
  const pkg = await db
    .select()
    .from(packages)
    .where(eq(packages.clientId, clientId))
    .all();

  if (pkg.length === 0) return [];

  const packageIds = pkg.map((p) => p.id);

  const transactions = await db
    .select({
      id: packageTransactions.id,
      delta: packageTransactions.delta,
      reason: packageTransactions.reason,
      note: packageTransactions.note,
      previousBalance: packageTransactions.previousBalance,
      newBalance: packageTransactions.newBalance,
      createdAt: packageTransactions.createdAt,
    })
    .from(packageTransactions)
    .where(inArray(packageTransactions.packageId, packageIds))
    .orderBy(desc(packageTransactions.id))
    .limit(limit)
    .all();

  return transactions;
}
