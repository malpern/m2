import { db } from "./index";
import { sessions, clients, packages } from "./schema";
import { eq } from "drizzle-orm";

const SLOT_TIMES: Record<string, string> = {
  "3pm": "15:00", "4pm": "16:00", "5pm": "17:00", "6pm": "18:00",
  "10am": "10:00", "12pm": "12:00", "1:15pm": "13:15", "2pm": "14:00",
};

interface ClientSchedule {
  name: string;
  days: { day: number; slot: string }[];
  attendRate: number;
}

const schedules: ClientSchedule[] = [
  { name: "Reggie Jackson", days: [{ day: 1, slot: "3pm" }, { day: 3, slot: "3pm" }], attendRate: 0.95 },
  { name: "Johnny Bench", days: [{ day: 2, slot: "3pm" }, { day: 4, slot: "3pm" }], attendRate: 0.9 },
  { name: "Pete Rose", days: [{ day: 2, slot: "5pm" }], attendRate: 0.75 },
  { name: "Nolan Ryan", days: [{ day: 1, slot: "5pm" }, { day: 5, slot: "5pm" }], attendRate: 0.85 },
  { name: "Rod Carew", days: [{ day: 1, slot: "6pm" }, { day: 4, slot: "5pm" }], attendRate: 0.88 },
  { name: "Tom Seaver", days: [{ day: 3, slot: "5pm" }, { day: 5, slot: "6pm" }], attendRate: 0.82 },
  { name: "Thurman Munson", days: [{ day: 3, slot: "6pm" }], attendRate: 0.9 },
  { name: "Micah Alpern", days: [{ day: 1, slot: "12pm" }, { day: 3, slot: "12pm" }, { day: 5, slot: "1:15pm" }], attendRate: 0.93 },
];

function getMonday(weeksAgo: number): Date {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - weeksAgo * 7);
  return monday;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function seedSessions() {
  const allClients = await db.select().from(clients).all();

  let totalCreated = 0;
  let totalCompleted = 0;
  let totalCancelled = 0;
  let totalNoShow = 0;

  for (let weeksAgo = 8; weeksAgo >= 1; weeksAgo--) {
    const monday = getMonday(weeksAgo);

    for (const sched of schedules) {
      const client = allClients.find((c) => c.name === sched.name);
      if (!client) continue;

      for (const { day, slot } of sched.days) {
        const sessionDate = new Date(monday);
        sessionDate.setDate(monday.getDate() + day - 1);
        const dateStr = formatDate(sessionDate);
        const time = SLOT_TIMES[slot] ?? "15:00";
        const slotKey = slot.includes("10") ? "3pm" : slot.includes("12") ? "5pm" : slot.includes("1:15") ? "5pm" : slot as "3pm" | "4pm" | "5pm" | "6pm" | "7pm";

        const rand = Math.random();
        let status: "completed" | "cancelled" | "no_show";
        if (rand < sched.attendRate) {
          status = "completed";
          totalCompleted++;
        } else if (rand < sched.attendRate + 0.07) {
          status = "cancelled";
          totalCancelled++;
        } else {
          status = "no_show";
          totalNoShow++;
        }

        const pkg = await db.select().from(packages).where(eq(packages.clientId, client.id)).get();
        const reconciled = Math.random() > 0.15;

        await db.insert(sessions).values({
          clientId: client.id,
          packageId: pkg?.id ?? null,
          scheduledDate: dateStr,
          scheduledTime: time,
          slot: slotKey,
          status,
          loggedToSheets: status === "completed",
          reconciled: status === "completed" ? reconciled : false,
        }).run();

        if (status === "completed" && pkg) {
          await db.update(packages)
            .set({ sessionsUsed: pkg.sessionsUsed + 1 })
            .where(eq(packages.id, pkg.id))
            .run();
        }

        totalCreated++;
      }
    }
  }

  console.log(`Seeded ${totalCreated} sessions over 8 weeks:`);
  console.log(`  ${totalCompleted} completed`);
  console.log(`  ${totalCancelled} cancelled`);
  console.log(`  ${totalNoShow} no-show`);

  const allSessions = await db.select().from(sessions).all();
  const unreconciledCount = allSessions
    .filter(s => s.status === "completed" && !s.reconciled).length;
  console.log(`  ${unreconciledCount} unreconciled (the money leak)`);
}

seedSessions();
