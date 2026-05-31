import { db } from "@/db";
import { defaultAvailability, weeklyOverrides } from "@/db/schema";
import { eq } from "drizzle-orm";

const SLOTS = ["3pm", "4pm", "5pm", "6pm", "7pm"];
const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "sunday"];

function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().split("T")[0];
}

export async function isVacationWeek(weekOf: string): Promise<boolean> {
  const monday = getMondayOfWeek(weekOf);

  const defaults = await db.select().from(defaultAvailability).all();
  const overrides = await db.select().from(weeklyOverrides).where(eq(weeklyOverrides.weekOf, monday)).all();

  const availMap = new Map<string, boolean>();
  for (const d of defaults) availMap.set(`${d.day}:${d.slot}`, d.enabled);
  for (const o of overrides) availMap.set(`${o.day}:${o.slot}`, o.enabled);

  for (const day of WEEK_DAYS) {
    for (const slot of SLOTS) {
      const key = `${day}:${slot}`;
      const enabled = availMap.get(key);
      if (enabled === undefined || enabled === true) return false;
    }
  }

  return true;
}
