import { db } from "./index";
import { clients, packages } from "./schema";

// clients.phone is UNIQUE in the schema, so every seeded client needs a distinct
// number — this file used to give all nine the same one, which meant the seed could
// never run against the real schema (it only worked against drizzle-test-schema.sql,
// which has drifted and carries no such constraint). These are 555 numbers reserved
// for fiction so they can never reach a real handset, and none is on the dev
// allowlist in lib/twilio.ts, so nothing here can be texted even by accident.
const seedPhone = (i: number) => `+1408555${String(1000 + i).padStart(4, "0")}`;

const mockClients = [
  { name: "Reggie Jackson", phone: seedPhone(0), category: "in_season" as const, gradeLevel: "senior" as const, collegeBound: true, behaviorScore: 9, preferredDays: '["monday","wednesday"]', preferredTime: "3pm", maxSessionsPerWeek: 2, notes: "Top recruit. Committed to training. Wants D1." },
  { name: "Johnny Bench", phone: seedPhone(1), category: "in_season" as const, gradeLevel: "junior" as const, collegeBound: true, behaviorScore: 8, preferredDays: '["tuesday","thursday"]', preferredTime: "3pm", maxSessionsPerWeek: 2, notes: "Strong work ethic. Targeting D2 programs." },
  { name: "Pete Rose", phone: seedPhone(2), category: "in_season" as const, gradeLevel: "junior" as const, collegeBound: true, behaviorScore: 5, preferredDays: '["tuesday","thursday"]', preferredTime: "3pm", maxSessionsPerWeek: 1, notes: "Says he wants college but inconsistent follow-through." },
  { name: "Nolan Ryan", phone: seedPhone(3), category: "active" as const, gradeLevel: "senior" as const, collegeBound: false, behaviorScore: 7, preferredDays: '["monday","friday"]', preferredTime: "5pm", maxSessionsPerWeek: 1, notes: "Consistent but not pursuing college ball." },
  { name: "Rod Carew", phone: seedPhone(4), category: "active" as const, gradeLevel: "junior" as const, collegeBound: false, behaviorScore: 7, preferredDays: '["monday","thursday"]', preferredTime: "5pm", maxSessionsPerWeek: 1, notes: "Reliable. Always on time." },
  { name: "Tom Seaver", phone: seedPhone(5), category: "active" as const, gradeLevel: "sophomore" as const, collegeBound: false, behaviorScore: 6, preferredDays: '["wednesday","friday"]', preferredTime: "5pm", maxSessionsPerWeek: 1, notes: "Good attitude. Still developing." },
  { name: "Thurman Munson", phone: seedPhone(6), category: "active" as const, gradeLevel: "freshman" as const, collegeBound: false, behaviorScore: 8, preferredDays: '["wednesday"]', preferredTime: "6pm", maxSessionsPerWeek: 1, notes: "New but eager. Great effort every session." },
  { name: "Catfish Hunter", phone: seedPhone(7), category: "on_break" as const, gradeLevel: "senior" as const, collegeBound: false, behaviorScore: 4, preferredDays: '["friday"]', preferredTime: "flexible", maxSessionsPerWeek: 1, notes: "Taking a break. Check back in a few weeks." },
  { name: "Micah Alpern", phone: seedPhone(8), category: "active" as const, gradeLevel: "adult" as const, collegeBound: false, behaviorScore: 10, preferredDays: '["monday","wednesday","friday"]', preferredTime: "M 12pm, W 12pm, F 1:15pm", maxSessionsPerWeek: 3, notes: "Regular client, not an athlete. Fixed schedule: Mon 12, Wed 12, Fri 1:15." },
];

const mockPackages = [
  { clientName: "Reggie Jackson", totalSessions: 20, sessionsUsed: 12 },
  { clientName: "Johnny Bench", totalSessions: 10, sessionsUsed: 7 },
  { clientName: "Pete Rose", totalSessions: 10, sessionsUsed: 5 },
  { clientName: "Nolan Ryan", totalSessions: 10, sessionsUsed: 9 },
  { clientName: "Rod Carew", totalSessions: 10, sessionsUsed: 6 },
  { clientName: "Tom Seaver", totalSessions: 10, sessionsUsed: 3 },
  { clientName: "Thurman Munson", totalSessions: 5, sessionsUsed: 1 },
  { clientName: "Catfish Hunter", totalSessions: 10, sessionsUsed: 4 },
  { clientName: "Micah Alpern", totalSessions: 30, sessionsUsed: 0 },
];

async function seed() {
  console.log("Seeding database...");

  const inserted = await db.insert(clients).values(mockClients).returning().all();

  for (const pkg of mockPackages) {
    const client = inserted.find((c) => c.name === pkg.clientName);
    if (client) {
      await db.insert(packages)
        .values({
          clientId: client.id,
          totalSessions: pkg.totalSessions,
          sessionsUsed: pkg.sessionsUsed,
        })
        .run();
    }
  }

  console.log(`Seeded ${inserted.length} clients and ${mockPackages.length} packages.`);
}

seed();
