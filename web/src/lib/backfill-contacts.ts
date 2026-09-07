/**
 * Plan a contact backfill: fill in phone numbers and emails from the Google
 * Sheet WITHOUT the destructive re-import.
 *
 * `/api/import-clients` deletes every client, session, package and outreach row
 * and rebuilds from scratch. That is the right shape for a first import and the
 * wrong shape for adding a column: backfilling ~55 phone numbers through it
 * would destroy 1,345 sessions and the whole outreach history. So this plans a
 * targeted UPDATE instead, and touches nothing else on the row.
 *
 * Kept as a pure function over plain data so the interesting parts — collisions,
 * placeholders, conflicts with a hand-corrected number — are testable without a
 * database or a network round-trip.
 */

import { toE164, normalizeEmail } from "./phone";

export type SheetContact = {
  /** Normalized full name, matching `clients.googleSheetsName`. */
  name: string;
  phone: string | null;
  email: string | null;
};

export type ExistingClient = {
  id: number;
  name: string;
  googleSheetsName: string | null;
  phone: string | null;
  email: string | null;
};

/** A row we would write. */
export type PlannedUpdate = {
  clientId: number;
  clientName: string;
  phone?: string;
  email?: string;
};

/** A row we would NOT write, and why. The reason is the point. */
export type SkippedRow = {
  clientName: string;
  field: "phone" | "email";
  reason: string;
};

export type BackfillPlan = {
  updates: PlannedUpdate[];
  skipped: SkippedRow[];
  /** Clients in the sheet with no matching row in the database. */
  unmatched: string[];
  counts: {
    clientsInDb: number;
    contactsInSheet: number;
    phonesToWrite: number;
    emailsToWrite: number;
    skipped: number;
    unmatched: number;
  };
};

/**
 * The placeholder minted by an older import (#221/#17). It is indistinguishable
 * from a real number to every caller, which is precisely why it is treated as
 * ABSENT here — a client carrying it is eligible for a real number, not
 * protected from one.
 */
const PLACEHOLDER_PHONE = "+15550000000";

function hasRealPhone(phone: string | null): boolean {
  return !!phone && phone !== PLACEHOLDER_PHONE;
}

function matchKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Build the plan.
 *
 * Two rules carry the safety of this operation:
 *
 * 1. **Never overwrite an existing real value.** Micah's number was corrected by
 *    hand; the sheet may be COVID-era stale (#17). A differing sheet value is
 *    REPORTED as a conflict, never written. Filling a blank is additive and
 *    reversible; overwriting is neither.
 * 2. **Never write a number that would collide.** `clients.phone` is UNIQUE, so
 *    a duplicate aborts the whole transaction. Families sharing one number is
 *    the expected case here, not an edge case — the sheet has a
 *    `parentGuardian` column. Both sides of a collision are dropped and
 *    reported, so the operator resolves it rather than the database picking an
 *    arbitrary winner.
 */
export function planBackfill(
  sheet: SheetContact[],
  existing: ExistingClient[],
): BackfillPlan {
  const byName = new Map<string, ExistingClient>();
  for (const c of existing) {
    if (c.googleSheetsName) byName.set(matchKey(c.googleSheetsName), c);
    // Fall back to the display name so a client whose googleSheetsName was
    // never set is still reachable. Set only if absent, so googleSheetsName
    // wins where both exist.
    const k = matchKey(c.name);
    if (!byName.has(k)) byName.set(k, c);
  }

  // Numbers already spoken for in the database. A sheet value landing on one of
  // these would violate the unique index.
  const takenPhones = new Set(
    existing.filter((c) => hasRealPhone(c.phone)).map((c) => c.phone as string),
  );

  const updates: PlannedUpdate[] = [];
  const skipped: SkippedRow[] = [];
  const unmatched: string[] = [];

  // First pass: resolve each sheet row to a parsed phone, so duplicates WITHIN
  // the sheet can be detected before anything is planned. Doing this in the
  // same pass as the writes would let the first of a duplicate pair through.
  const parsedPhones = new Map<string, string[]>(); // e164 -> client names
  const rowPhone = new Map<string, string>(); // sheet name -> e164

  for (const row of sheet) {
    const parsed = toE164(row.phone);
    if (!parsed.ok) continue;
    rowPhone.set(row.name, parsed.e164);
    const names = parsedPhones.get(parsed.e164) ?? [];
    names.push(row.name);
    parsedPhones.set(parsed.e164, names);
  }

  for (const row of sheet) {
    const client = byName.get(matchKey(row.name));
    if (!client) {
      unmatched.push(row.name);
      continue;
    }

    const update: PlannedUpdate = { clientId: client.id, clientName: client.name };

    // --- phone ---
    const parsed = toE164(row.phone);
    if (!parsed.ok) {
      // "empty" is the normal case for a client we simply have no number for.
      // Reporting it as a skip would bury the real problems in noise.
      if (parsed.reason !== "empty") {
        skipped.push({ clientName: row.name, field: "phone", reason: parsed.reason });
      }
    } else if (hasRealPhone(client.phone)) {
      if (client.phone !== parsed.e164) {
        skipped.push({
          clientName: row.name,
          field: "phone",
          reason: "already has a different number on file — not overwritten",
        });
      }
    } else if ((parsedPhones.get(parsed.e164) ?? []).length > 1) {
      skipped.push({
        clientName: row.name,
        field: "phone",
        reason: `number is shared with ${(parsedPhones.get(parsed.e164) ?? [])
          .filter((n) => n !== row.name)
          .join(", ")} in the sheet — phone is UNIQUE, resolve by hand`,
      });
    } else if (takenPhones.has(parsed.e164)) {
      skipped.push({
        clientName: row.name,
        field: "phone",
        reason: "number already belongs to another client in the database",
      });
    } else {
      update.phone = parsed.e164;
    }

    // --- email ---
    const email = normalizeEmail(row.email);
    if (row.email && !email) {
      skipped.push({ clientName: row.name, field: "email", reason: "not a usable address" });
    } else if (email && !client.email) {
      update.email = email;
    } else if (email && client.email && client.email.toLowerCase() !== email) {
      skipped.push({
        clientName: row.name,
        field: "email",
        reason: "already has a different address on file — not overwritten",
      });
    }

    if (update.phone || update.email) updates.push(update);
  }

  return {
    updates,
    skipped,
    unmatched,
    counts: {
      clientsInDb: existing.length,
      contactsInSheet: sheet.length,
      phonesToWrite: updates.filter((u) => u.phone).length,
      emailsToWrite: updates.filter((u) => u.email).length,
      skipped: skipped.length,
      unmatched: unmatched.length,
    },
  };
}
