/**
 * Backfill client phone numbers and emails from the Google Sheet.
 *
 * GET  — preview. Reads the sheet, plans the writes, changes nothing.
 * POST — apply. Requires `{ confirm: true }`.
 *
 * This exists because `/api/import-clients` is the wrong tool for the job: it
 * deletes every client, session, package and outreach row and rebuilds. Using it
 * to add a phone column would destroy the session history. This only ever issues
 * UPDATEs against `phone` and `email`, one client at a time, and never deletes.
 *
 * Safety note for anyone reading this before running it: populating real numbers
 * does NOT make anyone reachable. Every outbound path asks `canContact()`
 * (src/lib/outreach-policy.ts), which allows a recipient only when outreach is
 * live — NODE_ENV=production AND OUTREACH_LIVE=true, and OUTREACH_LIVE is not
 * set — or when the address is on the test allowlist. Data does not open that
 * gate; only the env var does.
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { readSheet } from "@/lib/google-sheets";
import { planBackfill, type SheetContact, type ExistingClient } from "@/lib/backfill-contacts";

const SPREADSHEET_ID =
  process.env.GOOGLE_SPREADSHEET_ID ?? "109w4fOCcwmudr5Os2Rk20mdcxbVhGZB6BNMaM8q0GCo";
const CLIENT_INFO_TAB = "Client Information";

/** Column positions in the Client Information tab, mirroring /api/import-clients. */
const COL = { first: 0, last: 1, phone: 4, email: 5 } as const;

function normalizeName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

async function readSheetContacts(): Promise<SheetContact[]> {
  const rows = await readSheet(SPREADSHEET_ID, `'${CLIENT_INFO_TAB}'`);
  const out: SheetContact[] = [];
  for (const row of rows.slice(1)) {
    const first = row[COL.first]?.trim();
    if (!first) continue;
    const last = row[COL.last]?.trim();
    out.push({
      name: normalizeName(`${first} ${last || ""}`),
      phone: row[COL.phone]?.trim() || null,
      email: row[COL.email]?.trim() || null,
    });
  }
  return out;
}

async function loadExisting(): Promise<ExistingClient[]> {
  return db
    .select({
      id: clients.id,
      name: clients.name,
      googleSheetsName: clients.googleSheetsName,
      phone: clients.phone,
      email: clients.email,
    })
    .from(clients)
    .all();
}

export async function GET() {
  try {
    const [sheet, existing] = await Promise.all([readSheetContacts(), loadExisting()]);
    const plan = planBackfill(sheet, existing);
    return NextResponse.json({ preview: true, ...plan });
  } catch (e) {
    console.error("Backfill preview failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { confirm } = body as { confirm?: boolean };

    const [sheet, existing] = await Promise.all([readSheetContacts(), loadExisting()]);
    const plan = planBackfill(sheet, existing);

    // Re-planned server-side rather than trusting a plan posted by the client:
    // a stale preview would write numbers computed against a database that has
    // since changed, and the UNIQUE constraint makes that a hard failure rather
    // than a benign one.
    if (!confirm) {
      return NextResponse.json(
        { error: "confirmation_required", ...plan },
        { status: 409 },
      );
    }

    // Applied one UPDATE per client rather than in a single transaction, so a
    // collision that slipped past the planner costs one row instead of the whole
    // run. Each failure is reported with its client, which is what makes the
    // partial outcome actionable rather than mysterious.
    const applied: string[] = [];
    const failed: { clientName: string; error: string }[] = [];

    for (const u of plan.updates) {
      const patch: { phone?: string; email?: string } = {};
      if (u.phone) patch.phone = u.phone;
      if (u.email) patch.email = u.email;
      try {
        await db.update(clients).set(patch).where(eq(clients.id, u.clientId)).run();
        applied.push(u.clientName);
      } catch (e) {
        failed.push({
          clientName: u.clientName,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json({
      applied: applied.length,
      failed,
      skipped: plan.skipped,
      unmatched: plan.unmatched,
      counts: plan.counts,
    });
  } catch (e) {
    console.error("Backfill failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
