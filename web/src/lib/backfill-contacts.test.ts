import { describe, it, expect } from "vitest";
import { planBackfill, type ExistingClient, type SheetContact } from "./backfill-contacts";

const client = (o: Partial<ExistingClient> & { id: number; name: string }): ExistingClient => ({
  googleSheetsName: o.name,
  phone: null,
  email: null,
  ...o,
});

describe("planBackfill", () => {
  it("fills a blank phone and email", () => {
    const plan = planBackfill(
      [{ name: "Jane Doe", phone: "(408) 209-1111", email: "Jane@Example.com" }],
      [client({ id: 1, name: "Jane Doe" })],
    );
    expect(plan.updates).toEqual([
      { clientId: 1, clientName: "Jane Doe", phone: "+14082091111", email: "jane@example.com" },
    ]);
    expect(plan.counts.phonesToWrite).toBe(1);
    expect(plan.counts.emailsToWrite).toBe(1);
  });

  it("treats the +15550000000 placeholder as absent, so it gets a real number", () => {
    const plan = planBackfill(
      [{ name: "Jane Doe", phone: "408-209-1111", email: null }],
      [client({ id: 1, name: "Jane Doe", phone: "+15550000000" })],
    );
    expect(plan.updates[0].phone).toBe("+14082091111");
  });

  it("NEVER overwrites a real number that differs — it reports it", () => {
    // Micah's number was corrected by hand; the sheet may be years stale (#17).
    const plan = planBackfill(
      [{ name: "Micah Alpern", phone: "408-555-0199", email: null }],
      [client({ id: 1, name: "Micah Alpern", phone: "+14082099509" })],
    );
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toContainEqual({
      clientName: "Micah Alpern",
      field: "phone",
      reason: "already has a different number on file — not overwritten",
    });
  });

  it("is silent when the sheet agrees with what we already have", () => {
    const plan = planBackfill(
      [{ name: "Micah Alpern", phone: "(408) 209-9509", email: null }],
      [client({ id: 1, name: "Micah Alpern", phone: "+14082099509" })],
    );
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });

  it("drops BOTH sides of a shared family number rather than picking a winner", () => {
    // phone is UNIQUE — writing both aborts the transaction, and writing one
    // arbitrarily gives a sibling their brother's number.
    const sheet: SheetContact[] = [
      { name: "Kid One", phone: "408-209-2222", email: null },
      { name: "Kid Two", phone: "(408) 209-2222", email: null },
    ];
    const plan = planBackfill(sheet, [
      client({ id: 1, name: "Kid One" }),
      client({ id: 2, name: "Kid Two" }),
    ]);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toHaveLength(2);
    expect(plan.skipped[0].reason).toContain("shared with Kid Two");
    expect(plan.skipped[1].reason).toContain("shared with Kid One");
  });

  it("refuses a number already held by another client in the database", () => {
    const plan = planBackfill(
      [{ name: "Jane Doe", phone: "408-209-9509", email: null }],
      [
        client({ id: 1, name: "Jane Doe" }),
        client({ id: 2, name: "Micah Alpern", phone: "+14082099509" }),
      ],
    );
    expect(plan.updates).toEqual([]);
    expect(plan.skipped[0].reason).toContain("already belongs to another client");
  });

  it("reports malformed numbers but stays quiet about simply-absent ones", () => {
    const plan = planBackfill(
      [
        { name: "Has Junk", phone: "call the house", email: null },
        { name: "Has Nothing", phone: "", email: null },
      ],
      [client({ id: 1, name: "Has Junk" }), client({ id: 2, name: "Has Nothing" })],
    );
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].clientName).toBe("Has Junk");
  });

  it("matches on googleSheetsName ahead of display name", () => {
    const plan = planBackfill(
      [{ name: "Jonathan Doe", phone: "408-209-3333", email: null }],
      [client({ id: 7, name: "Jon Doe", googleSheetsName: "Jonathan Doe" })],
    );
    expect(plan.updates[0]).toMatchObject({ clientId: 7, phone: "+14082093333" });
  });

  it("matches case- and whitespace-insensitively", () => {
    const plan = planBackfill(
      [{ name: "  jane   doe ", phone: "408-209-4444", email: null }],
      [client({ id: 1, name: "Jane Doe" })],
    );
    expect(plan.updates[0].clientId).toBe(1);
  });

  it("lists sheet rows with no client, instead of silently discarding them", () => {
    const plan = planBackfill(
      [{ name: "Former Client", phone: "408-209-5555", email: null }],
      [client({ id: 1, name: "Jane Doe" })],
    );
    expect(plan.updates).toEqual([]);
    expect(plan.unmatched).toEqual(["Former Client"]);
  });

  it("writes email even when the phone is rejected", () => {
    const plan = planBackfill(
      [{ name: "Jane Doe", phone: "nope", email: "jane@example.com" }],
      [client({ id: 1, name: "Jane Doe" })],
    );
    expect(plan.updates).toEqual([
      { clientId: 1, clientName: "Jane Doe", email: "jane@example.com" },
    ]);
    expect(plan.skipped[0].field).toBe("phone");
  });
});
